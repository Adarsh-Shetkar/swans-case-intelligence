import type { Actions, ActionItem } from "../api-contract";
import { BLOCKER_KEYWORDS, matchesAnyKeyword } from "./keywords";

/**
 * Pure, DB-free classification logic -- deliberately kept in its own file
 * with zero imports that touch Prisma, so it can be unit-tested (and
 * reasoned about) with no database, no generated Prisma Client, and no
 * module-load-time side effects at all. src/lib/ai/actions.ts wraps this
 * with the actual DB read for API routes to call.
 *
 * CONVENTIONS (please read if you're Person A normalizing Clio data), for
 * `clioType === "task"` records:
 *   - `occurredAt` is the task's DUE date, not its creation date. Map Clio's
 *     task `due_at` into `occurredAt` so overdue/upcoming is correct.
 *   - `status` is Clio's task status (pending | in_progress | in_review |
 *     complete). Completed tasks are dropped here: a finished task with a past
 *     due date is history, not an overdue item. A null/missing status is
 *     treated as open, so records ingested before this field existed behave
 *     exactly as they did before.
 */

export interface TaskLikeRecord {
  id: string;
  subject: string | null;
  rawContent: string | null;
  author: string | null;
  occurredAt: Date;
  status?: string | null;
}

const CLOSED_STATUSES: ReadonlySet<string> = new Set(["complete", "completed", "done", "closed"]);

export function isTaskClosed(status: string | null | undefined): boolean {
  return status != null && CLOSED_STATUSES.has(status.trim().toLowerCase());
}

function toTitle(r: TaskLikeRecord): string {
  if (r.subject) return r.subject;
  const content = r.rawContent ?? "";
  return content.length > 0 ? content.slice(0, 140) : "Untitled task";
}

function byDueDateAsc(a: ActionItem, b: ActionItem): number {
  return new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime();
}

/**
 * Classification order matters: closed tasks are dropped first, before any
 * keyword matching, so a completed task whose text mentions "pending" can't
 * resurface as waitingOn. Then a task whose text matches a blocker keyword
 * (e.g. "waiting on", "outstanding", "pending") is `waitingOn` REGARDLESS of
 * its due date, because that's a statement about being blocked on someone
 * else, not a scheduling fact. Everything else falls back to a pure date
 * comparison against `now`.
 */
export function computeActions(records: TaskLikeRecord[], now: Date = new Date()): Actions {
  const overdue: ActionItem[] = [];
  const upcoming: ActionItem[] = [];
  const waitingOn: ActionItem[] = [];

  for (const r of records) {
    if (isTaskClosed(r.status)) continue;

    const text = `${r.subject ?? ""} ${r.rawContent ?? ""}`;
    const item: ActionItem = {
      id: r.id,
      title: toTitle(r),
      dueAt: r.occurredAt.toISOString(),
      owner: r.author ?? undefined,
      sourceRecordIds: [r.id],
    };

    if (matchesAnyKeyword(text, [BLOCKER_KEYWORDS])) {
      waitingOn.push(item);
    } else if (r.occurredAt.getTime() < now.getTime()) {
      overdue.push(item);
    } else {
      upcoming.push(item);
    }
  }

  return {
    overdue: overdue.sort(byDueDateAsc),
    upcoming: upcoming.sort(byDueDateAsc),
    waitingOn: waitingOn.sort(byDueDateAsc),
  };
}
