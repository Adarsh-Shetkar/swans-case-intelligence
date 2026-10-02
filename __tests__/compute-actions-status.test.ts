import { describe, it, expect } from "vitest";
import { computeActions, isTaskClosed, type TaskLikeRecord } from "../src/lib/ai/compute-actions";

const NOW = new Date("2026-10-02T12:00:00Z");
const task = (id: string, due: string, status: string | null | undefined, subject = id, rawContent = ""): TaskLikeRecord => ({
  id, subject, rawContent, author: null, occurredAt: new Date(due), status,
});

describe("completed tasks", () => {
  it("never appear as overdue, even with a past due date (e.g. a satisfied limitations date)", () => {
    const r = computeActions([task("sol", "2026-04-22", "complete", "Limitations Date")], NOW);
    expect(r.overdue).toEqual([]);
    expect(r.upcoming).toEqual([]);
    expect(r.waitingOn).toEqual([]);
  });
  it("are dropped before blocker keywords, so 'pending' in the text can't resurface them", () => {
    const r = computeActions([task("a", "2024-01-01", "complete", "Records", "still pending from provider")], NOW);
    expect(r.waitingOn).toEqual([]);
  });
  it("status match is case/whitespace tolerant", () => {
    expect(isTaskClosed(" Complete ")).toBe(true);
    expect(isTaskClosed("completed")).toBe(true);
  });
});

describe("open tasks keep their existing behavior", () => {
  it("pending past-due is overdue, future is upcoming", () => {
    const r = computeActions([
      task("late", "2026-09-26", "pending"),
      task("soon", "2026-10-07", "pending"),
    ], NOW);
    expect(r.overdue.map((i) => i.id)).toEqual(["late"]);
    expect(r.upcoming.map((i) => i.id)).toEqual(["soon"]);
  });
  it("missing or null status is treated as open (backward compatible)", () => {
    const r = computeActions([task("x", "2026-01-01", undefined), task("y", "2026-01-02", null)], NOW);
    expect(r.overdue).toHaveLength(2);
  });
  it("mixed list: only the open tasks are surfaced", () => {
    const r = computeActions([
      task("done1", "2023-05-14", "complete"),
      task("done2", "2026-09-02", "complete"),
      task("open", "2026-09-26", "pending"),
    ], NOW);
    expect(r.overdue.map((i) => i.id)).toEqual(["open"]);
  });
});
