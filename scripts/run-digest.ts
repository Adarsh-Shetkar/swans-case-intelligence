import "dotenv/config";
import { db as prisma } from "../src/lib/db";
import { prismaDigestRepository } from "../src/lib/ai/prisma-repository";
import { runDigest } from "../src/lib/ai/run-digest";
import { estimateCostUsd } from "../src/lib/ai/cost";
import { config as geminiConfig } from "../src/lib/ai/gemini";

/**
 * Real-database CLI entrypoint. Requires `npm run db:generate` +
 * `npm run db:push` to have been run, and a matter already populated via
 * Person A's Clio ingestion (or `npm run seed:fixture` for a synthetic
 * stand-in — see scripts/run-digest-fixture.ts for a version that needs no
 * database at all).
 *
 * Usage:
 *   npm run digest -- --matter=<our-internal-matter-id>
 */
async function main() {
  const matterArg = process.argv.find((a) => a.startsWith("--matter="));
  if (!matterArg) {
    console.error("Usage: npm run digest -- --matter=<matterId>");
    process.exit(1);
  }
  const matterId = matterArg.split("=")[1];

  console.log(`Mode: ${geminiConfig.USE_STUB ? "STUB (no API calls)" : `LIVE (${geminiConfig.MODEL})`}`);
  console.log(`Running digest for matter: ${matterId}`);

  const result = await runDigest(matterId, prismaDigestRepository);

  console.log(`\nranAi: ${result.ranAi}  |  reason: ${result.reason}  |  digestVersion: ${result.digestVersion}`);
  console.log(
    `events created: ${result.eventsCreated}  |  events merged: ${result.eventsMerged}  |  insights written: ${result.insightsWritten}`
  );
  if (result.errors.length > 0) {
    console.log(`errors: ${JSON.stringify(result.errors, null, 2)}`);
  }
  const cost = estimateCostUsd(result.usage.inputTokens, result.usage.outputTokens);
  console.log(
    `usage: ${result.usage.calls} AI call(s), ${result.usage.inputTokens} input / ${result.usage.outputTokens} output tokens (~$${cost})`
  );
}

main()
  .catch((err) => {
    console.error("Digest run failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
