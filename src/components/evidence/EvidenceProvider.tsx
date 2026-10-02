// src/components/evidence/EvidenceProvider.tsx
"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/hooks";
import { day } from "@/lib/format";
import type { EvidenceRecord } from "@/lib/api-contract";

type Ctx = { open: (ids: string[]) => void };
const EvidenceCtx = createContext<Ctx | null>(null);

export function EvidenceProvider({ matterId, children }: { matterId: string; children: ReactNode }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const { data, loading, error } = useApi<EvidenceRecord[]>(
    ids ? `/api/matters/${matterId}/evidence?ids=${ids.join(",")}` : null
  );

  return (
    <EvidenceCtx.Provider value={{ open: setIds }}>
      {children}
      <Sheet open={!!ids} onOpenChange={(o) => !o && setIds(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Source records</SheetTitle></SheetHeader>
          <div className="space-y-3 p-4">
            {loading && <Skeleton className="h-24 w-full" />}
            {error && <p className="text-sm text-red-600">Couldn't load sources.</p>}
            {data?.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary">{r.clioType}</Badge>
                  <span className="text-xs text-muted-foreground">{day(r.occurredAt)}</span>
                </div>
                <p className="text-sm font-medium">{r.subject ?? "(untitled)"}</p>
                {r.author && <p className="text-xs text-muted-foreground">{r.author}</p>}
                {r.excerpt && <p className="mt-2 text-sm">{r.excerpt}</p>}
                {r.clioUrl && (
                  <a href={r.clioUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-600 underline">
                    Open in Clio
                  </a>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </EvidenceCtx.Provider>
  );
}

export const useEvidence = () => {
  const c = useContext(EvidenceCtx);
  if (!c) throw new Error("Wrap in <EvidenceProvider>");
  return c;
};