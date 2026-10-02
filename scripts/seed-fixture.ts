import "dotenv/config";
import { db as prisma } from "../src/lib/db";
import { buildFixtureMatter } from "./fixture-data";

/**
 * Seeds the same synthetic fixture used by scripts/run-digest-fixture.ts
 * into a real Postgres database, for anyone who wants to exercise the full
 * stack (API routes, frontend) against real rows before Person A's live
 * Clio ingestion is wired in.
 *
 * Requires `npm run db:generate` and `npm run db:push` to have been run
 * first (needs network access to Prisma's binary host — see README for why
 * that step couldn't be completed in this build's sandbox).
 */
async function main() {
  const { matter, records } = buildFixtureMatter();

  await prisma.matter.upsert({
    where: { id: matter.id },
    create: {
      id: matter.id,
      clioId: matter.clioId,
      displayNumber: matter.displayNumber,
      status: matter.status,
      description: matter.description,
      lastSyncedAt: new Date(),
      rawSnapshotHash: "fixture-seed",
    },
    update: {
      displayNumber: matter.displayNumber,
      status: matter.status,
      description: matter.description,
      lastSyncedAt: new Date(),
    },
  });

  for (const record of records) {
    await prisma.sourceRecord.upsert({
      where: { matterId_clioType_clioId: { matterId: matter.id, clioType: record.clioType, clioId: record.id } },
      create: {
        matterId: matter.id,
        clioType: record.clioType,
        clioId: record.id,
        occurredAt: record.occurredAt,
        author: record.author,
        subject: record.subject,
        rawContent: record.rawContent,
        contentHash: record.contentHash,
      },
      update: {
        occurredAt: record.occurredAt,
        author: record.author,
        subject: record.subject,
        rawContent: record.rawContent,
        contentHash: record.contentHash,
      },
    });
  }

  console.log(`Seeded matter "${matter.displayNumber}" (${matter.id}) with ${records.length} source records.`);
  console.log(`Next: npm run digest -- --matter=${matter.id}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
