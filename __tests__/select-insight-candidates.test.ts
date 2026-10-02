import { describe, it, expect } from "vitest";
import { selectInsightCandidates } from "../src/lib/ai/select-insight-candidates";
import type { RawRecordForPrompt } from "../src/lib/ai/prepare";

function rec(overrides: Partial<RawRecordForPrompt> & { sourceRecordId: string }): RawRecordForPrompt {
  return {
    clioType: "note",
    occurredAt: "2026-01-01T00:00:00.000Z",
    content: "routine content with nothing special",
    ...overrides,
  };
}

describe("selectInsightCandidates", () => {
  it("always includes communications up to the cap, most recent first", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      rec({
        sourceRecordId: `comm${i}`,
        clioType: "communication",
        occurredAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        content: "a routine call",
      })
    );
    const selected = selectInsightCandidates(records, 3);
    expect(selected).toHaveLength(3);
    // most recent three: comm4, comm3, comm2
    expect(selected.map((r) => r.sourceRecordId)).toEqual(["comm4", "comm3", "comm2"]);
  });

  it("includes keyword-relevant records even if they are not communications", () => {
    const records: RawRecordForPrompt[] = [
      rec({ sourceRecordId: "irrelevant", content: "routine filing update", occurredAt: "2026-02-01T00:00:00.000Z" }),
      rec({
        sourceRecordId: "coverage-note",
        content: "Confirmed policy limit of $100,000 with insurer.",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const selected = selectInsightCandidates(records, 1);
    expect(selected.map((r) => r.sourceRecordId)).toEqual(["coverage-note"]);
  });

  it("fills remaining budget with most recent records when nothing else qualifies", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({
        sourceRecordId: `task${i}`,
        clioType: "task",
        occurredAt: new Date(2026, 0, i + 1).toISOString(),
        content: "routine administrative task",
      })
    );
    const selected = selectInsightCandidates(records, 3);
    expect(selected).toHaveLength(3);
    // should be the 3 most recent
    expect(selected.map((r) => r.sourceRecordId)).toEqual(["task9", "task8", "task7"]);
  });

  it("never exceeds maxCandidates even with overlapping qualifying categories", () => {
    const records: RawRecordForPrompt[] = Array.from({ length: 50 }, (_, i) =>
      rec({
        sourceRecordId: `comm${i}`,
        clioType: "communication",
        occurredAt: new Date(2026, 0, i + 1).toISOString(),
        content: "discussed shoulder surgery and policy limit coverage",
      })
    );
    const selected = selectInsightCandidates(records, 20);
    expect(selected.length).toBeLessThanOrEqual(20);
  });

  it("never returns duplicate records across the selection passes", () => {
    const records: RawRecordForPrompt[] = [
      rec({
        sourceRecordId: "r1",
        clioType: "communication",
        content: "discussed shoulder injury and policy coverage",
      }),
    ];
    const selected = selectInsightCandidates(records, 60);
    expect(selected).toHaveLength(1);
  });

  it("returns results sorted most-recent-first", () => {
    const records = [
      rec({ sourceRecordId: "old", occurredAt: "2026-01-01T00:00:00.000Z" }),
      rec({ sourceRecordId: "new", occurredAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const selected = selectInsightCandidates(records, 10);
    expect(selected.map((r) => r.sourceRecordId)).toEqual(["new", "old"]);
  });
});
