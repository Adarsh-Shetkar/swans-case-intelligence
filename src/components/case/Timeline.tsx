// src/components/case/Timeline.tsx
"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SourceChip } from "@/components/evidence/SourceChip";
import { day, month } from "@/lib/format";
import { categoryStyle, importanceLevel } from "@/lib/categories";
import type { TimelineEvent } from "@/lib/api-contract";

const dot = (n: number) => (n >= 85 ? "bg-red-500" : n >= 70 ? "bg-orange-500" : n >= 50 ? "bg-amber-400" : "bg-slate-300");

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const [top, setTop] = useState(true);
  const [cat, setCat] = useState<string | null>(null);

  const cats = useMemo(() => [...new Set(events.map((e) => e.category))], [events]);
  const shown = useMemo(() => {
    let list = [...events];
    if (top) list = list.sort((a, b) => b.importance - a.importance).slice(0, 10);
    if (cat) list = list.filter((e) => e.category === cat);
    return list.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
  }, [events, top, cat]);

  const groups = useMemo(() => {
    const g = new Map<string, TimelineEvent[]>();
    shown.forEach((e) => g.set(month(e.occurredAt), [...(g.get(month(e.occurredAt)) ?? []), e]));
    return [...g.entries()];
  }, [shown]);

  return (
    <Card className="p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h2>
        <div className="flex gap-1">
          <Button size="sm" variant={top ? "default" : "outline"} onClick={() => setTop(true)}>Top 10</Button>
          <Button size="sm" variant={!top ? "default" : "outline"} onClick={() => setTop(false)}>All ({events.length})</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <Button size="sm" variant={cat === null ? "secondary" : "ghost"} onClick={() => setCat(null)}>All</Button>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(cat === c ? null : c)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 transition-opacity ${categoryStyle(c)} ${cat && cat !== c ? "opacity-40" : ""}`}
          >
            {c}
          </button>
        ))}
      </div>
      {groups.map(([m, list]) => (
        <section key={m} className="mb-4">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{m}</h3>
          <ul className="space-y-4 border-l-2 border-muted pl-5">
            {list.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[23px] top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background ${dot(e.importance)}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{e.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ring-1 ${categoryStyle(e.category)}`}>{e.category}</span>
                      {e.importance >= 70 && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceLevel(e.importance).style}`}>
                          {importanceLevel(e.importance).label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{e.summary}</p>
                    <p className="text-xs text-muted-foreground">{day(e.occurredAt)}</p>
                  </div>
                  <SourceChip ids={e.sourceRecordIds} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}