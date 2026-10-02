// src/components/case/SinceLastOpened.tsx
"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago } from "@/lib/format";
import type { TimelineEvent } from "@/lib/api-contract";

function readLastSeen(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Only rendered client-side (after the timeline fetch), so reading localStorage on init is safe.
export function SinceLastOpened({ matterId, events }: { matterId: string; events: TimelineEvent[] }) {
  const key = `lastSeen:${matterId}`;
  const [since] = useState(() => readLastSeen(key));

  useEffect(() => {
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {}
  }, [key]);

  if (!since) return null; // first visit: nothing to compare against
  const fresh = events.filter((e) => new Date(e.occurredAt) > new Date(since));

  return (
    <Card className="border-indigo-200 bg-indigo-50/70 p-4">
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
