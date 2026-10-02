// src/components/case/SinceLastOpened.tsx
"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago } from "@/lib/format";
import type { TimelineEvent } from "@/lib/api-contract";
import { useRef  } from "react";

export function SinceLastOpened({ matterId, events }: { matterId: string; events: TimelineEvent[] }) {
  const [since, setSince] = useState<string | null>(null);
  const key = `lastSeen:${matterId}`;
  // inside the component:
    const ran = useRef(false);

  useEffect(() => {
  if (ran.current) return;
  ran.current = true;
  try {
    setSince(localStorage.getItem(key));
    localStorage.setItem("lastSeen:mock-1", new Date(Date.now() - 4 * 864e5).toISOString())
  } catch {}
}, [key]);

  if (!since) return null; // first visit: nothing to compare against
  const fresh = events.filter((e) => new Date(e.occurredAt) > new Date(since));

  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <h2 className="text-sm font-semibold">
        ✦ Since you last opened this ({ago(since)}): {fresh.length || "no"} change{fresh.length === 1 ? "" : "s"}
      </h2>
      <ul className="mt-2 space-y-1">
        {fresh.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{e.title}: {e.summary}</span>
            <SourceChip ids={e.sourceRecordIds} />
          </li>
        ))}
      </ul>
    </Card>
  );
}