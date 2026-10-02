// src/components/case/KpiRow.tsx
import { Scale, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { money } from "@/lib/format";
import type { Kpi, Pulse } from "@/lib/api-contract";

const fmt = (k?: Kpi) =>
  !k ? null : k.amount != null ? money(k.amount) : k.min != null && k.max != null ? `${money(k.min)} – ${money(k.max)}` : null;

function Tile({ icon: Icon, label, kpi, accent }: { icon: typeof Scale; label: string; kpi?: Kpi; accent: string }) {
  const value = fmt(kpi);
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${value ? "" : "text-base text-muted-foreground"}`}>
        {value ?? "Not in Clio"}
      </p>
      <div className="mt-3 h-6">{kpi && <SourceChip ids={kpi.sourceRecordIds} />}</div>
    </Card>
  );
}

// Deterministic: compares two Clio custom-field amounts, no AI involved.
function CoverageGap({ coverage, specials }: { coverage: Kpi; specials: Kpi }) {
  const c = coverage.amount!;
  const s = specials.amount!;
  const short = s > c;
  const pct = Math.min(100, Math.round((c / s) * 100));
  return (
    <Card className={`p-5 ${short ? "border-rose-200 bg-rose-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${short ? "text-rose-800" : "text-emerald-800"}`}>
          {short
            ? `Medical specials exceed known coverage by ${money(s - c)}`
            : `Known coverage exceeds medical specials by ${money(c - s)}`}
        </p>
        <SourceChip ids={[...coverage.sourceRecordIds, ...specials.sourceRecordIds]} />
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white ring-1 ring-black/5">
        <div className={`h-full rounded-full ${short ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Coverage {money(c)} covers {Math.round((c / s) * 100)}% of specials {money(s)}
      </p>
    </Card>
  );
}

export function KpiRow({ pulse }: { pulse: Pulse }) {
  const showGap = pulse.coverage?.amount != null && pulse.specials?.amount != null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Scale} label="Case value" kpi={pulse.value} accent="bg-indigo-500" />
        <Tile icon={ShieldCheck} label="Coverage" kpi={pulse.coverage} accent="bg-sky-500" />
        <Tile icon={Stethoscope} label="Medical specials" kpi={pulse.specials} accent="bg-rose-500" />
        <Tile icon={Wallet} label="Firm spend" kpi={pulse.expenses} accent="bg-slate-400" />
      </div>
      {showGap && <CoverageGap coverage={pulse.coverage!} specials={pulse.specials!} />}
    </div>
  );
}
