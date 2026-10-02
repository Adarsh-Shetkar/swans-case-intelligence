import * as data from "@/lib/data";
import type { ProviderEvent, ProviderViewData, TimelineEvent } from "@/lib/api-contract";

const TREATMENT = new Set(["treatment", "surgery"]);
const RECORDS = new Set(["records"]);

export async function buildProviderView(
  matterId: string,
  input: { providerName: string; visibleCategories: string[]; requests: string[]; since?: Date }
): Promise<ProviderViewData> {
  const [pulse, timeline, actions] = await Promise.all([
    data.getPulse(matterId),
    data.getTimeline(matterId),
    data.getActions(matterId),
  ]);

  const on = new Set(input.visibleCategories);

  // Copies ONLY these fields. sourceRecordIds, importance, etc. never leave.
  const lite = (e: TimelineEvent): ProviderEvent => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    occurredAt: e.occurredAt,
    isNew: input.since ? new Date(e.occurredAt) > input.since : undefined,
  });
  const pick = (cats: Set<string>) =>
    timeline
      .filter((e) => cats.has(e.category))
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
      .map(lite);

  const lastActivityAt = timeline.map((e) => e.occurredAt).sort().reverse()[0];

  const view: ProviderViewData = {
    providerName: input.providerName,
    clientName: pulse.client.name,
    matterNumber: pulse.matter.displayNumber,
    generatedAt: new Date().toISOString(),
  };

  if (on.has("status"))
    view.status = {
      label: pulse.matter.status,
      active: pulse.matter.status.toLowerCase() === "open",
      lastActivityAt,
    };
  if (on.has("coverage") && pulse.coverage)
    view.coverage = { amount: pulse.coverage.amount, min: pulse.coverage.min, max: pulse.coverage.max };
  if (on.has("bills") && pulse.specials) view.bills = { amount: pulse.specials.amount };
  if (on.has("treatment")) view.treatment = pick(TREATMENT);
  if (on.has("records")) view.records = pick(RECORDS);
  if (on.has("dates"))
    view.dates = actions.upcoming
      .map((a) => ({ id: a.id, title: a.title, dueAt: a.dueAt }));
  if (on.has("requests")) view.requests = input.requests;

  return view;
}