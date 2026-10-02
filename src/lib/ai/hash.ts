import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Canonical content hash for a single SourceRecord. Person A's normalizer
 * calls this when upserting a record from Clio; the digest engine compares
 * the live value against `SourceRecord.lastDigestedContentHash` to decide
 * whether that record needs to go through the AI pipeline again.
 *
 * Deliberately field-scoped rather than hashing the whole raw Clio payload:
 * only fields that actually affect AI output (what/when/who/subject/body)
 * should trigger reprocessing. A Clio-side metadata change that doesn't
 * touch any of these (e.g. an internal folder move) won't cause churn.
 */
export function hashRecordContent(fields: {
  clioType: string;
  occurredAt: string | Date;
  author?: string | null;
  subject?: string | null;
  content: string;
}): string {
  const occurredAtIso =
    typeof fields.occurredAt === "string" ? fields.occurredAt : fields.occurredAt.toISOString();
  // \u0001 as a separator makes accidental field-boundary collisions
  // (e.g. author "A" + subject "B" vs author "AB" + subject "") effectively
  // impossible without relying on JSON.stringify's own escaping rules.
  const normalized = [
    fields.clioType,
    occurredAtIso,
    fields.author ?? "",
    fields.subject ?? "",
    fields.content ?? "",
  ].join("\u0001");
  return sha256(normalized);
}

/**
 * Hash over the entire set of (sourceRecordId, contentHash) pairs currently
 * relevant to a matter. This is the matter-level fingerprint stored as
 * `Digest.inputHash`: if two runs produce the same value, NOTHING relevant
 * has changed — not a single record added, removed, or edited — and the
 * digest engine can skip AI calls entirely and serve the existing
 * CaseEvents/Insights as-is.
 *
 * Order-independent by design (sorted before hashing) so re-fetching the
 * same records in a different order never looks like a change.
 */
export function computeInputHash(pairs: { sourceRecordId: string; contentHash: string }[]): string {
  const sorted = [...pairs].sort((a, b) => a.sourceRecordId.localeCompare(b.sourceRecordId));
  const joined = sorted.map((p) => `${p.sourceRecordId}:${p.contentHash}`).join("|");
  return sha256(joined);
}
