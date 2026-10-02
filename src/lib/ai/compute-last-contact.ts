/**
 * Deterministic "last contact" computation -- no LLM involved.
 *
 * This used to be synthesized by the LLM alongside posture/injury/
 * financial/coverage/blocker insights, but "find the most recent
 * communication-type record" is a plain MAX(occurredAt) query -- it needs
 * no reasoning, costs nothing, and can never hallucinate a date. Per the
 * team's split: deterministic logic first for anything that doesn't
 * actually need an LLM (overdue/upcoming -- see compute-actions.ts -- and
 * this).
 */

export interface CommunicationLikeRecord {
  id: string;
  clioType: string;
  occurredAt: Date;
  subject: string | null;
}

export interface LastContactInsight {
  type: "last_contact";
  label: string;
  value: string;
  confidence: "observed" | "unknown";
  sourceRecordIds: string[];
}

export function computeLastContact(records: CommunicationLikeRecord[]): LastContactInsight {
  const communications = records
    .filter((r) => r.clioType === "communication")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  if (communications.length === 0) {
    return {
      type: "last_contact",
      label: "Last client contact",
      value: "No communication records found",
      confidence: "unknown",
      sourceRecordIds: [],
    };
  }

  const latest = communications[0];
  return {
    type: "last_contact",
    label: "Last client contact",
    value: `${latest.occurredAt.toISOString()}${latest.subject ? ` — ${latest.subject}` : ""}`,
    confidence: "observed",
    sourceRecordIds: [latest.id],
  };
}
