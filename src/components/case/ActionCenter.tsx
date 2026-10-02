// src/components/case/ActionCenter.tsx
import { Card } from "@/components/ui/card";
import { SourceChip } from "@/components/evidence/SourceChip";
import { ago } from "@/lib/format";
import type { ActionItem, Actions } from "@/lib/api-contract";

function Group({ title, items, dot, badge }: { title: string; items: ActionItem[]; dot: string; badge: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="pl-4 text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="leading-snug">{a.title}</span>
                <SourceChip ids={a.sourceRecordIds} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[a.owner, a.dueAt && `due ${ago(a.dueAt)}`].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActionCenter({ actions }: { actions: Actions }) {
  return (
    <Card className="h-full space-y-5 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Action center</h2>
      <Group title="Overdue" items={actions.overdue} dot="bg-red-500" badge="bg-red-100 text-red-700" />
      <Group title="Waiting on others" items={actions.waitingOn} dot="bg-amber-500" badge="bg-amber-100 text-amber-800" />
      <Group title="Upcoming" items={actions.upcoming} dot="bg-sky-500" badge="bg-sky-100 text-sky-700" />
    </Card>
  );
}
