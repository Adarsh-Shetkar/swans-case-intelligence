import type { RawRecordForPrompt } from "./prepare";
import {
  INJURY_KEYWORDS,
  SURGERY_KEYWORDS,
  COVERAGE_KEYWORDS,
  DEADLINE_KEYWORDS,
  FINANCIAL_KEYWORDS,
  BLOCKER_KEYWORDS,
  matchesAnyKeyword,
} from "./keywords";

const DEFAULT_MAX_CANDIDATES = Number(process.env.AI_INSIGHT_MAX_RECORDS ?? 60);
const MAX_COMMUNICATIONS = 15;
const MAX_KEYWORD_MATCHES = 25;

/**
 * Insights (posture, injuries, last contact, financial/coverage, blockers)
 * are a holistic snapshot of the WHOLE case, not an additive log like
 * CaseEvents — so unlike categorizeAndRankEvents, which only needs to see
 * this run's new/changed records, insight synthesis needs enough of the
 * case's full context to stay coherent across digest runs. Sending literally
 * every record for every case would make cost scale with case size with no
 * ceiling, so this deterministic pass (no AI, no cost) picks a bounded,
 * relevant subset before the one synthesis call:
 *
 *   1. The most recent communications (drives `last_contact` correctness).
 *   2. Records matching insight-relevant keyword categories (drives
 *      injury/surgery/coverage/financial/blocker insights).
 *   3. The most recent records overall, to fill any remaining budget with
 *      general context for the `posture` insight.
 *
 * This is exactly the kind of filtering the brief calls out as better done
 * deterministically than left to the model.
 */
export function selectInsightCandidates(
  records: RawRecordForPrompt[],
  maxCandidates: number = DEFAULT_MAX_CANDIDATES
): RawRecordForPrompt[] {
  const byRecencyDesc = [...records].sort((a, b) => toTime(b.occurredAt) - toTime(a.occurredAt));
  const selected = new Map<string, RawRecordForPrompt>();

  let communicationsPicked = 0;
  for (const r of byRecencyDesc) {
    if (selected.size >= maxCandidates || communicationsPicked >= MAX_COMMUNICATIONS) break;
    if (r.clioType !== "communication") continue;
    selected.set(r.sourceRecordId, r);
    communicationsPicked += 1;
  }

  let keywordMatches = 0;
  for (const r of byRecencyDesc) {
    if (selected.size >= maxCandidates || keywordMatches >= MAX_KEYWORD_MATCHES) break;
    if (selected.has(r.sourceRecordId)) continue;
    const text = `${r.subject ?? ""} ${r.content ?? ""}`;
    if (
      matchesAnyKeyword(text, [
        INJURY_KEYWORDS,
        SURGERY_KEYWORDS,
        COVERAGE_KEYWORDS,
        DEADLINE_KEYWORDS,
        FINANCIAL_KEYWORDS,
        BLOCKER_KEYWORDS,
      ])
    ) {
      selected.set(r.sourceRecordId, r);
      keywordMatches += 1;
    }
  }

  for (const r of byRecencyDesc) {
    if (selected.size >= maxCandidates) break;
    if (selected.has(r.sourceRecordId)) continue;
    selected.set(r.sourceRecordId, r);
  }

  return [...selected.values()].sort((a, b) => toTime(b.occurredAt) - toTime(a.occurredAt));
}

function toTime(d: string | Date): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}
