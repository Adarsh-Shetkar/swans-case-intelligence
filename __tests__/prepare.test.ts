import { describe, it, expect } from "vitest";
import { prepareRecordBatches, type RawRecordForPrompt } from "../src/lib/ai/prepare";

function raw(id: string, content: string, occurredAt = "2026-01-01T00:00:00.000Z"): RawRecordForPrompt {
  return { sourceRecordId: id, clioType: "note", occurredAt, content };
}

describe("prepareRecordBatches", () => {
  it("assigns call-local refs starting at r1 within each batch", () => {
    const batches = prepareRecordBatches([raw("sr1", "a"), raw("sr2", "b")]);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((r) => r.ref)).toEqual(["r1", "r2"]);
    expect(batches[0].map((r) => r.sourceRecordId)).toEqual(["sr1", "sr2"]);
  });

  it("truncates content beyond the per-record character budget", () => {
    const longContent = "x".repeat(5000);
    const [[record]] = prepareRecordBatches([raw("sr1", longContent)], { contentCharBudget: 100 });
    expect(record.content.length).toBeLessThan(150);
    expect(record.content).toContain("[truncated]");
  });

  it("splits into multiple chunks once the per-chunk character budget is exceeded", () => {
    const records = Array.from({ length: 5 }, (_, i) => raw(`sr${i}`, "x".repeat(300)));
    const batches = prepareRecordBatches(records, { chunkCharBudget: 1000 });
    expect(batches.length).toBeGreaterThan(1);
    // every record should still appear exactly once across all batches
    const allIds = batches.flat().map((r) => r.sourceRecordId);
    expect(new Set(allIds).size).toBe(5);
  });

  it("renumbers refs independently per chunk", () => {
    const records = Array.from({ length: 5 }, (_, i) => raw(`sr${i}`, "x".repeat(300)));
    const batches = prepareRecordBatches(records, { chunkCharBudget: 1000 });
    for (const batch of batches) {
      expect(batch.map((r) => r.ref)).toEqual(batch.map((_, i) => `r${i + 1}`));
    }
  });

  it("always places at least one record per chunk even if it alone exceeds the budget", () => {
    const huge = raw("sr1", "x".repeat(10_000));
    const batches = prepareRecordBatches([huge], { contentCharBudget: 50_000, chunkCharBudget: 100 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });
});
