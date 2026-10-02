// src/components/case/DigestCard.tsx
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import type { Digest } from "@/lib/api-contract";

// Live facts arrive as "Label: value (confidence)"; mocks are plain sentences.
function splitFact(text: string) {
  const hedge = text.match(/\s\((inferred|unknown)\)$/);
  const body = hedge ? text.slice(0, hedge.index) : text;
  const i = body.indexOf(": ");
  return i > 0 && i < 60
    ? { label: body.slice(0, i), value: body.slice(i + 2), hedge: hedge?.[1] }
    : { label: null, value: body, hedge: hedge?.[1] };
}

export function DigestCard({ digest }: { digest: Digest }) {
  return (
    <Card className="h-full p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Case digest</h2>
        <span className="ml-auto text-xs text-muted-foreground">AI-generated · every fact sourced</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {digest.keyFacts.map((f, i) => {
          const { label, value, hedge } = splitFact(f.text);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-2">
                {label && <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{label}</p>}
                {hedge && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 capitalize">
                    {hedge}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed">{value}</p>
              <div className="mt-auto">
                <SourceChip ids={f.sourceRecordIds} />
              </div>
            </div>
          );
        })}
      </div>
      {digest.keyFacts.length === 0 && <p className="text-sm text-muted-foreground">{digest.summary}</p>}
    </Card>
  );
}
