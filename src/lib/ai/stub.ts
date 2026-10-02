import type { CitableRecord, AiCallMeta } from "./types";
import { INJURY_KEYWORDS, SURGERY_KEYWORDS, COVERAGE_KEYWORDS, DEADLINE_KEYWORDS } from "./keywords";

/**
 * Deterministic stand-ins for real Gemini calls, used when AI_USE_STUB=true
 * or no API key is configured.
 *
 * Important: these derive their output entirely from whatever `records` are
 * passed in via simple heuristics — they do NOT contain any Sapini-specific
 * or otherwise hardcoded case content. That means they work against any
 * matter's real data and let Person A/C exercise the full pipeline
 * (digest versioning, persistence, evidence linking, the frontend) before a
 * Gemini API key exists or while iterating without burning quota. They are
 * intentionally unsophisticated — they are plumbing, not a summarizer.
 */

function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (SURGERY_KEYWORDS.some((k) => t.includes(k))) return "surgery";
  if (COVERAGE_KEYWORDS.some((k) => t.includes(k))) return "coverage";
  if (DEADLINE_KEYWORDS.some((k) => t.includes(k))) return "deadline";
  if (INJURY_KEYWORDS.some((k) => t.includes(k))) return "treatment";
  return "other";
}

function stubCategorizeEvents(records: CitableRecord[]) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
  const substantive = sorted.filter((r) => r.content && r.content.trim().length > 20);
  const chosen = substantive.slice(0, Math.min(8, substantive.length));
  const chosenRefs = new Set(chosen.map((r) => r.ref));

  const events = chosen.map((r) => {
    const recencyRank = sorted.findIndex((s) => s.ref === r.ref);
    return {
      title: (r.subject || `${r.clioType} update`).slice(0, 140),
      category: guessCategory(`${r.subject ?? ""} ${r.content}`),
      importance: Math.max(20, 80 - recencyRank * 5),
      summary: r.content.slice(0, 200),
      occurredAt: r.occurredAt,
      sourceRefs: [r.ref],
    };
  });

  const skipped = sorted
    .filter((r) => !chosenRefs.has(r.ref))
    .map((r) => ({ ref: r.ref, reason: "stub: not among most recent substantive records" }));

  return { events, skipped };
}

function stubSynthesizeInsights(records: CitableRecord[]) {
  const insights: Record<string, unknown>[] = [];

  // last_contact is deliberately NOT produced here -- it's computed
  // deterministically by compute-last-contact.ts in both stub and real
  // modes (see run-digest.ts), matching the real pipeline's prompt, which
  // no longer asks the model for it either.

  const injuryRecord = records.find((r) =>
    INJURY_KEYWORDS.some((k) => r.content.toLowerCase().includes(k))
  );
  if (injuryRecord) {
    const hit = INJURY_KEYWORDS.find((k) => injuryRecord.content.toLowerCase().includes(k))!;
    insights.push({
      type: "injury",
      label: "Primary injury (stub heuristic)",
      value: hit,
      confidence: "inferred",
      sourceRefs: [injuryRecord.ref],
    });
  }

  const coverageRecord = records.find((r) =>
    COVERAGE_KEYWORDS.some((k) => r.content.toLowerCase().includes(k))
  );
  insights.push(
    coverageRecord
      ? {
          type: "coverage",
          label: "Coverage",
          value: coverageRecord.content.slice(0, 200),
          confidence: "ai_synthesis",
          sourceRefs: [coverageRecord.ref],
        }
      : {
          type: "coverage",
          label: "Coverage",
          value: "Not stated in available records",
          confidence: "unknown",
          sourceRefs: [],
        }
  );

  insights.push({
    type: "posture",
    label: "Case posture",
    value: `${records.length} records on file (stub summary — real pipeline synthesizes this)`,
    confidence: "unknown",
    sourceRefs: [],
  });

  return { insights };
}

function stubExtractDocument() {
  // Document extraction isn't wired into the main digest loop in this
  // 4-hour scope (see README "deferred"), so the stub returns an empty,
  // schema-valid batch rather than fabricating medical facts.
  return { facts: [] };
}

export function run(stage: AiCallMeta["stage"], records: CitableRecord[] = []): unknown {
  switch (stage) {
    case "categorize_events":
      return stubCategorizeEvents(records);
    case "synthesize_insights":
      return stubSynthesizeInsights(records);
    case "extract_document":
      return stubExtractDocument();
    default: {
      const _exhaustive: never = stage;
      throw new Error(`stub: unknown stage ${_exhaustive}`);
    }
  }
}
