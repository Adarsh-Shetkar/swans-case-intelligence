// src/app/matters/[id]/page.tsx
"use client";
import { use } from "react";
import { useApi } from "@/lib/hooks";
import { ago } from "@/lib/format";
import { EvidenceProvider } from "@/components/evidence/EvidenceProvider";
import { ShareDialog } from "@/components/share/ShareDialog";
import { Async } from "@/components/case/Async";
import { CaseBrief } from "@/components/case/CaseBrief";
import { KpiRow } from "@/components/case/KpiRow";
import { KeyDevelopments } from "@/components/case/KeyDevelopments";
import { DigestCard } from "@/components/case/DigestCard";
import { ActionCenter } from "@/components/case/ActionCenter";
import { SinceLastOpened } from "@/components/case/SinceLastOpened";
import { Timeline } from "@/components/case/Timeline";
import type { Pulse, Digest, TimelineEvent, Actions } from "@/lib/api-contract";

export default function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const base = `/api/matters/${id}`;
  const pulse = useApi<Pulse>(`${base}/pulse`);
  const digest = useApi<Digest>(`${base}/digest`);
  const timeline = useApi<TimelineEvent[]>(`${base}/timeline`);
  const actions = useApi<Actions>(`${base}/actions`);

  return (
    <EvidenceProvider matterId={id}>
      <div className="min-h-full bg-slate-50">
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">S</div>
            <p className="font-semibold tracking-tight">Swans Case Intelligence</p>
            <div className="ml-auto flex items-center gap-3">
              {pulse.data && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Synced from Clio {ago(pulse.data.matter.syncedAt)}
                </span>
              )}
              <ShareDialog matterId={id} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-6">
          <Async state={pulse} height="h-72">{(p) => <CaseBrief pulse={p} actions={actions.data} />}</Async>
          <Async state={timeline} height="h-12">{(t) => <SinceLastOpened matterId={id} events={t} />}</Async>
          <Async state={pulse} height="h-32">{(p) => <KpiRow pulse={p} />}</Async>
          <Async state={timeline} height="h-48">{(t) => <KeyDevelopments events={t} />}</Async>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Async state={digest} height="h-64">{(d) => <DigestCard digest={d} />}</Async>
            </div>
            <Async state={actions} height="h-64">{(a) => <ActionCenter actions={a} />}</Async>
          </div>
          <Async state={timeline} height="h-80">{(t) => <Timeline events={t} />}</Async>
        </main>
      </div>
    </EvidenceProvider>
  );
}
