// src/components/case/ActionCenter.tsx
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago } from "@/lib/format";
import type { ActionItem, Actions } from "@/lib/api-contract";

function Group({ title, items, tone }: { title: string; items: ActionItem[]; tone: string }) {
  return (
    <div>
      <h3 className={`mb-1 text-sm font-semibold ${tone}`}>{title} ({items.length})</h3>
      {items.length === 0 && <p className="text-xs text-muted-foreground">Nothing here.</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="flex items-start justify-between gap-2">
              <span>{a.title}</span>
              <SourceChip ids={a.sourceRecordIds} />
            </div>
            <p className="text-xs text-muted-foreground">
              {[a.owner, a.dueAt && ago(a.dueAt)].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActionCenter({ actions }: { actions: Actions }) {
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Action center</h2>
      <Group title="Overdue" items={actions.overdue} tone="text-red-600" />
      <Group title="Upcoming" items={actions.upcoming} tone="text-amber-600" />
      <Group title="Waiting on others" items={actions.waitingOn} tone="text-slate-600" />
    </Card>
  );
}