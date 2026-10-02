// src/app/page.tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";

// Opens the most recently synced matter, or the mock matter when not live.
export default async function Home() {
  await connection();
  if (process.env.DATA_SOURCE !== "clio") redirect("/matters/mock-1");

  const matter = await db.matter.findFirst({ orderBy: { lastSyncedAt: "desc" } });
  if (!matter) {
    return (
      <main className="mx-auto max-w-xl p-10 text-sm">
        No matters synced yet. Run <code>POST /api/ingest</code>, then reload.
      </main>
    );
  }
  redirect(`/matters/${matter.id}`);
}
