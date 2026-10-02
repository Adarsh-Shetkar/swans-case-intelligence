import { planDigest, type DigestableRecord } from "./digest";
import { categorizeAndRankEvents, titleSimilarity } from "./categorize";
import { synthesizeInsights } from "./synthesize";
import { computeLastContact } from "./compute-last-contact";
import { config as geminiConfig } from "./gemini";
import type { DigestRepository, SourceRecordRow } from "./repository";
import type { RawRecordForPrompt } from "./prepare";

export interface RunDigestResult {
  matterId: string;
  ranAi: boolean;
  digestVersion: number;
  reason: string;
  eventsCreated: number;
  eventsMerged: number;
  insightsWritten: number;
  errors: string[];
  usage: { inputTokens: number; outputTokens: number; calls: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date | string): Date {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(d: Date | string): Date {
  return new Date(startOfUtcDay(d).getTime() + DAY_MS - 1);
}

function toRawRecord(r: SourceRecordRow): RawRecordForPrompt {
  return {
    sourceRecordId: r.id,
    clioType: r.clioType,
    occurredAt: r.occurredAt,
    author: r.author,
    subject: r.subject,
    content: r.rawContent ?? "",
  };
}

/**
 * The single entrypoint that ties the whole pipeline together for one
 * matter:
 *
 *   1. Load every SourceRecord for the matter.
 *   2. planDigest() decides whether anything changed at all, and if so,
 *      exactly which records are new/changed (see lib/ai/digest.ts).
 *   3. If nothing changed: do nothing at all -- zero AI calls, zero writes,
 *      not even a version bump (there's no separate Digest row to bump).
 *   4. If something changed: bump the derived version (see
 *      DigestRepository.getLatestDigestVersion), run categorization on
 *      ONLY the delta (additive -- events from prior runs stay valid), run
 *      insight synthesis on the FULL current record set (insights are a
 *      holistic snapshot, not additive -- see synthesize.ts), persist both,
 *      and mark exactly the records that were successfully processed as
 *      digested (failures stay eligible for retry next run).
 *
 * Depends on `DigestRepository`, not Prisma directly, so the orchestration
 * logic itself (merge decisions, version bumps, what gets marked digested)
 * is fully unit-testable with an in-memory fake -- see
 * __tests__/run-digest.test.ts.
 */
export async function runDigest(matterId: string, repo: DigestRepository): Promise<RunDigestResult> {
  const records = await repo.getMatterRecords(matterId);

  const digestableRecords: DigestableRecord[] = records.map((r) => ({
    sourceRecordId: r.id,
    clioType: r.clioType,
    occurredAt: r.occurredAt,
    author: r.author,
    subject: r.subject,
    content: r.rawContent ?? "",
    contentHash: r.contentHash,
    lastDigestedContentHash: r.lastDigestedContentHash,
  }));

  const plan = planDigest(digestableRecords);

  if (!plan.shouldRunAi) {
    const currentVersion = await repo.getLatestDigestVersion(matterId);
    return {
      matterId,
      ranAi: false,
      digestVersion: currentVersion,
      reason: plan.reason,
      eventsCreated: 0,
      eventsMerged: 0,
      insightsWritten: 0,
      errors: [],
      usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
    };
  }

  const currentVersion = await repo.getLatestDigestVersion(matterId);
  const newVersion = currentVersion + 1;

  // --- Events: additive, only on this run's delta ---
  const changedRaw = plan.recordsForThisRun.map((r) => ({
    sourceRecordId: r.sourceRecordId,
    clioType: r.clioType,
    occurredAt: r.occurredAt,
    author: r.author,
    subject: r.subject,
    content: r.content,
  }));
  const categorizeResult = await categorizeAndRankEvents(matterId, changedRaw);

  let eventsCreated = 0;
  let eventsMerged = 0;
  for (const event of categorizeResult.events) {
    const dayStart = startOfUtcDay(event.occurredAt);
    const dayEnd = endOfUtcDay(event.occurredAt);
    const candidates = await repo.getExistingEventsForMerge(matterId, event.category, dayStart, dayEnd);
    const match = candidates.find((c) => titleSimilarity(c.title, event.title) >= 0.6);

    if (match) {
      // Same development was already recorded by a previous digest run --
      // merge rather than create a near-duplicate event.
      const mergedSourceIds = [...new Set([...match.sourceRecordIds, ...event.sourceRecordIds])];
      await repo.updateCaseEvent(match.id, {
        importance: Math.max(match.importance, event.importance),
        summary: event.summary.length > match.summary.length ? event.summary : match.summary,
        digestVersion: newVersion,
        sourceRecordIds: mergedSourceIds,
      });
      eventsMerged += 1;
    } else {
      await repo.createCaseEvent({
        matterId,
        title: event.title,
        category: event.category,
        importance: event.importance,
        summary: event.summary,
        occurredAt: new Date(event.occurredAt),
        digestVersion: newVersion,
        sourceRecordIds: event.sourceRecordIds,
      });
      eventsCreated += 1;
    }
  }

  // --- Insights: holistic snapshot over ALL currently-relevant records ---
  const allRaw = records.map(toRawRecord);
  const insightResult = await synthesizeInsights(matterId, allRaw);

  // last_contact is computed deterministically -- no LLM involved, zero
  // cost, cannot hallucinate a date (see compute-last-contact.ts). It is
  // always included alongside whatever the LLM produced for the other
  // insight types.
  const lastContact = computeLastContact(
    records.map((r) => ({ id: r.id, clioType: r.clioType, occurredAt: r.occurredAt, subject: r.subject }))
  );
  const allInsights = [...insightResult.insights, lastContact];

  for (const insight of allInsights) {
    await repo.createInsight({
      matterId,
      type: insight.type,
      label: insight.label,
      value: insight.value,
      confidence: insight.confidence,
      digestVersion: newVersion,
      sourceRecordIds: insight.sourceRecordIds,
    });
  }

  // --- Mark records digested: only those that actually succeeded ---
  const failedSet = new Set(categorizeResult.failedSourceRecordIds);
  const toMark = categorizeResult.processedSourceRecordIds.filter((id) => !failedSet.has(id));
  if (toMark.length > 0) {
    const contentHashById = new Map(records.map((r) => [r.id, r.contentHash]));
    await repo.markRecordsDigested(toMark, contentHashById);
  }

  const errors = [
    ...categorizeResult.errors.map((e) => `categorize_events chunk ${e.chunkIndex}: ${e.message}`),
    ...(insightResult.error ? [`synthesize_insights: ${insightResult.error}`] : []),
  ];

  return {
    matterId,
    ranAi: true,
    digestVersion: newVersion,
    reason: plan.reason,
    eventsCreated,
    eventsMerged,
    insightsWritten: allInsights.length,
    errors,
    usage: {
      inputTokens: categorizeResult.usage.inputTokens + insightResult.usage.inputTokens,
      outputTokens: categorizeResult.usage.outputTokens + insightResult.usage.outputTokens,
      calls: categorizeResult.usage.calls + insightResult.usage.calls,
    },
  };
}
