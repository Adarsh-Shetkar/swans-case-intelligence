import { describe, it, expect } from "vitest";
import { planDigest, type DigestableRecord } from "../src/lib/ai/digest";

function record(overrides: Partial<DigestableRecord> & { sourceRecordId: string }): DigestableRecord {
  return {
    clioType: "note",
    occurredAt: "2026-09-01T00:00:00.000Z",
    content: "some content",
    contentHash: "hash-" + overrides.sourceRecordId,
    lastDigestedContentHash: null,
    ...overrides,
  };
}

describe("planDigest", () => {
  it("skips AI entirely when nothing has changed", () => {
    const records = [
      record({ sourceRecordId: "sr1", contentHash: "h1", lastDigestedContentHash: "h1" }),
      record({ sourceRecordId: "sr2", contentHash: "h2", lastDigestedContentHash: "h2" }),
    ];

    const plan = planDigest(records);

    expect(plan.shouldRunAi).toBe(false);
    expect(plan.recordsForThisRun).toHaveLength(0);
    expect(plan.unchangedCount).toBe(2);
    expect(plan.reason).toBe("no_change_since_last_digest");
  });

  it("runs AI only on the records that are new or changed", () => {
    const records = [
      record({ sourceRecordId: "sr1", contentHash: "h1", lastDigestedContentHash: "h1" }), // unchanged
      record({ sourceRecordId: "sr2", contentHash: "h2-edited", lastDigestedContentHash: "h2" }), // changed
      record({ sourceRecordId: "sr3", contentHash: "h3", lastDigestedContentHash: null }), // brand new
    ];

    const plan = planDigest(records);

    expect(plan.shouldRunAi).toBe(true);
    expect(plan.unchangedCount).toBe(1);
    expect(plan.recordsForThisRun.map((r) => r.sourceRecordId).sort()).toEqual(["sr2", "sr3"]);
  });

  it("treats a matter with no prior processing as a full first run", () => {
    const records = [
      record({ sourceRecordId: "sr1", contentHash: "h1" }),
      record({ sourceRecordId: "sr2", contentHash: "h2" }),
    ];

    const plan = planDigest(records);

    expect(plan.shouldRunAi).toBe(true);
    expect(plan.recordsForThisRun).toHaveLength(2);
    expect(plan.reason).toBe("processing_all_changes");
  });

  it("caps the per-run batch and defers the rest, oldest first", () => {
    const records = [
      record({ sourceRecordId: "sr1", contentHash: "h1", occurredAt: "2026-01-03T00:00:00.000Z" }),
      record({ sourceRecordId: "sr2", contentHash: "h2", occurredAt: "2026-01-01T00:00:00.000Z" }),
      record({ sourceRecordId: "sr3", contentHash: "h3", occurredAt: "2026-01-02T00:00:00.000Z" }),
    ];

    const plan = planDigest(records, 2);

    expect(plan.recordsForThisRun).toHaveLength(2);
    expect(plan.deferredCount).toBe(1);
    expect(plan.reason).toBe("processing_oldest_first_with_backlog");
    expect(plan.recordsForThisRun.map((r) => r.sourceRecordId)).toEqual(["sr2", "sr3"]);
  });

  it("treats an empty record set as nothing to do", () => {
    const plan = planDigest([]);
    expect(plan.shouldRunAi).toBe(false);
    expect(plan.reason).toBe("no_change_since_last_digest");
  });
});
