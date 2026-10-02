/**
 * These keyword lists are intentionally generic personal-injury-domain
 * terms (not Sapini-specific facts) used for two legitimate, deterministic
 * purposes:
 *   1. lib/ai/select-insight-candidates.ts — cheaply pre-filtering which
 *      records are even worth sending to the (expensive, slow) AI call for
 *      insight synthesis, regardless of which matter they belong to.
 *   2. lib/ai/stub.ts — producing realistic-looking stand-in output in stub
 *      mode, still derived from whatever records are actually passed in.
 *
 * Neither use hardcodes a fact about any specific case — they only decide
 * what to look at or how to label something generically.
 */

export const INJURY_KEYWORDS = [
  "shoulder",
  "knee",
  "spine",
  "cervical",
  "lumbar",
  "concussion",
  "head injury",
  "fracture",
  "whiplash",
  "back",
  "neck",
];

export const SURGERY_KEYWORDS = ["surgery", "surgical", "operate", "procedure scheduled"];

export const COVERAGE_KEYWORDS = ["policy limit", "coverage", "insurance", "liability limit"];

export const DEADLINE_KEYWORDS = ["deadline", "due", "statute of limitations", "sol "];

export const FINANCIAL_KEYWORDS = [
  "expense",
  "cost",
  "bill",
  "invoice",
  "lien",
  "specials",
  "settlement",
  "estimated case value",
  "medical specials",
];

export const BLOCKER_KEYWORDS = [
  "waiting on",
  "pending",
  "outstanding",
  "overdue",
  "unscheduled",
  "awaiting",
];

export function matchesAnyKeyword(text: string, keywordSets: string[][]): boolean {
  const t = text.toLowerCase();
  return keywordSets.some((set) => set.some((k) => t.includes(k)));
}
