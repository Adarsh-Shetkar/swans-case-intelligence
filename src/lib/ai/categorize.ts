import { generateStructured } from "./gemini";
import { CaseEventBatch } from "./schemas";
import { buildCategorizeEventsPrompt } from "./prompts";
import { prepareRecordBatches, type RawRecordForPrompt } from "./prepare";
import { AiValidationError } from "./types";

export interface CategorizedEvent {
  title: string;
  category: string;
  importance: number;
  summary: string;
  occurredAt: string;
  /** Resolved real SourceRecord ids — never the model's raw "r3"-style refs. */
  sourceRecordIds: string[];
}

export interface CategorizeResult {
  events: CategorizedEvent[];
  /** Real SourceRecord ids the model deliberately did not turn into an event. */
  skippedSourceRecordIds: string[];
  /**
   * Every SourceRecord id that was part of a chunk that completed
   * successfully — whether it became an event, was explicitly skipped, or
   * was simply omitted by the model's output. The caller (run-digest.ts)
   * marks exactly these ids as digested; nothing else, so an id can never
   * be marked "done" without actually having been seen by a successful call.
   */
  processedSourceRecordIds: string[];
  /**
   * SourceRecord ids that were part of a chunk whose AI call failed. These
   * are deliberately NOT marked as digested, so they remain eligible to be
   * retried on the next digest run instead of silently lost.
   */
  failedSourceRecordIds: string[];
  /** Per-chunk failures. A chunk failing does not fail the whole run. */
  errors: { chunkIndex: number; message: string }[];
  usage: { inputTokens: number; outputTokens: number; calls: number; usedStub: boolean };
}

/**
 * Turns raw records into ranked, evidence-linked CaseEvents.
 *
 * Fail-soft by design: if one chunk's AI call fails validation twice (see
 * lib/ai/gemini.ts), that chunk's records simply produce no events this
 * run and the failure is reported in `errors` for the caller to log as a
 * ProcessingJob — they are NOT marked as digested, so they remain eligible
 * to be retried on the next digest run rather than silently lost.
 */
export async function categorizeAndRankEvents(
  matterId: string,
  records: RawRecordForPrompt[]
): Promise<CategorizeResult> {
  if (records.length === 0) {
    return {
      events: [],
      skippedSourceRecordIds: [],
      processedSourceRecordIds: [],
      failedSourceRecordIds: [],
      errors: [],
      usage: { inputTokens: 0, outputTokens: 0, calls: 0, usedStub: false },
    };
  }

  const batches = prepareRecordBatches(records);
  const events: CategorizedEvent[] = [];
  const skipped: string[] = [];
  const processed: string[] = [];
  const failed: string[] = [];
  const errors: { chunkIndex: number; message: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let usedStub = false;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const refToId = new Map(batch.map((r) => [r.ref, r.sourceRecordId]));
    const batchRecordIds = batch.map((r) => r.sourceRecordId);

    try {
      const result = await generateStructured({
        prompt: buildCategorizeEventsPrompt(batch),
        schema: CaseEventBatch,
        meta: { matterId, stage: "categorize_events" },
        records: batch,
      });

      calls += 1;
      usedStub = result.usedStub;
      inputTokens += result.inputTokens ?? 0;
      outputTokens += result.outputTokens ?? 0;

      for (const draft of result.data.events) {
        const sourceRecordIds = resolveRefs(draft.sourceRefs, refToId);
        if (sourceRecordIds.length === 0) {
          // Every ref the model cited turned out to be invalid/hallucinated
          // for this batch. The schema required >=1 ref, but we never trust
          // that blindly — an event with zero resolvable evidence is dropped
          // rather than shown with no traceable source.
          continue;
        }
        events.push({
          title: draft.title,
          category: draft.category,
          importance: draft.importance,
          summary: draft.summary,
          occurredAt: draft.occurredAt,
          sourceRecordIds,
        });
      }

      for (const s of result.data.skipped ?? []) {
        const id = refToId.get(s.ref);
        if (id) skipped.push(id);
      }

      // The whole batch succeeded — every record in it was genuinely
      // considered, regardless of whether it ended up in an event, in
      // "skipped", or in neither.
      processed.push(...batchRecordIds);
    } catch (err) {
      const message = err instanceof AiValidationError ? err.message : String(err);
      errors.push({ chunkIndex: i, message });
      failed.push(...batchRecordIds);
    }
  }

  return {
    events: dedupeEvents(events),
    skippedSourceRecordIds: skipped,
    processedSourceRecordIds: processed,
    failedSourceRecordIds: failed,
    errors,
    usage: { inputTokens, outputTokens, calls, usedStub },
  };
}

function resolveRefs(refs: string[], refToId: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const ref of refs) {
    const id = refToId.get(ref);
    // A ref that doesn't map to a real record in THIS batch is dropped
    // silently — refs are only ever meaningful within the batch they were
    // issued for, so this is the backstop against a hallucinated or
    // cross-batch citation slipping into a stored event.
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/**
 * Deterministic safety-net merge on top of the model's own "combine
 * duplicate developments" instruction. Catches the case where chunking (see
 * prepare.ts) split what should have been one development across two
 * separate AI calls, or the model simply didn't merge records it should
 * have: two events in the same category, on the same calendar day, with
 * substantially overlapping titles are folded into one, unioning their
 * evidence and keeping the higher importance score and the more detailed
 * summary.
 */
export function dedupeEvents(events: CategorizedEvent[]): CategorizedEvent[] {
  const groups: CategorizedEvent[] = [];

  for (const event of events) {
    const match = groups.find(
      (g) =>
        g.category === event.category &&
        sameDay(g.occurredAt, event.occurredAt) &&
        titleSimilarity(g.title, event.title) >= 0.6
    );

    if (!match) {
      groups.push({ ...event, sourceRecordIds: [...event.sourceRecordIds] });
      continue;
    }

    match.sourceRecordIds = [...new Set([...match.sourceRecordIds, ...event.sourceRecordIds])];
    match.importance = Math.max(match.importance, event.importance);
    if (event.summary.length > match.summary.length) {
      match.summary = event.summary;
    }
  }

  return groups;
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

/**
 * Cheap word-overlap (Jaccard) similarity on normalized titles — enough to
 * catch near-duplicate titles without pulling in an NLP dependency for a
 * 4-hour build. Exported because lib/ai/run-digest.ts reuses the identical
 * check for cross-run merging (a new digest run's event vs. an already
 * persisted event from a previous run), not just within-run deduping.
 */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeWords(a));
  const wordsB = new Set(normalizeWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
