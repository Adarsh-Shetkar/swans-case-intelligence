import { describe, it, expect } from "vitest";
import { computeLastContact, type CommunicationLikeRecord } from "../src/lib/ai/compute-last-contact";

function comm(overrides: Partial<CommunicationLikeRecord> & { id: string }): CommunicationLikeRecord {
  return {
    clioType: "communication",
    occurredAt: new Date("2026-09-01T00:00:00.000Z"),
    subject: null,
    ...overrides,
  };
}

describe("computeLastContact", () => {
  it("returns unknown with no sources when there are no communication records", () => {
    const result = computeLastContact([{ id: "t1", clioType: "task", occurredAt: new Date(), subject: null }]);
    expect(result.confidence).toBe("unknown");
    expect(result.sourceRecordIds).toEqual([]);
  });

  it("picks the single most recent communication by occurredAt", () => {
    const records = [
      comm({ id: "early", occurredAt: new Date("2026-09-01T00:00:00.000Z") }),
      comm({ id: "latest", occurredAt: new Date("2026-09-27T14:00:00.000Z"), subject: "Call with client" }),
      comm({ id: "middle", occurredAt: new Date("2026-09-15T00:00:00.000Z") }),
    ];
    const result = computeLastContact(records);
    expect(result.confidence).toBe("observed");
    expect(result.sourceRecordIds).toEqual(["latest"]);
    expect(result.value).toContain("Call with client");
  });

  it("ignores non-communication records even if more recent", () => {
    const records = [
      comm({ id: "comm1", occurredAt: new Date("2026-09-01T00:00:00.000Z") }),
      { id: "task1", clioType: "task", occurredAt: new Date("2026-10-01T00:00:00.000Z"), subject: null },
    ];
    const result = computeLastContact(records);
    expect(result.sourceRecordIds).toEqual(["comm1"]);
  });

  it("is a pure function with no I/O -- same input always produces same output", () => {
    const records = [comm({ id: "c1", occurredAt: new Date("2026-09-01T00:00:00.000Z") })];
    const a = computeLastContact(records);
    const b = computeLastContact(records);
    expect(a).toEqual(b);
  });
});
