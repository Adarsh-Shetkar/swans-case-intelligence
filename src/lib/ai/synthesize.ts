import { generateStructured } from "./gemini";
import { InsightBatch } from "./schemas";
import { buildSynthesizeInsightsPrompt } from "./prompts";
import { prepareSingleBatch, type RawRecordForPrompt } from "./prepare";
import { selectInsightCandidates } from "./select-insight-candidates";
import { AiValidationError } from "./types";

export interface SynthesizedInsight {
  type: string;
  label: string;
  value: string;
  confidence: string;
  sourceRecordIds: string[];
}

export interface SynthesizeResult {
  insights: SynthesizedInsight[];
  /** Set when the AI call failed validation twice; insights is [] in that case. */
  error?: string;
  usage: { inputTokens: number; outputTokens: number; calls: number; usedStub: boolean };
  candidateRecordCount: number;
  totalRecordCount: number;
}

const CONFIDENCE_RANK: Record<string, number> = {
  observed: 3,
  ai_synthesis: 2,
  inferred: 1,
  unknown: 0,
};

/**
 * Produces the headline Insights (posture, injury, last_contact, blocker,
 * financial, coverage) for a matter from its full relevant record set.
 *
 * Unlike categorizeAndRankEvents, this is a SINGLE AI call over a
 * deterministically bounded candidate set (see select-insight-candidates.ts)
 * rather than a chunked, additive pass — insights are a holistic snapshot,
 * and reconciling conflicting "posture" statements from multiple chunks
 * would need its own merge logic that's safer to avoid by bounding the
 * input up front instead.
 */
export async function synthesizeInsights(
  matterId: string,
  allRelevantRecords: RawRecordForPrompt[]
): Promise<SynthesizeResult> {
  const candidates = selectInsightCandidates(allRelevantRecords);

  if (candidates.length === 0) {
    return {
      insights: [],
      usage: { inputTokens: 0, outputTokens: 0, calls: 0, usedStub: false },
      candidateRecordCount: 0,
      totalRecordCount: allRelevantRecords.length,
    };
  }

  const batch = prepareSingleBatch(candidates);
  const refToId = new Map(batch.map((r) => [r.ref, r.sourceRecordId]));

  try {
    const result = await generateStructured({
      prompt: buildSynthesizeInsightsPrompt(batch),
      schema: InsightBatch,
      meta: { matterId, stage: "synthesize_insights" },
      records: batch,
    });

    // "last_contact" is computed deterministically by run-digest.ts (see
    // compute-last-contact.ts) and is no longer requested in the prompt --
    // drop it defensively if a model produces one anyway, so run-digest.ts
    // never has to reconcile two different last_contact claims.
    const filteredDrafts = result.data.insights.filter((d) => d.type !== "last_contact");

    const insights: SynthesizedInsight[] = filteredDrafts.map((draft) => {
      const sourceRecordIds = resolveRefs(draft.sourceRefs, refToId);

      // The schema only requires sourceRefs to be non-empty when confidence
      // isn't "unknown" — it doesn't guarantee those refs actually resolved
      // to real records in THIS batch. If every cited ref was invalid (a
      // hallucinated or cross-batch ref slipping through), the claim has no
      // real evidence behind it: downgrade to "unknown" rather than show a
      // confident, unsupported statement.
      const hallucinatedCitation = draft.confidence !== "unknown" && sourceRecordIds.length === 0;

      return {
        type: draft.type,
        label: draft.label,
        value: hallucinatedCitation ? `${draft.value} (evidence could not be verified)` : draft.value,
        confidence: hallucinatedCitation ? "unknown" : draft.confidence,
        sourceRecordIds,
      };
    });

    return {
      insights: dedupeInsightsByType(insights),
      usage: {
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        calls: 1,
        usedStub: result.usedStub,
      },
      candidateRecordCount: candidates.length,
      totalRecordCount: allRelevantRecords.length,
    };
  } catch (err) {
    const message = err instanceof AiValidationError ? err.message : String(err);
    // Fail soft: the caller (lib/ai/digest orchestration, step 6) logs this
    // as a failed ProcessingJob and simply keeps serving the previous
    // digest's insights rather than wiping them out because this run failed.
    return {
      insights: [],
      error: message,
      usage: { inputTokens: 0, outputTokens: 0, calls: 1, usedStub: false },
      candidateRecordCount: candidates.length,
      totalRecordCount: allRelevantRecords.length,
    };
  }
}

function resolveRefs(refs: string[], refToId: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const ref of refs) {
    const id = refToId.get(ref);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * The model is told to emit at most one insight per type, but we never
 * trust that blindly — if duplicates slip through, keep only the one with
 * the strongest confidence level rather than showing both or picking
 * arbitrarily.
 */
function dedupeInsightsByType(insights: SynthesizedInsight[]): SynthesizedInsight[] {
  const byType = new Map<string, SynthesizedInsight>();
  for (const insight of insights) {
    const existing = byType.get(insight.type);
    if (!existing || CONFIDENCE_RANK[insight.confidence] > CONFIDENCE_RANK[existing.confidence]) {
      byType.set(insight.type, insight);
    }
  }
  return [...byType.values()];
}
