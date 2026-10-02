// src/components/evidence/SourceChip.tsx
"use client";
import { FileText } from "lucide-react";
import { useEvidence } from "./EvidenceProvider";

export function SourceChip({ ids, label = "Source" }: { ids: string[]; label?: string }) {
  const { open } = useEvidence();
  if (!ids.length) return null;
  return (
    <button
      onClick={() => open(ids)}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
    >
      <FileText className="h-3 w-3" /> {label}{ids.length > 1 ? ` (${ids.length})` : ""}
    </button>
  );
}