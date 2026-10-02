import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { buildProviderView } from "./buildProviderView";
import type { ShareCategory, ShareSummary } from "@/lib/api-contract";

type Input = { providerName: string; visibleCategories: ShareCategory[]; requests: string[] };

const toSummary = (s: Awaited<ReturnType<typeof db.providerShare.findUnique>> & {}) : ShareSummary => ({
  id: s.id,
  providerName: s.providerName,
  visibleCategories: s.visibleCategories as ShareCategory[],
  createdAt: s.createdAt.toISOString(),
  viewCount: s.viewCount,
  lastViewedAt: s.lastViewedAt?.toISOString(),
  revoked: !!s.revokedAt,
});

export async function createShare(matterId: string, input: Input) {
  const s = await db.providerShare.create({
    data: { id: randomBytes(16).toString("hex"), matterId, ...input },
  });
  return toSummary(s);
}

export async function listShares(matterId: string) {
  const rows = await db.providerShare.findMany({ where: { matterId }, orderBy: { createdAt: "desc" } });
  return rows.map(toSummary);
}

export async function revokeShare(matterId: string, shareId: string) {
  await db.providerShare.updateMany({ where: { id: shareId, matterId }, data: { revokedAt: new Date() } });
}

// Called by the public provider page. Counts a view, then builds the allowlisted payload.
export async function openShare(shareId: string) {
  const s = await db.providerShare.findUnique({ where: { id: shareId } });
  if (!s || s.revokedAt) return null;
  await db.providerShare.update({
    where: { id: s.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  return buildProviderView(s.matterId, {
    providerName: s.providerName,
    visibleCategories: s.visibleCategories,
    requests: s.requests,
    since: s.lastViewedAt ?? undefined, // powers the "New" badges
  });
}