import { classifyMatterField, type MatterFieldRole } from "./matter-fields";

/**
 * Deterministic financial/coverage insight extraction from already-normalized
 * `matter_field` SourceRecords -- no LLM involved.
 *
 * REAL-DATA FINDING: inspecting an actual Clio matter export (Sapini), the
 * most important financial/coverage facts in the case -- Estimated Case
 * Value ($375,000), Policy Limits, Medical Specials To Date ($118,400),
 * Insurance Carrier -- live as Matter.custom_field_values, not scattered in
 * notes/emails. matter-fields.ts normalizes these into `matter_field`
 * SourceRecords; this function turns the financially/coverage-relevant ones
 * into Insight rows directly, reusing the same role classification
 * matter-fields.ts already uses (so it works for ANY matter's custom field
 * names, not a hardcoded list) rather than relying on an LLM to notice and
 * restate a dollar figure it could get wrong.
 *
 * Deliberately narrow: only roles that map cleanly to a headline financial
 * or coverage fact are surfaced here. `rationale` (internal valuation
 * reasoning) and `flag` (booleans like "Policy Limits Confirmed") stay as
 * SourceRecords only -- citable as evidence, but not promoted to a
 * standalone Insight. This also matters for provider-visibility: rationale
 * fields are specifically called out as internal-strategy content that
 * must not leak to the provider lens (see README).
 */

export interface MatterFieldSourceRecord {
  id: string;
  clioType: string;
  subject: string | null;
  rawContent: string | null;
}

export interface DeterministicFieldInsight {
  type: "financial" | "coverage";
  label: string;
  value: string;
  confidence: "observed";
  sourceRecordIds: string[];
}

const ROLE_TO_INSIGHT_TYPE: Partial<Record<MatterFieldRole, "financial" | "coverage">> = {
  case_value: "financial",
  medical_specials: "financial",
  wage_loss: "financial",
  coverage_limits: "coverage",
  carrier: "coverage",
  lien: "coverage",
};

function stripLabelPrefix(label: string, rawContent: string): string {
  const prefix = `${label}: `;
  return rawContent.startsWith(prefix) ? rawContent.slice(prefix.length) : rawContent;
}

/**
 * `classifyMatterField(name, value)` needs the ORIGINAL value to correctly
 * detect a boolean "flag" field (e.g. "Policy Limits Confirmed" would
 * otherwise name-match the "coverage_limits" rule just from the word
 * "limits" in its name). By the time a record reaches this function, it has
 * already been normalized into a SourceRecord -- the raw boolean is gone,
 * only its rendered text remains. matter-fields.ts always renders a boolean
 * as the exact string "Yes" or "No" (see `displayValue`), so recognizing
 * that exact rendering is how we recover "this was a flag" without the
 * original value. This was caught by a test expecting "Policy Limits
 * Confirmed" to be excluded, which failed before this check was added.
 */
function looksLikeRenderedBoolean(value: string): boolean {
  return value === "Yes" || value === "No";
}

export function computeMatterFieldInsights(records: MatterFieldSourceRecord[]): DeterministicFieldInsight[] {
  const insights: DeterministicFieldInsight[] = [];

  for (const r of records) {
    if (r.clioType !== "matter_field" || !r.subject || !r.rawContent) continue;

    const strippedValue = stripLabelPrefix(r.subject, r.rawContent);
    if (looksLikeRenderedBoolean(strippedValue)) continue;

    const role = classifyMatterField(r.subject);
    const insightType = ROLE_TO_INSIGHT_TYPE[role];
    if (!insightType) continue;

    insights.push({
      type: insightType,
      label: r.subject,
      value: strippedValue,
      confidence: "observed",
      sourceRecordIds: [r.id],
    });
  }

  return insights;
}

