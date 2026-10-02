import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ago, day, money } from "@/lib/format";
import type { ProviderEvent, ProviderViewData } from "@/lib/api-contract";

const range = (c: { amount?: number; min?: number; max?: number }) =>
  c.amount != null ? money(c.amount)
  : c.min != null && c.max != null ? `${money(c.min)} – ${money(c.max)}`
  : "Not confirmed";

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
);

function Events({ title, items }: { title: string; items: ProviderEvent[] }) {
  return (
    <Card className="p-5">
      <H>{title}</H>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-medium">
                {e.title} {e.isNew && <Badge className="ml-1">New</Badge>}
              </p>
              <p>{e.summary}</p>
              <p className="text-xs text-muted-foreground">{day(e.occurredAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ProviderView({ view }: { view: ProviderViewData }) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Case update for {view.providerName}</p>
        <h1 className="text-2xl font-semibold">{view.clientName}</h1>
        <p className="text-sm text-muted-foreground">Matter {view.matterNumber}</p>
      </header>

      {view.status && (
        <Card className={`p-5 ${view.status.active ? "border-emerald-200 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
          <p className="text-lg font-semibold">
            {view.status.active ? "Case active" : `Case ${view.status.label.toLowerCase()}`}
          </p>
          {view.status.lastActivityAt && (
            <p className="text-sm text-muted-foreground">Last activity {ago(view.status.lastActivityAt)}</p>
          )}
        </Card>
      )}

      {(view.coverage || view.bills) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {view.coverage && (
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Coverage on file</p>
              <p className="mt-1 text-2xl font-semibold">{range(view.coverage)}</p>
            </Card>
          )}
          {view.bills && (
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Medical bills to date</p>
              <p className="mt-1 text-2xl font-semibold">{range(view.bills)}</p>
            </Card>
          )}
        </div>
      )}

      {view.requests && (
        <Card className="p-5">
          <H>What the firm needs from your office</H>
          {view.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing right now.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {view.requests.map((r, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden>☐</span>{r}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {view.treatment && <Events title="Treatment updates" items={view.treatment} />}
      {view.records && <Events title="Records activity" items={view.records} />}

      {view.dates && (
        <Card className="p-5">
          <H>Upcoming dates</H>
          {view.dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {view.dates.map((d) => (
                <li key={d.id}>{d.title}{d.dueAt && <span className="text-muted-foreground"> · {day(d.dueAt)}</span>}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Limited view shared by the firm. It updates automatically as the case moves.
      </p>
    </div>
  );
}