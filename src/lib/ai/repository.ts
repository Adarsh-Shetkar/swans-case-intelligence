/**
 * The digest orchestrator (run-digest.ts) depends on this interface, not on
 * Prisma directly. Two implementations exist:
 *   - lib/db/prisma-repository.ts -- the real one, used in dev/production
 *     against Postgres, built against the schema Person C committed.
 *   - lib/ai/in-memory-repository.ts -- a plain in-memory fake used in
 *     tests and the no-DB fixture smoke harness.
 *
 * Schema notes (matches prisma/schema.prisma as committed by the team):
 *   - CaseEvent/Insight store evidence as `sourceRecordIds String[]`
 *     directly -- no join tables.
 *   - There is no separate Digest/ProcessingJob table. "Current digest
 *     version" for a matter is derived as
 *     MAX(CaseEvent.digestVersion, Insight.digestVersion), defaulting to 0
 *     if the matter has neither yet.
 *   - SourceRecord carries one additive field beyond the original contract:
 *     `lastDigestedContentHash String?`, which is what makes per-record
 *     incremental diffing possible (see lib/ai/digest.ts).
 */

export interface SourceRecordRow {
  id: string;
  clioType: string;
  occurredAt: Date;
  author: string | null;
  subject: string | null;
  rawContent: string | null;
  contentHash: string;
  lastDigestedContentHash: string | null;
}

export interface ExistingEventRow {
  id: string;
  title: string;
  category: string;
  importance: number;
  summary: string;
  occurredAt: Date;
  sourceRecordIds: string[];
}

export interface CreateCaseEventInput {
  matterId: string;
  title: string;
  category: string;
  importance: number;
  summary: string;
  occurredAt: Date;
  digestVersion: number;
  sourceRecordIds: string[];
}

export interface UpdateCaseEventInput {
  importance?: number;
  summary?: string;
  digestVersion?: number;
  sourceRecordIds?: string[];
}

export interface CreateInsightInput {
  matterId: string;
  type: string;
  label: string;
  value: string;
  confidence: string;
  digestVersion: number;
  sourceRecordIds: string[];
}

export interface DigestRepository {
  getMatterRecords(matterId: string): Promise<SourceRecordRow[]>;

  /** 0 if the matter has no CaseEvents or Insights yet. */
  getLatestDigestVersion(matterId: string): Promise<number>;

  /** Candidate existing events for cross-run merge checks: same matter + category, within the given day window. */
  getExistingEventsForMerge(
    matterId: string,
    category: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<ExistingEventRow[]>;
  createCaseEvent(input: CreateCaseEventInput): Promise<{ id: string }>;
  updateCaseEvent(id: string, patch: UpdateCaseEventInput): Promise<void>;

  createInsight(input: CreateInsightInput): Promise<{ id: string }>;

  /** Marks each given record as digested, stamping its current contentHash as the new lastDigestedContentHash. */
  markRecordsDigested(sourceRecordIds: string[], contentHashById: Map<string, string>): Promise<void>;
}
