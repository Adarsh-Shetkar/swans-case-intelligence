// src/app/matters/[id]/page.tsx
"use client";
import { use } from "react";
import { useApi } from "@/lib/hooks";
import { EvidenceProvider } from "@/components/evidence/EvidenceProvider";
import { Async } from "@/components/case/Async";
import { CaseHeader } from "@/components/case/CaseHeader";
import { KpiRow } from "@/components/case/KpiRow";
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
      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <Async state={pulse} height="h-24">{(p) => <CaseHeader pulse={p} />}</Async>
        <Async state={timeline} height="h-12">{(t) => <SinceLastOpened matterId={id} events={t} />}</Async>
        <Async state={pulse} height="h-28">{(p) => <KpiRow pulse={p} />}</Async>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Async state={digest} height="h-56">{(d) => <DigestCard digest={d} />}</Async>
          </div>
          <Async state={actions} height="h-56">{(a) => <ActionCenter actions={a} />}</Async>
        </div>
        <Async state={timeline} height="h-80">{(t) => <Timeline events={t} />}</Async>
      </main>
    </EvidenceProvider>
  );
}