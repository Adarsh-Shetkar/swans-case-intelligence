// src/lib/data/live.ts
// Postgres-backed implementations of the API contract (DATA_SOURCE=clio).
// Reads only what ingestion and the digest pipeline already wrote; no AI calls here.
import { db } from "@/lib/db";
import { classifyMatterField, extractMoneyAmounts, type MatterFieldRole } from "@/lib/ai/matter-fields";
import type { Digest, EvidenceRecord, Kpi, Pulse } from "@/lib/api-contract";

export { getTimeline } from "@/lib/ai/timeline";
export { getActions } from "@/lib/ai/actions";

async function latestInsights(matterId: string) {
  const [event, insight] = await Promise.all([
    db.caseEvent.findFirst({ where: { matterId }, orderBy: { digestVersion: "desc" } }),
    db.insight.findFirst({ where: { matterId }, orderBy: { digestVersion: "desc" } }),
  ]);
  const version = Math.max(event?.digestVersion ?? 0, insight?.digestVersion ?? 0);
  return version ? db.insight.findMany({ where: { matterId, digestVersion: version } }) : [];
}

type FieldRecord = { id: string; subject: string | null; rawContent: string | null };

// A KPI straight from a Clio custom field: one amount, or a min–max range for case value.
function fieldKpi(fields: FieldRecord[], role: MatterFieldRole): Kpi | undefined {
  const f = fields.find((r) => r.subject && classifyMatterField(r.subject) === role);
  if (!f?.subject) return undefined;
  const value = (f.rawContent ?? "").replace(`${f.subject}: `, "");
  const amounts = extractMoneyAmounts(value);
  if (amounts.length === 0) return undefined;
  if (role === "case_value" && amounts.length > 1)
    return { min: Math.min(...amounts), max: Math.max(...amounts), sourceRecordIds: [f.id] };
  return { amount: amounts[0], sourceRecordIds: [f.id] };
}

export async function getPulse(matterId: string): Promise<Pulse> {
  const matter = await db.matter.findUnique({ where: { id: matterId } });
  if (!matter) throw new Error(`Matter ${matterId} not found; run POST /api/ingest first`);

  const [fields, lastComm, insights] = await Promise.all([
    db.sourceRecord.findMany({ where: { matterId, clioType: "matter_field" } }),
    db.sourceRecord.findFirst({ where: { matterId, clioType: "communication" }, orderBy: { occurredAt: "desc" } }),
    latestInsights(matterId),
  ]);
  const byType = (t: string) => insights.find((i) => i.type === t);

  return {
    matter: {
      id: matter.id,
      displayNumber: matter.displayNumber,
      name: matter.description ?? matter.displayNumber,
      status: matter.status,
      syncedAt: matter.lastSyncedAt.toISOString(),
    },
    client: { name: matter.clientName ?? "Unknown client" },
    posture: byType("posture")?.value ?? "Not digested yet.",
    value: fieldKpi(fields, "case_value"),
    coverage: fieldKpi(fields, "coverage_limits"),
    specials: fieldKpi(fields, "medical_specials"),
    lastClientContact: lastComm
      ? {
          at: lastComm.occurredAt.toISOString(),
          summary: lastComm.subject ?? lastComm.excerpt ?? "",
          sourceRecordIds: [lastComm.id],
        }
      : undefined,
    topRisk: byType("blocker")?.value,
  };
}

const HEDGED = new Set(["inferred", "unknown"]);
const BARE_AMOUNT = /^\$[\d,]+(\.\d+)?$/;

export async function getDigest(matterId: string): Promise<Digest> {
  const insights = await latestInsights(matterId);
  const posture = insights.find((i) => i.type === "posture");
  return {
    summary: posture?.value ?? "No digest yet. Sync the matter to generate one.",
    keyFacts: insights
      .filter((i) => i.type !== "posture" && i.type !== "last_contact")
      // A bare dollar figure (e.g. "Estimated Case Value: $375,000") is already a KPI tile.
      .filter((i) => !BARE_AMOUNT.test(i.value.trim()))
      .map((i) => ({
        text: `${i.label}: ${i.value}${HEDGED.has(i.confidence) ? ` (${i.confidence})` : ""}`,
        sourceRecordIds: i.sourceRecordIds,
      })),
  };
}

export async function getEvidence(matterId: string, ids: string[]): Promise<EvidenceRecord[]> {
  const rows = await db.sourceRecord.findMany({ where: { matterId, id: { in: ids } } });
  return rows.map((r) => ({
    id: r.id,
    clioType: r.clioType,
    occurredAt: r.occurredAt.toISOString(),
    author: r.author ?? undefined,
    subject: r.subject ?? undefined,
    excerpt: r.excerpt ?? undefined,
  }));
}
