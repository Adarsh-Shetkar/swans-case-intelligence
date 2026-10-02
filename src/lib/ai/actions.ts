import { db } from "../db";
import type { Actions } from "../api-contract";
import { computeActions, type TaskLikeRecord } from "./compute-actions";

/**
 * Plain function for API routes to call directly:
 * GET /api/matters/:id/actions -> Actions
 *
 * Thin DB read + delegation to the pure, independently-tested
 * computeActions() in ./compute-actions.ts.
 */
export async function getActions(matterId: string): Promise<Actions> {
  const records = await db.sourceRecord.findMany({
    where: { matterId, clioType: "task" },
  });

  const taskRecords: TaskLikeRecord[] = records.map(
    (r: {
      id: string;
      subject: string | null;
      rawContent: string | null;
      author: string | null;
      occurredAt: Date;
      status?: string | null;
    }) => ({
      id: r.id,
      subject: r.subject,
      rawContent: r.rawContent,
      author: r.author,
      occurredAt: r.occurredAt,
      status: r.status ?? null,
    })
  );

  return computeActions(taskRecords);
}
