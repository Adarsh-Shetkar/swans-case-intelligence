import { describe, it, expect } from "vitest";
import { computeActions, type TaskLikeRecord } from "../src/lib/ai/compute-actions";

function task(overrides: Partial<TaskLikeRecord> & { id: string }): TaskLikeRecord {
  return {
    subject: null,
    rawContent: "Follow up on this task",
    author: null,
    occurredAt: new Date("2026-09-24T00:00:00.000Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-09-27T12:00:00.000Z");

describe("computeActions", () => {
  it("classifies a past-due task with no blocker language as overdue", () => {
    const result = computeActions(
      [task({ id: "t1", subject: "Submit filing", occurredAt: new Date("2026-09-20T00:00:00.000Z") })],
      NOW
    );
    expect(result.overdue).toHaveLength(1);
    expect(result.overdue[0].id).toBe("t1");
    expect(result.upcoming).toHaveLength(0);
    expect(result.waitingOn).toHaveLength(0);
  });

  it("classifies a future task with no blocker language as upcoming", () => {
    const result = computeActions(
      [task({ id: "t1", subject: "Prepare for hearing", occurredAt: new Date("2026-10-05T00:00:00.000Z") })],
      NOW
    );
    expect(result.upcoming).toHaveLength(1);
    expect(result.overdue).toHaveLength(0);
  });

  it("classifies blocker-language tasks as waitingOn regardless of date", () => {
    const pastButBlocked = task({
      id: "t1",
      subject: "Employment records overdue",
      rawContent: "Client has not yet provided requested employment documentation; overdue by two weeks.",
      occurredAt: new Date("2026-09-10T00:00:00.000Z"), // in the past
    });
    const futureButBlocked = task({
      id: "t2",
      subject: "Awaiting provider response",
      rawContent: "Still waiting on Coastal Orthopedics to send treatment notes.",
      occurredAt: new Date("2026-10-05T00:00:00.000Z"), // in the future
    });
    const result = computeActions([pastButBlocked, futureButBlocked], NOW);
    expect(result.waitingOn.map((i) => i.id).sort()).toEqual(["t1", "t2"]);
    expect(result.overdue).toHaveLength(0);
    expect(result.upcoming).toHaveLength(0);
  });

  it("carries owner from author and sourceRecordIds/id correctly", () => {
    const result = computeActions(
      [task({ id: "t1", subject: "Call client", author: "Paralegal Jane", occurredAt: new Date("2026-10-01T00:00:00.000Z") })],
      NOW
    );
    expect(result.upcoming[0].owner).toBe("Paralegal Jane");
    expect(result.upcoming[0].sourceRecordIds).toEqual(["t1"]);
  });

  it("falls back to truncated content as title when subject is missing", () => {
    const result = computeActions(
      [task({ id: "t1", subject: null, rawContent: "A very specific thing that needs doing soon", occurredAt: new Date("2026-10-01T00:00:00.000Z") })],
      NOW
    );
    expect(result.upcoming[0].title).toBe("A very specific thing that needs doing soon");
  });

  it("sorts each bucket by due date ascending", () => {
    const result = computeActions(
      [
        task({ id: "later", occurredAt: new Date("2026-10-10T00:00:00.000Z") }),
        task({ id: "sooner", occurredAt: new Date("2026-10-02T00:00:00.000Z") }),
      ],
      NOW
    );
    expect(result.upcoming.map((i) => i.id)).toEqual(["sooner", "later"]);
  });
});
