// src/components/case/KpiRow.tsx
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago, money } from "@/lib/format";
import type { Kpi, Pulse } from "@/lib/api-contract";

function Tile({ label, value, ids, hint }: { label: string; value: string; ids?: string[]; hint?: string }) {
  const missing = value === "—";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${missing ? "text-muted-foreground" : ""}`}>
        {missing ? "Not determinable" : value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2">{ids && <SourceChip ids={ids} />}</div>
    </Card>
  );
}

const fmt = (k?: Kpi) =>
  !k ? "—" : k.amount != null ? money(k.amount) : k.min != null && k.max != null ? `${money(k.min)} – ${money(k.max)}` : "—";

export function KpiRow({ pulse }: { pulse: Pulse }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Tile label="Case value" value={fmt(pulse.value)} ids={pulse.value?.sourceRecordIds} />
      <Tile label="Coverage" value={fmt(pulse.coverage)} ids={pulse.coverage?.sourceRecordIds} />
      <Tile label="Medical specials" value={fmt(pulse.specials)} ids={pulse.specials?.sourceRecordIds} />
      <Tile label="Firm spend" value={fmt(pulse.expenses)} ids={pulse.expenses?.sourceRecordIds} />
      <Tile
        label="Last client contact"
        value={pulse.lastClientContact ? ago(pulse.lastClientContact.at) : "—"}
        hint={pulse.lastClientContact?.summary}
        ids={pulse.lastClientContact?.sourceRecordIds}
      />
    </div>
  );
}