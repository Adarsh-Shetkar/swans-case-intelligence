// src/components/case/DigestCard.tsx
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import type { Digest } from "@/lib/api-contract";

export function DigestCard({ digest }: { digest: Digest }) {
  return (
    <Card className="p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">✦ Case digest</h2>
      <p className="text-base leading-relaxed">{digest.summary}</p>
      <ul className="mt-4 space-y-2">
        {digest.keyFacts.map((f, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-sm">
            <span>• {f.text}</span>
            <SourceChip ids={f.sourceRecordIds} />
          </li>
        ))}
      </ul>
    </Card>
  );
}