import { planDigest, type DigestableRecord } from "./digest";
import { categorizeAndRankEvents, titleSimilarity } from "./categorize";
import { synthesizeInsights } from "./synthesize";
import { computeLastContact } from "./compute-last-contact";
import { computeMatterFieldInsights } from "./compute-matter-field-insights";
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

/**
 * Matter custom fields (see matter-fields.ts) describe case STATE (value,
 * coverage, specials), not developments, and their occurredAt is the matter's
 * updated_at. They feed insights, never the event timeline.
 */
const NON_EVENT_CLIO_TYPES: ReadonlySet<string> = new Set(["matter_field"]);

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
  // Non-event records (matter fields) are withheld from the event step. They
  // still reach insight synthesis below via `records`, and are marked digested
  // at the end so they don't keep the matter looking "changed" forever.
  const eventCandidates = plan.recordsForThisRun.filter((r) => !NON_EVENT_CLIO_TYPES.has(r.clioType));
  const nonEventIdsThisRun = plan.recordsForThisRun
    .filter((r) => NON_EVENT_CLIO_TYPES.has(r.clioType))
    .map((r) => r.sourceRecordId);

  const changedRaw = eventCandidates.map((r) => ({
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
  // cost, cannot hallucinate a date (see compute-last-contact.ts).
  const lastContact = computeLastContact(
    records.map((r) => ({ id: r.id, clioType: r.clioType, occurredAt: r.occurredAt, subject: r.subject }))
  );

  // Financial/coverage facts from Clio matter custom fields (Estimated Case
  // Value, Policy Limits, Medical Specials To Date, Insurance Carrier,
  // etc.) -- also deterministic, also zero LLM cost, also cannot
  // hallucinate a dollar figure. See compute-matter-field-insights.ts.
  const matterFieldRecords = records.map((r) => ({
    id: r.id,
    clioType: r.clioType,
    subject: r.subject,
    rawContent: r.rawContent,
  }));
  const fieldInsights = computeMatterFieldInsights(matterFieldRecords);

  // Insights-wipe guard: if synthesis fails, insightResult.insights is [].
  // Without this, the version we're about to write would contain ONLY
  // last_contact + field insights, and since "current digest version" is
  // MAX(CaseEvent.digestVersion, Insight.digestVersion), that failed run's
  // version becomes the new "latest" -- silently hiding the previous
  // version's posture/injury/blocker insights from anyone reading "insights
  // at the latest version", even though nothing about those facts changed.
  // Fix: on failure, carry the previous version's LLM-derived insights
  // forward under the new version number, excluding labels this run's
  // deterministic functions already produced (to avoid a stale duplicate
  // sitting next to the fresh one).
  let llmInsights = insightResult.insights;
  if (insightResult.error && currentVersion > 0) {
    const deterministicLabelsThisRun = new Set([lastContact.label, ...fieldInsights.map((f) => f.label)]);
    const previous = await repo.getInsightsAtVersion(matterId, currentVersion);
    llmInsights = previous.filter((i) => !deterministicLabelsThisRun.has(i.label));
  }

  const allInsights = [...llmInsights, lastContact, ...fieldInsights];

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
  const toMark = [
    ...categorizeResult.processedSourceRecordIds.filter((id) => !failedSet.has(id)),
    ...nonEventIdsThisRun,
  ];
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
