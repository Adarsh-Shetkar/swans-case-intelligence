// src/components/case/CaseHeader.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "@/components/share/ShareDialog";
import { ago } from "@/lib/format";
import type { Pulse } from "@/lib/api-contract";

export function CaseHeader({ pulse }: { pulse: Pulse }) {
  const initials = pulse.client.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <header className="flex flex-wrap items-center gap-4">
      {pulse.client.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pulse.client.photoUrl} alt={pulse.client.name} className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold">{initials}</div>
      )}
      <div className="flex-1">
        <h1 className="text-2xl font-semibold">{pulse.client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {pulse.matter.displayNumber} · {pulse.matter.practiceArea ?? "Matter"} · synced {ago(pulse.matter.syncedAt)}
        </p>
        <p className="mt-1 text-sm">{pulse.posture}</p>
      </div>
      <Badge>{pulse.matter.status}</Badge>
      <ShareDialog matterId={pulse.matter.id} />
    </header>
  );
}