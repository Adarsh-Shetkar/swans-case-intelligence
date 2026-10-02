import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as data from "@/lib/data";
import { SHARE_KEYS } from "@/lib/share/categories";
import { buildProviderView } from "@/lib/share/buildProviderView";
import { createShare, listShares, revokeShare } from "@/lib/share/shares";

type Ctx = { params: Promise<{ id: string; resource: string }> };

const ShareBody = z.object({
  providerName: z.string().trim().min(1).max(100),
  visibleCategories: z.array(z.enum(SHARE_KEYS)),
  requests: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, resource } = await params;
  try {
    switch (resource) {
      case "pulse": return NextResponse.json(await data.getPulse(id));
      case "digest": return NextResponse.json(await data.getDigest(id));
      case "timeline": return NextResponse.json(await data.getTimeline(id));
      case "actions": return NextResponse.json(await data.getActions(id));
      case "shares": return NextResponse.json(await listShares(id));
      case "evidence": {
        const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
        return NextResponse.json(await data.getEvidence(id, ids));
      }
      default: return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 501 });
  }
}

// "preview" builds the provider payload without saving anything. "shares" creates a link.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, resource } = await params;
  if (resource !== "shares" && resource !== "preview")
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = ShareBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    if (resource === "preview") return NextResponse.json(await buildProviderView(id, parsed.data));
    return NextResponse.json(await createShare(id, parsed.data), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, resource } = await params;
  const shareId = req.nextUrl.searchParams.get("shareId");
  if (resource !== "shares" || !shareId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await revokeShare(id, shareId);
  return NextResponse.json({ ok: true });
}