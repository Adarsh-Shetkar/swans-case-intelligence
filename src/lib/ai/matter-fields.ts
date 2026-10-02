import { hashRecordContent } from "./hash";

/**
 * Matter custom fields (Clio `Matter.custom_field_values`) hold some of the
 * highest-signal facts in a case (estimated value, policy limits, medical
 * specials, liens) but they are NOT notes/emails/tasks, so without this module
 * the digest pipeline cannot see or cite them.
 *
 * This module is pure: no Clio calls, no DB, no AI. Person A's ingestion
 * fetches the matter with
 *   fields=id,updated_at,custom_field_values{id,value,field_name,field_type}
 * and passes the result to `normalizeMatterFields`, then upserts the output
 * as SourceRecords exactly like notes/emails/tasks.
 *
 * Nothing here knows about any specific case. Field *roles* are inferred from
 * generic personal-injury vocabulary in the field NAME, and money is parsed
 * deterministically from the VALUE.
 */

/** Shape of one entry in Clio's `custom_field_values` (read side). */
export interface ClioCustomFieldValue {
  id?: string | number | null;
  field_name?: string | null;
  /** Optional but recommended in the request; used only as a hint. */
  field_type?: string | null;
  value?: unknown;
}

export type MatterFieldRole =
  | "case_value"
  | "medical_specials"
  | "coverage_limits"
  | "carrier"
  | "lien"
  | "wage_loss"
  | "rationale"
  | "flag"
  | "other";

/**
 * Ordered: first match wins. Order matters, e.g. "Health Insurance or Lien
 * Holder" must resolve to `lien` before `carrier` sees the word "insurance".
 */
const ROLE_RULES: { role: MatterFieldRole; test: RegExp }[] = [
  { role: "rationale", test: /(rationale|reasoning|valuation notes?)/i },
  { role: "lien", test: /\blien/i },
  { role: "case_value", test: /(case value|estimated value|settlement value|case valuation|demand)/i },
  { role: "medical_specials", test: /(special|medical (bills|expenses|costs))/i },
  { role: "coverage_limits", test: /(policy limit|coverage|limits?\b)/i },
  { role: "carrier", test: /(carrier|insurer|insurance)/i },
  { role: "wage_loss", test: /(wage|lost earnings|lost income|economic loss)/i },
];

/** Roles whose numeric values are dollar amounts. */
const MONEY_ROLES: ReadonlySet<MatterFieldRole> = new Set([
  "case_value",
  "medical_specials",
  "wage_loss",
]);

export function classifyMatterField(fieldName: string, value?: unknown): MatterFieldRole {
  if (typeof value === "boolean") return "flag";
  for (const rule of ROLE_RULES) {
    if (rule.test.test(fieldName)) return rule.role;
  }
  return "other";
}

/**
 * Parses a value that IS a single dollar amount ("$118,400.00", 375000).
 * Returns null for prose, so "Defendant liability: $100,000 / $300,000" is
 * never collapsed into one misleading number: it stays text, shown verbatim
 * with its evidence link.
 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
}

/** All dollar amounts mentioned in prose, in order. For display/search only. */
export function extractMoneyAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g)) {
    out.push(Number(m[1].replace(/,/g, "") + (m[2] ?? "")));
  }
  return out;
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function displayValue(role: MatterFieldRole, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return MONEY_ROLES.has(role) ? formatUsd(value) : String(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    const money = MONEY_ROLES.has(role) ? parseMoney(t) : null;
    return money !== null ? formatUsd(money) : t;
  }
  // Unexpected structured value (e.g. a contact reference). Keep it, bounded.
  const json = JSON.stringify(value);
  return json && json !== "{}" && json !== "[]" ? json.slice(0, 500) : null;
}

/** What the ingestion layer upserts as a SourceRecord. */
export interface MatterFieldRecordInput {
  clioType: "matter_field";
  /** `<matterId>:<fieldValueId>`, stable across syncs. */
  clioId: string;
  occurredAt: Date;
  author: null;
  subject: string;
  excerpt: string;
  rawContent: string;
  contentHash: string;
}

/**
 * Hashes use a FIXED timestamp so a field's hash depends only on its name and
 * value. If the hash included `matter.updated_at`, any unrelated matter edit
 * (status change, description tweak) would re-hash every field and defeat the
 * "zero AI calls when nothing changed" guarantee.
 */
const HASH_EPOCH = "1970-01-01T00:00:00.000Z";

export function normalizeMatterFields(
  matterId: string | number,
  matterUpdatedAt: string | Date,
  fields: ClioCustomFieldValue[]
): MatterFieldRecordInput[] {
  const occurredAt = matterUpdatedAt instanceof Date ? matterUpdatedAt : new Date(matterUpdatedAt);
  const out: MatterFieldRecordInput[] = [];

  for (const f of fields ?? []) {
    const label = (f.field_name ?? "").trim();
    if (!label) continue; // can't cite or classify an unlabeled value
    const role = classifyMatterField(label, f.value);
    const shown = displayValue(role, f.value);
    if (shown === null) continue;

    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const content = `${label}: ${shown}`;
    out.push({
      clioType: "matter_field",
      clioId: `${matterId}:${f.id ?? slug}`,
      occurredAt,
      author: null,
      subject: label,
      excerpt: content.length > 280 ? `${content.slice(0, 277)}...` : content,
      rawContent: content,
      contentHash: hashRecordContent({
        clioType: "matter_field",
        occurredAt: HASH_EPOCH,
        subject: label,
        content,
      }),
    });
  }
  return out;
}

/** A displayable, citable fact derived with no AI. */
export interface MatterFieldFact {
  role: MatterFieldRole;
  label: string;
  /** Present only when the value is exactly one dollar amount. */
  amount: number | null;
  /** Verbatim text for the UI; for prose roles this is the whole field. */
  text: string;
  /** Ties the fact to its SourceRecord for the evidence drawer. */
  clioId: string;
}

/**
 * Derives facts straight from the raw Clio fields (same inputs as
 * `normalizeMatterFields`), so the role is classified from the real value type
 * rather than re-parsed from display text.
 */
export function deriveMatterFieldFacts(
  matterId: string | number,
  fields: ClioCustomFieldValue[]
): MatterFieldFact[] {
  const out: MatterFieldFact[] = [];
  for (const f of fields ?? []) {
    const label = (f.field_name ?? "").trim();
    if (!label) continue;
    const role = classifyMatterField(label, f.value);
    const text = displayValue(role, f.value);
    if (text === null) continue;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    out.push({
      role,
      label,
      amount: MONEY_ROLES.has(role) ? parseMoney(f.value) : null,
      text,
      clioId: `${matterId}:${f.id ?? slug}`,
    });
  }
  return out;
}
