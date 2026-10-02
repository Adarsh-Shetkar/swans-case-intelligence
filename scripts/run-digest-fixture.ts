import "dotenv/config";
import { buildFixtureMatter, buildFollowUpRecord } from "./fixture-data";
import { InMemoryDigestRepository } from "../src/lib/ai/in-memory-repository";
import { runDigest, type RunDigestResult } from "../src/lib/ai/run-digest";
import { estimateCostUsd } from "../src/lib/ai/cost";
import { config as geminiConfig } from "../src/lib/ai/gemini";

/**
 * End-to-end smoke test for the whole AI pipeline, with NO database and NO
 * Prisma Client required — only lib/ai/in-memory-repository.ts, which
 * implements the exact same DigestRepository interface the real Postgres
 * repository does.
 *
 * Runs three digests against the fixture matter to demonstrate the central
 * architectural claim of this pipeline:
 *   Run 1 — full first run: AI processes all 20 records, produces events
 *           and insights.
 *   Run 2 — nothing changed: ZERO AI calls, confirms the matter-level
 *           fingerprint skip works.
 *   Run 3 — one new record arrives: AI processes exactly that one record
 *           for events (not all 21), while insights are still re-synthesized
 *           from the full current set so they stay coherent.
 *
 * Usage:
 *   AI_USE_STUB=true npx tsx scripts/run-digest-fixture.ts   # no API key needed
 *   npx tsx scripts/run-digest-fixture.ts                     # uses GEMINI_API_KEY if set
 */

function printReport(label: string, result: RunDigestResult): void {
  const cost = estimateCostUsd(result.usage.inputTokens, result.usage.outputTokens);
  console.log(`\n--- ${label} ---`);
  console.log(`ranAi: ${result.ranAi}  |  reason: ${result.reason}  |  digestVersion: ${result.digestVersion}`);
  console.log(`events created: ${result.eventsCreated}  |  events merged: ${result.eventsMerged}  |  insights written: ${result.insightsWritten}`);
  console.log(
    `usage: ${result.usage.calls} AI call(s), ${result.usage.inputTokens} input / ${result.usage.outputTokens} output tokens (~$${cost} at configured rates)`
  );
  if (result.errors.length > 0) {
    console.log(`errors: ${JSON.stringify(result.errors)}`);
  }
}

function printEvents(repo: InMemoryDigestRepository): void {
  console.log(`\nCurrent CaseEvents (${repo.caseEvents.length}), ranked by importance:`);
  const sorted = [...repo.caseEvents].sort((a, b) => b.importance - a.importance);
  for (const e of sorted) {
    console.log(
      `  [${e.importance.toString().padStart(3)}] (${e.category}) ${e.occurredAt.toISOString().slice(0, 10)} — ${e.title}  <- ${e.sourceRecordIds.join(", ")}`
    );
  }
}

function printInsights(repo: InMemoryDigestRepository): void {
  const latestVersion =
    repo.insights.length > 0 ? Math.max(...repo.insights.map((i) => i.digestVersion)) : 0;
  const current = repo.insights.filter((i) => i.digestVersion === latestVersion);
  console.log(`\nCurrent Insights (digestVersion ${latestVersion}):`);
  for (const i of current) {
    console.log(`  [${i.confidence}] ${i.type}: ${i.label} — ${i.value}  <- ${i.sourceRecordIds.join(", ") || "(no source)"}`);
  }
}

async function main() {
  console.log(`Mode: ${geminiConfig.USE_STUB ? "STUB (deterministic, no API calls)" : `LIVE (${geminiConfig.MODEL})`}`);

  const { matter, records } = buildFixtureMatter();
  const repo = new InMemoryDigestRepository();
  for (const record of records) repo.seedRecord(matter.id, record);

  console.log(`\nFixture matter: ${matter.displayNumber} (${records.length} source records)`);

  const run1 = await runDigest(matter.id, repo);
  printReport("Run 1: full first digest", run1);

  const run2 = await runDigest(matter.id, repo);
  printReport("Run 2: no new data", run2);
  if (run2.usage.calls !== 0) {
    console.error("\n❌ FAIL: expected zero AI calls on an unchanged matter, got", run2.usage.calls);
    process.exitCode = 1;
  } else {
    console.log("✅ Confirmed: zero AI calls when nothing changed.");
  }

  repo.seedRecord(matter.id, buildFollowUpRecord());
  const run3 = await runDigest(matter.id, repo);
  printReport("Run 3: one new record arrives", run3);

  printEvents(repo);
  printInsights(repo);

  const totalCost = estimateCostUsd(
    run1.usage.inputTokens + run2.usage.inputTokens + run3.usage.inputTokens,
    run1.usage.outputTokens + run2.usage.outputTokens + run3.usage.outputTokens
  );
  console.log(`\nTotal estimated cost across all 3 runs: ~$${totalCost}`);
}

main().catch((err) => {
  console.error("Fixture harness failed:", err);
  process.exit(1);
});
