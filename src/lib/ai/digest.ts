/**
 * The shape the digest planner needs for each record under consideration.
 * `lastDigestedContentHash` is null for a record that has never been through
 * the AI pipeline; otherwise it's the contentHash captured the last time it
 * WAS processed (see prisma/schema.prisma: SourceRecord.lastDigestedContentHash).
 */
export interface DigestableRecord {
  sourceRecordId: string;
  clioType: string;
  occurredAt: string | Date;
  author?: string | null;
  subject?: string | null;
  content: string;
  contentHash: string;
  lastDigestedContentHash?: string | null;
}

export type DigestSkipReason =
  | "no_change_since_last_digest"
  | "processing_all_changes"
  | "processing_oldest_first_with_backlog";

export interface DigestPlan {
  /** False means: skip AI entirely, there is nothing new to process. */
  shouldRunAi: boolean;
  /** The subset of changed records to actually send to AI this run. */
  recordsForThisRun: DigestableRecord[];
  /** Changed records held back this run due to the per-run budget cap. */
  deferredCount: number;
  /** Records that were already up to date and needed no reprocessing. */
  unchangedCount: number;
  reason: DigestSkipReason;
}

/**
 * Pure decision function — no I/O, no Prisma, no AI calls. Given the full
 * set of records currently relevant to a matter, decide what work (if any)
 * this run should do.
 *
 * Per-record comparison (`lastDigestedContentHash !== contentHash`) is the
 * whole mechanism: if nothing changed, `recordsForThisRun` is empty and
 * `shouldRunAi` is false -- zero AI calls, and the caller (run-digest.ts)
 * does nothing at all, not even a database write. There is no separate
 * matter-level "Digest" row to maintain here, by design: the committed
 * schema derives "current digest version" from
 * MAX(CaseEvent.digestVersion, Insight.digestVersion) instead of a
 * dedicated table, so there is nothing to bump when there's no new content.
 */
export function planDigest(
  records: DigestableRecord[],
  maxRecordsPerRun: number = Number(process.env.AI_MAX_RECORDS_PER_RUN ?? 120)
): DigestPlan {
  const changed = records.filter((r) => r.lastDigestedContentHash !== r.contentHash);

  if (changed.length === 0) {
    return {
      shouldRunAi: false,
      recordsForThisRun: [],
      deferredCount: 0,
      unchangedCount: records.length,
      reason: "no_change_since_last_digest",
    };
  }

  // Oldest-first: on a cold start against a huge matter, this ensures the
  // earliest case history gets established first, and the backlog shrinks
  // on every subsequent run rather than the newest record always winning
  // the budget and the tail never getting processed.
  const sortedChanged = [...changed].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
  const recordsForThisRun = sortedChanged.slice(0, maxRecordsPerRun);
  const deferredCount = sortedChanged.length - recordsForThisRun.length;

  return {
    shouldRunAi: true,
    recordsForThisRun,
    deferredCount,
    unchangedCount: records.length - changed.length,
    reason: deferredCount > 0 ? "processing_oldest_first_with_backlog" : "processing_all_changes",
  };
}
