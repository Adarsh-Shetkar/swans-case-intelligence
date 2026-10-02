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
import { classifyMatterField } from "./matter-fields";

const DEFAULT_MAX_CANDIDATES = Number(process.env.AI_INSIGHT_MAX_RECORDS ?? 60);
const MAX_COMMUNICATIONS = 15;
const MAX_KEYWORD_MATCHES = 25;
/** Matter fields are small and high-signal, but still bounded. */
const MAX_MATTER_FIELDS = 20;

/**
 * Insights (posture, injuries, last contact, financial/coverage, blockers)
 * are a holistic snapshot of the WHOLE case, not an additive log like
 * CaseEvents, so insight synthesis needs enough of the case's full context to
 * stay coherent across digest runs. Sending every record would make cost scale
 * with case size, so this deterministic pass (no AI, no cost) picks a bounded
 * subset before the one synthesis call:
 *
 *   0. Matter custom fields (value, coverage, specials, liens...). Always
 *      eligible because they are the authoritative financial/coverage facts,
 *      but capped, and counted against `maxCandidates` so the overall budget
 *      still holds. Fields whose name maps to a known role win over "other".
 *   1. The most recent communications (drives `last_contact` correctness).
 *   2. Records matching insight-relevant keyword categories.
 *   3. The most recent records overall, filling any remaining budget.
 *
 * Matter fields only enter through step 0, so MAX_MATTER_FIELDS is a hard
 * cap: the keyword and recency passes skip them, otherwise leftover fields
 * would leak back in whenever the overall budget had room.
 */
export function selectInsightCandidates(
  records: RawRecordForPrompt[],
  maxCandidates: number = DEFAULT_MAX_CANDIDATES
): RawRecordForPrompt[] {
  const byRecencyDesc = [...records].sort((a, b) => toTime(b.occurredAt) - toTime(a.occurredAt));
  const selected = new Map<string, RawRecordForPrompt>();

  const fieldBudget = Math.min(MAX_MATTER_FIELDS, maxCandidates);
  const fields = records
    .filter((r) => r.clioType === "matter_field")
    .sort((a, b) => fieldPriority(a) - fieldPriority(b)); // stable: ties keep input order
  for (const r of fields) {
    if (selected.size >= fieldBudget) break;
    selected.set(r.sourceRecordId, r);
  }

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
    if (selected.has(r.sourceRecordId) || r.clioType === "matter_field") continue;
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
    if (selected.has(r.sourceRecordId) || r.clioType === "matter_field") continue;
    selected.set(r.sourceRecordId, r);
  }

  return [...selected.values()].sort((a, b) => toTime(b.occurredAt) - toTime(a.occurredAt));
}

function fieldPriority(r: RawRecordForPrompt): number {
  return classifyMatterField(r.subject ?? "") === "other" ? 1 : 0;
}

function toTime(d: string | Date): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}
