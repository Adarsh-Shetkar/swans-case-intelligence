import { describe, it, expect, vi, beforeEach } from "vitest";
import { dedupeEvents, categorizeAndRankEvents, type CategorizedEvent } from "../src/lib/ai/categorize";
import type { RawRecordForPrompt } from "../src/lib/ai/prepare";

function event(overrides: Partial<CategorizedEvent>): CategorizedEvent {
  return {
    title: "Right shoulder surgery discussed",
    category: "surgery",
    importance: 70,
    summary: "short",
    occurredAt: "2026-09-24T00:00:00.000Z",
    sourceRecordIds: ["sr1"],
    ...overrides,
  };
}

describe("dedupeEvents", () => {
  it("merges same-day, same-category, similarly-titled events and unions their sources", () => {
    const events = [
      event({ sourceRecordIds: ["sr1"], importance: 60, summary: "short one" }),
      event({
        title: "Right shoulder surgery discussion",
        sourceRecordIds: ["sr2"],
        importance: 85,
        summary: "a much longer and more detailed summary of the same development",
      }),
    ];

    const result = dedupeEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].sourceRecordIds.sort()).toEqual(["sr1", "sr2"]);
    expect(result[0].importance).toBe(85); // keeps the higher importance
    expect(result[0].summary).toContain("much longer"); // keeps the more detailed summary
  });

  it("does not merge events in different categories even on the same day", () => {
    const events = [
      event({ category: "surgery", sourceRecordIds: ["sr1"] }),
      event({ category: "coverage", title: "Coverage confirmed", sourceRecordIds: ["sr2"] }),
    ];
    expect(dedupeEvents(events)).toHaveLength(2);
  });

  it("does not merge events with dissimilar titles even in the same category and day", () => {
    const events = [
      event({ title: "Right shoulder surgery discussed", sourceRecordIds: ["sr1"] }),
      event({ title: "Referral to new physical therapist", sourceRecordIds: ["sr2"] }),
    ];
    expect(dedupeEvents(events)).toHaveLength(2);
  });

  it("does not merge similarly-titled events on different days", () => {
    const events = [
      event({ occurredAt: "2026-09-24T00:00:00.000Z", sourceRecordIds: ["sr1"] }),
      event({ occurredAt: "2026-09-25T00:00:00.000Z", sourceRecordIds: ["sr2"] }),
    ];
    expect(dedupeEvents(events)).toHaveLength(2);
  });
});

describe("categorizeAndRankEvents (stub mode, end-to-end)", () => {
  beforeEach(() => {
    process.env.AI_USE_STUB = "true";
  });

  it("returns an empty result for no input without calling AI", async () => {
    const result = await categorizeAndRankEvents("matter-1", []);
    expect(result.events).toEqual([]);
    expect(result.usage.calls).toBe(0);
  });

  it("resolves model refs back to real sourceRecordIds, never leaking raw refs", async () => {
    const records: RawRecordForPrompt[] = [
      {
        sourceRecordId: "real-id-abc",
        clioType: "communication",
        occurredAt: "2026-09-27T14:00:00Z",
        subject: "Call with client",
        content: "Discussed upcoming right shoulder surgery and ongoing pain.",
      },
      {
        sourceRecordId: "real-id-def",
        clioType: "task",
        occurredAt: "2026-09-20T00:00:00Z",
        content: "x", // short -> stub will skip this one
      },
    ];

    const result = await categorizeAndRankEvents("matter-1", records);

    expect(result.usage.calls).toBe(1);
    expect(result.usage.usedStub).toBe(true);
    for (const e of result.events) {
      for (const id of e.sourceRecordIds) {
        expect(id).not.toMatch(/^r\d+$/); // must be a real id, not a leaked ref
        expect(["real-id-abc", "real-id-def"]).toContain(id);
      }
    }
    expect(result.skippedSourceRecordIds).toContain("real-id-def");
  });
});

describe("categorizeAndRankEvents (hallucinated ref safety net)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("drops an event whose only cited ref does not exist in the batch", async () => {
    vi.doMock("../src/lib/ai/gemini", () => ({
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          events: [
            {
              title: "Suspicious event",
              category: "other",
              importance: 50,
              summary: "cites a ref that was never issued for this batch",
              occurredAt: "2026-09-24T00:00:00.000Z",
              sourceRefs: ["r99"], // does not exist in a 1-record batch
            },
          ],
          skipped: [],
        },
        model: "mock",
        durationMs: 1,
        usedStub: false,
      }),
    }));

    const { categorizeAndRankEvents: isolatedCategorize } = await import("../src/lib/ai/categorize");

    const result = await isolatedCategorize("matter-1", [
      {
        sourceRecordId: "real-id-1",
        clioType: "note",
        occurredAt: "2026-09-24T00:00:00.000Z",
        content: "some real content",
      },
    ]);

    expect(result.events).toHaveLength(0);
  });
});
