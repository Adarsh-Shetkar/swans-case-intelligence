// src/components/case/CaseBrief.tsx
// The hero: who, where the case stands, the top risk, and what needs attention.
import { CalendarClock, CircleAlert, Hourglass, Phone, TriangleAlert } from "lucide-react";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago } from "@/lib/format";
import type { Actions, Pulse } from "@/lib/api-contract";

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Phone; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <Icon className={`h-5 w-5 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

export function CaseBrief({ pulse, actions }: { pulse: Pulse; actions: Actions | null }) {
  const initials = pulse.client.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const open = pulse.matter.status.toLowerCase() === "open";

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl md:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/30 text-lg font-semibold ring-1 ring-white/20">
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{pulse.client.name}</h1>
          <p className="text-sm text-slate-300">
            {pulse.matter.name} · {pulse.matter.displayNumber}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            open ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30" : "bg-slate-400/15 text-slate-300 ring-slate-400/30"
          }`}
        >
          {pulse.matter.status}
        </span>
      </div>

      <div className="relative mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Where the case stands</p>
          <p className="mt-2 text-xl leading-snug font-medium text-white md:text-2xl">{pulse.posture}</p>

          {pulse.topRisk && (
            <div className="mt-5 flex gap-3 rounded-xl bg-amber-400/10 p-4 ring-1 ring-amber-300/30">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Top risk / blocker</p>
                <p className="mt-1 text-sm text-amber-50">{pulse.topRisk}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
          <Stat
            icon={CircleAlert}
            label="Overdue"
            value={actions ? `${actions.overdue.length} task${actions.overdue.length === 1 ? "" : "s"}` : "—"}
            tone={actions?.overdue.length ? "text-red-400" : "text-slate-400"}
          />
          <Stat
            icon={Hourglass}
            label="Waiting on others"
            value={actions ? `${actions.waitingOn.length} item${actions.waitingOn.length === 1 ? "" : "s"}` : "—"}
            tone={actions?.waitingOn.length ? "text-amber-300" : "text-slate-400"}
          />
          <Stat
            icon={CalendarClock}
            label="Upcoming"
            value={actions ? `${actions.upcoming.length} task${actions.upcoming.length === 1 ? "" : "s"}` : "—"}
            tone="text-sky-300"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Stat
                icon={Phone}
                label="Last client contact"
                value={pulse.lastClientContact ? ago(pulse.lastClientContact.at) : "No record"}
                tone="text-emerald-300"
              />
            </div>
            {pulse.lastClientContact && (
              <div className="rounded-full bg-white">
                <SourceChip ids={pulse.lastClientContact.sourceRecordIds} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
