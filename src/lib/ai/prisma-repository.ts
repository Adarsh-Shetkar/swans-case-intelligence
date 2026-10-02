import { db as prisma } from "../db";
import type {
  DigestRepository,
  SourceRecordRow,
  ExistingEventRow,
  ExistingInsightRow,
  CreateCaseEventInput,
  UpdateCaseEventInput,
  CreateInsightInput,
} from "./repository";

/**
 * The production implementation of DigestRepository, backed by the schema
 * committed to prisma/schema.prisma (Person C's original contract, plus one
 * additive field: SourceRecord.lastDigestedContentHash). This is the only
 * file in the AI pipeline that imports @prisma/client directly --
 * everything upstream (run-digest.ts, categorize.ts, synthesize.ts,
 * digest.ts) depends only on the DigestRepository interface, which is what
 * makes them unit-testable without a live database (see
 * lib/ai/in-memory-repository.ts and __tests__/run-digest.test.ts).
 *
 * NOTE on type-checking: `prisma generate` must be run (npm run db:generate)
 * before PrismaClient exposes real per-model types instead of `any`. The
 * map callbacks below carry explicit return-shape annotations for exactly
 * this reason.
 */
export const prismaDigestRepository: DigestRepository = {
  async getMatterRecords(matterId: string): Promise<SourceRecordRow[]> {
    const rows = await prisma.sourceRecord.findMany({ where: { matterId } });
    return rows.map(
      (r: {
        id: string;
        clioType: string;
        occurredAt: Date;
        author: string | null;
        subject: string | null;
        rawContent: string | null;
        contentHash: string;
        lastDigestedContentHash: string | null;
      }): SourceRecordRow => ({
        id: r.id,
        clioType: r.clioType,
        occurredAt: r.occurredAt,
        author: r.author,
        subject: r.subject,
        rawContent: r.rawContent,
        contentHash: r.contentHash,
        lastDigestedContentHash: r.lastDigestedContentHash,
      })
    );
  },

  async getLatestDigestVersion(matterId: string): Promise<number> {
    const [latestEvent, latestInsight] = await Promise.all([
      prisma.caseEvent.findFirst({ where: { matterId }, orderBy: { digestVersion: "desc" } }),
      prisma.insight.findFirst({ where: { matterId }, orderBy: { digestVersion: "desc" } }),
    ]);
    return Math.max(latestEvent?.digestVersion ?? 0, latestInsight?.digestVersion ?? 0);
  },

  async getExistingEventsForMerge(
    matterId: string,
    category: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<ExistingEventRow[]> {
    const rows = await prisma.caseEvent.findMany({
      where: {
        matterId,
        category,
        occurredAt: { gte: dayStart, lte: dayEnd },
      },
    });
    return rows.map(
      (r: {
        id: string;
        title: string;
        category: string;
        importance: number;
        summary: string;
        occurredAt: Date;
        sourceRecordIds: string[];
      }): ExistingEventRow => ({
        id: r.id,
        title: r.title,
        category: r.category,
        importance: r.importance,
        summary: r.summary,
        occurredAt: r.occurredAt,
        sourceRecordIds: r.sourceRecordIds,
      })
    );
  },

  async createCaseEvent(input: CreateCaseEventInput) {
    const row = await prisma.caseEvent.create({
      data: {
        matterId: input.matterId,
        title: input.title,
        category: input.category,
        importance: input.importance,
        summary: input.summary,
        occurredAt: input.occurredAt,
        digestVersion: input.digestVersion,
        sourceRecordIds: input.sourceRecordIds,
      },
    });
    return { id: row.id };
  },

  async updateCaseEvent(id: string, patch: UpdateCaseEventInput): Promise<void> {
    await prisma.caseEvent.update({
      where: { id },
      data: {
        importance: patch.importance,
        summary: patch.summary,
        digestVersion: patch.digestVersion,
        sourceRecordIds: patch.sourceRecordIds,
      },
    });
  },

  async createInsight(input: CreateInsightInput) {
    const row = await prisma.insight.create({
      data: {
        matterId: input.matterId,
        type: input.type,
        label: input.label,
        value: input.value,
        confidence: input.confidence,
        digestVersion: input.digestVersion,
        sourceRecordIds: input.sourceRecordIds,
      },
    });
    return { id: row.id };
  },

  async getInsightsAtVersion(matterId: string, version: number): Promise<ExistingInsightRow[]> {
    const rows = await prisma.insight.findMany({
      where: { matterId, digestVersion: version },
    });
    return rows.map(
      (r: { type: string; label: string; value: string; confidence: string; sourceRecordIds: string[] }): ExistingInsightRow => ({
        type: r.type,
        label: r.label,
        value: r.value,
        confidence: r.confidence,
        sourceRecordIds: r.sourceRecordIds,
      })
    );
  },

  async markRecordsDigested(sourceRecordIds: string[], contentHashById: Map<string, string>): Promise<void> {
    // Each record's lastDigestedContentHash must be set to ITS OWN current
    // contentHash, so this has to be per-row rather than one updateMany.
    // Wrapped in a transaction so a partial failure can't leave some
    // records marked digested and others not for the same run.
    await prisma.$transaction(
      sourceRecordIds.map((id) =>
        prisma.sourceRecord.update({
          where: { id },
          data: { lastDigestedContentHash: contentHashById.get(id) },
        })
      )
    );
  },
};
