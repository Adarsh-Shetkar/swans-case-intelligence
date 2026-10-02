import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDigest } from "../src/lib/ai/run-digest";
import { InMemoryDigestRepository } from "../src/lib/ai/in-memory-repository";
import { hashRecordContent } from "../src/lib/ai/hash";
import type { SourceRecordRow } from "../src/lib/ai/repository";

function makeRecord(overrides: Partial<SourceRecordRow> & { id: string }): SourceRecordRow {
  const base = {
    clioType: "note",
    occurredAt: new Date("2026-09-24T00:00:00.000Z"),
    author: null,
    subject: null,
    rawContent: "some substantive content describing a case development",
    lastDigestedContentHash: null,
    ...overrides,
  };
  const contentHash =
    overrides.contentHash ??
    hashRecordContent({
      clioType: base.clioType,
      occurredAt: base.occurredAt,
      author: base.author,
      subject: base.subject,
      content: base.rawContent ?? "",
    });
  return { ...base, contentHash };
}

describe("runDigest (stub mode, in-memory repository)", () => {
  beforeEach(() => {
    process.env.AI_USE_STUB = "true";
  });

  it("skips AI entirely and writes nothing on a second run with zero changes", async () => {
    const repo = new InMemoryDigestRepository();
    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr1",
        clioType: "communication",
        subject: "Call with client",
        rawContent: "Discussed upcoming right shoulder surgery and ongoing pain.",
        occurredAt: new Date("2026-09-27T14:00:00.000Z"),
      })
    );

    const first = await runDigest("matter-1", repo);
    expect(first.ranAi).toBe(true);
    expect(first.digestVersion).toBe(1);
    const eventCountAfterFirst = repo.caseEvents.length;
    const insightCountAfterFirst = repo.insights.length;

    const second = await runDigest("matter-1", repo);
    expect(second.ranAi).toBe(false);
    expect(second.reason).toBe("no_change_since_last_digest");
    expect(second.digestVersion).toBe(1); // unchanged, derived from existing rows
    expect(repo.caseEvents.length).toBe(eventCountAfterFirst); // nothing new written
    expect(repo.insights.length).toBe(insightCountAfterFirst);
  });

  it("creates events and insights on a full first run, each with real evidence", async () => {
    const repo = new InMemoryDigestRepository();
    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr1",
        clioType: "communication",
        subject: "Call with client",
        rawContent: "Discussed upcoming right shoulder surgery and ongoing pain.",
        occurredAt: new Date("2026-09-27T14:00:00.000Z"),
      })
    );
    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr2",
        clioType: "note",
        subject: "Coverage note",
        rawContent: "Confirmed policy limit of $100,000 bodily injury coverage with insurer.",
        occurredAt: new Date("2026-09-24T09:00:00.000Z"),
      })
    );

    const result = await runDigest("matter-1", repo);

    expect(result.ranAi).toBe(true);
    expect(result.digestVersion).toBe(1);
    expect(result.eventsCreated).toBeGreaterThan(0);
    expect(result.insightsWritten).toBeGreaterThan(0);

    for (const event of repo.caseEvents) {
      expect(event.sourceRecordIds.length).toBeGreaterThan(0);
    }

    const sr1 = repo.sourceRecords.find((r) => r.id === "sr1")!;
    expect(sr1.lastDigestedContentHash).toBe(sr1.contentHash);
  });

  it("merges a new run's event into an existing same-day, same-category, similarly-titled event rather than duplicating it", async () => {
    const repo = new InMemoryDigestRepository();

    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr1",
        clioType: "communication",
        subject: "Right shoulder surgery discussed",
        rawContent: "Right shoulder surgery discussed with client over the phone.",
        occurredAt: new Date("2026-09-27T14:00:00.000Z"),
      })
    );
    await runDigest("matter-1", repo);
    const eventsAfterFirstRun = repo.caseEvents.length;
    expect(eventsAfterFirstRun).toBeGreaterThan(0);

    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr2",
        clioType: "note",
        subject: "Right shoulder surgery discussed again",
        rawContent: "Right shoulder surgery discussed again, confirming with paralegal.",
        occurredAt: new Date("2026-09-27T16:00:00.000Z"),
      })
    );

    const second = await runDigest("matter-1", repo);

    expect(second.ranAi).toBe(true);
    expect(second.eventsMerged).toBeGreaterThan(0);
    expect(repo.caseEvents.length).toBe(eventsAfterFirstRun); // no new event row for sr2 — it merged

    const merged = repo.caseEvents.find((e) => e.sourceRecordIds.includes("sr1"));
    expect(merged?.sourceRecordIds).toContain("sr2");
  });

  it("derives the next digest version from existing CaseEvent/Insight rows, not a separate counter", async () => {
    const repo = new InMemoryDigestRepository();
    repo.seedRecord("matter-1", makeRecord({ id: "sr1", rawContent: "first batch of content here" }));
    const run1 = await runDigest("matter-1", repo);
    expect(run1.digestVersion).toBe(1);

    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr2",
        rawContent: "second batch of content here",
        occurredAt: new Date("2026-10-01T00:00:00.000Z"),
      })
    );
    const run2 = await runDigest("matter-1", repo);
    expect(run2.digestVersion).toBe(2);
  });

  it("does not mark records as digested when their chunk's AI call fails, leaving them eligible for retry", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/ai/categorize", async () => {
      const actual = await vi.importActual<typeof import("../src/lib/ai/categorize")>("../src/lib/ai/categorize");
      return {
        ...actual,
        categorizeAndRankEvents: vi.fn().mockResolvedValue({
          events: [],
          skippedSourceRecordIds: [],
          processedSourceRecordIds: [],
          failedSourceRecordIds: ["sr1"],
          errors: [{ chunkIndex: 0, message: "simulated model outage" }],
          usage: { inputTokens: 0, outputTokens: 0, calls: 1, usedStub: false },
        }),
      };
    });

    const { runDigest: isolatedRunDigest } = await import("../src/lib/ai/run-digest");
    const { InMemoryDigestRepository: IsolatedRepo } = await import("../src/lib/ai/in-memory-repository");
    const repo = new IsolatedRepo();

    repo.seedRecord(
      "matter-1",
      makeRecord({
        id: "sr1",
        rawContent: "some content that will fail to process",
        occurredAt: new Date("2026-09-24T00:00:00.000Z"),
      })
    );

    const result = await isolatedRunDigest("matter-1", repo);

    expect(result.errors.length).toBeGreaterThan(0);
    const sr1 = repo.sourceRecords.find((r: SourceRecordRow) => r.id === "sr1")!;
    expect(sr1.lastDigestedContentHash).toBeNull(); // still not marked digested
  });
});
