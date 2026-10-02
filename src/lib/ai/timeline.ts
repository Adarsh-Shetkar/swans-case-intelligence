import { db } from "../db";
import type { TimelineEvent } from "../api-contract";

/**
 * Plain function for API routes to call directly:
 * GET /api/matters/:id/timeline -> TimelineEvent[]
 *
 * Returns every CaseEvent for the matter (additive/historical -- see
 * run-digest.ts), ranked by importance, in exactly the shape
 * src/lib/api-contract.ts expects. No AI call happens here; this just
 * reads whatever the last digest run already wrote.
 */
export async function getTimeline(matterId: string): Promise<TimelineEvent[]> {
  const events = await db.caseEvent.findMany({
    where: { matterId },
    orderBy: { importance: "desc" },
  });

  return events.map(
    (e: {
      id: string;
      title: string;
      category: string;
      importance: number;
      summary: string;
      occurredAt: Date;
      sourceRecordIds: string[];
    }): TimelineEvent => ({
      id: e.id,
      title: e.title,
      category: e.category,
      importance: e.importance,
      summary: e.summary,
      occurredAt: e.occurredAt.toISOString(),
      sourceRecordIds: e.sourceRecordIds,
    })
  );
}
