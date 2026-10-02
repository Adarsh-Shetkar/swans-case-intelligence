import type { CitableRecord } from "./types";

export interface RawRecordForPrompt {
  sourceRecordId: string;
  clioType: string;
  occurredAt: string | Date;
  author?: string | null;
  subject?: string | null;
  content: string;
}

// Per-record cap: long documents get truncated rather than blowing the
// prompt budget on their own. Document intelligence (full OCR'd text) is a
// deferred capability (see README) — this cap mainly protects against a
// single long email thread or note dominating a batch.
const DEFAULT_CONTENT_CHAR_BUDGET = 1200;

// Total characters per AI call. Keeps individual Gemini calls small,
// predictable in cost, and fast — large digests are split into multiple
// calls rather than one call with an enormous prompt.
const DEFAULT_CHUNK_CHAR_BUDGET = 24_000;

export function truncateContent(text: string, max: number = DEFAULT_CONTENT_CHAR_BUDGET): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)} …[truncated]`;
}

/**
 * Turns a flat list of raw records into one or more batches, each ready to
 * hand to a prompt builder: content is truncated to a safe per-record size,
 * and batches are sized to a total character budget. Each batch gets its
 * own call-local refs ("r1", "r2", ...) so citations stay short and
 * unambiguous — a ref is only ever meaningful within the batch it was
 * issued in, which is also what makes a hallucinated cross-batch ref easy
 * to detect and drop (see categorize.ts / synthesize.ts `resolveRefs`).
 */
export function prepareRecordBatches(
  records: RawRecordForPrompt[],
  options: { contentCharBudget?: number; chunkCharBudget?: number } = {}
): CitableRecord[][] {
  const contentCharBudget = options.contentCharBudget ?? DEFAULT_CONTENT_CHAR_BUDGET;
  const chunkCharBudget = options.chunkCharBudget ?? DEFAULT_CHUNK_CHAR_BUDGET;

  const normalized = records.map((r) => ({
    sourceRecordId: r.sourceRecordId,
    clioType: r.clioType,
    occurredAt: typeof r.occurredAt === "string" ? r.occurredAt : r.occurredAt.toISOString(),
    author: r.author ?? null,
    subject: r.subject ?? null,
    content: truncateContent(r.content ?? "", contentCharBudget),
  }));

  const chunks: (typeof normalized)[] = [];
  let current: typeof normalized = [];
  let currentChars = 0;

  for (const record of normalized) {
    const cost = record.content.length + 80; // rough allowance for header/formatting overhead
    if (current.length > 0 && currentChars + cost > chunkCharBudget) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(record);
    currentChars += cost;
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((chunk) => chunk.map((r, i): CitableRecord => ({ ref: `r${i + 1}`, ...r })));
}

/**
 * Like prepareRecordBatches, but guarantees a single batch regardless of
 * input size (records are only truncated per-record, never split across
 * multiple AI calls). Used by insight synthesis, where producing the
 * case's headline insights from two separate calls would mean reconciling
 * potentially conflicting "posture" statements — better to bound the input
 * deterministically upstream (see select-insight-candidates.ts) and commit
 * to one coherent call.
 */
export function prepareSingleBatch(
  records: RawRecordForPrompt[],
  contentCharBudget: number = DEFAULT_CONTENT_CHAR_BUDGET
): CitableRecord[] {
  return records.map(
    (r, i): CitableRecord => ({
      ref: `r${i + 1}`,
      sourceRecordId: r.sourceRecordId,
      clioType: r.clioType,
      occurredAt: typeof r.occurredAt === "string" ? r.occurredAt : r.occurredAt.toISOString(),
      author: r.author ?? null,
      subject: r.subject ?? null,
      content: truncateContent(r.content ?? "", contentCharBudget),
    })
  );
}
