// src/components/case/KeyDevelopments.tsx
// The three highest-importance events, so the biggest facts are seen first.
import { Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { categoryStyle, importanceLevel } from "@/lib/categories";
import { day } from "@/lib/format";
import type { TimelineEvent } from "@/lib/api-contract";

export function KeyDevelopments({ events }: { events: TimelineEvent[] }) {
  const top = [...events].sort((a, b) => b.importance - a.importance).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Key developments</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {top.map((e) => {
          const level = importanceLevel(e.importance);
          return (
            <Card key={e.id} className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${categoryStyle(e.category)}`}>
                  {e.category}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${level.style}`}>
                  {level.label} · {e.importance}
                </span>
              </div>
              <h3 className="text-base leading-snug font-semibold">{e.title}</h3>
              <p className="line-clamp-3 text-sm text-muted-foreground">{e.summary}</p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">{day(e.occurredAt)}</span>
                <SourceChip ids={e.sourceRecordIds} />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
