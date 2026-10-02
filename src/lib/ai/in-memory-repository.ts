import type {
  DigestRepository,
  SourceRecordRow,
  ExistingEventRow,
  ExistingInsightRow,
  CreateCaseEventInput,
  UpdateCaseEventInput,
  CreateInsightInput,
} from "./repository";

interface StoredCaseEvent {
  id: string;
  matterId: string;
  title: string;
  category: string;
  importance: number;
  summary: string;
  occurredAt: Date;
  digestVersion: number;
  sourceRecordIds: string[];
}

interface StoredInsight {
  id: string;
  matterId: string;
  type: string;
  label: string;
  value: string;
  confidence: string;
  digestVersion: number;
  sourceRecordIds: string[];
}

type StoredSourceRecord = SourceRecordRow & { matterId: string };

/**
 * A plain in-memory stand-in for the real Postgres-backed repository.
 *
 * Two uses:
 *  1. Tests -- __tests__/run-digest.test.ts exercises the full orchestration
 *     logic (version bumps, merge-vs-create decisions, which records get
 *     marked digested) deterministically and fast, with no live DB needed.
 *  2. The fixture smoke-test harness (scripts/run-digest-fixture.ts) -- lets
 *     anyone on the team run the ENTIRE pipeline end-to-end against
 *     realistic data and see real output before Postgres or a Gemini key
 *     exists.
 */
export class InMemoryDigestRepository implements DigestRepository {
  sourceRecords: StoredSourceRecord[] = [];
  caseEvents: StoredCaseEvent[] = [];
  insights: StoredInsight[] = [];

  private nextId = 1;
  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  /** Test helper: seed a record belonging to a given matter. */
  seedRecord(matterId: string, record: SourceRecordRow): void {
    this.sourceRecords.push({ ...record, matterId });
  }

  async getMatterRecords(matterId: string): Promise<SourceRecordRow[]> {
    return this.sourceRecords
      .filter((r) => r.matterId === matterId)
      .map(({ matterId: _omit, ...rest }) => rest);
  }

  async getLatestDigestVersion(matterId: string): Promise<number> {
    const versions = [
      ...this.caseEvents.filter((e) => e.matterId === matterId).map((e) => e.digestVersion),
      ...this.insights.filter((i) => i.matterId === matterId).map((i) => i.digestVersion),
    ];
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  async getExistingEventsForMerge(
    matterId: string,
    category: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<ExistingEventRow[]> {
    return this.caseEvents
      .filter(
        (e) =>
          e.matterId === matterId &&
          e.category === category &&
          e.occurredAt >= dayStart &&
          e.occurredAt <= dayEnd
      )
      .map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        importance: e.importance,
        summary: e.summary,
        occurredAt: e.occurredAt,
        sourceRecordIds: e.sourceRecordIds,
      }));
  }

  async createCaseEvent(input: CreateCaseEventInput) {
    const id = this.id("event");
    this.caseEvents.push({ id, ...input });
    return { id };
  }

  async updateCaseEvent(id: string, patch: UpdateCaseEventInput): Promise<void> {
    const event = this.caseEvents.find((e) => e.id === id);
    if (!event) return;
    if (patch.importance !== undefined) event.importance = patch.importance;
    if (patch.summary !== undefined) event.summary = patch.summary;
    if (patch.digestVersion !== undefined) event.digestVersion = patch.digestVersion;
    if (patch.sourceRecordIds !== undefined) event.sourceRecordIds = patch.sourceRecordIds;
  }

  async createInsight(input: CreateInsightInput) {
    const id = this.id("insight");
    this.insights.push({ id, ...input });
    return { id };
  }

  async getInsightsAtVersion(matterId: string, version: number): Promise<ExistingInsightRow[]> {
    return this.insights
      .filter((i) => i.matterId === matterId && i.digestVersion === version)
      .map((i) => ({
        type: i.type,
        label: i.label,
        value: i.value,
        confidence: i.confidence,
        sourceRecordIds: i.sourceRecordIds,
      }));
  }

  async markRecordsDigested(sourceRecordIds: string[], contentHashById: Map<string, string>): Promise<void> {
    for (const id of sourceRecordIds) {
      const record = this.sourceRecords.find((r) => r.id === id);
      if (record) {
        record.lastDigestedContentHash = contentHashById.get(id) ?? record.contentHash;
      }
    }
  }
}
