import { describe, it, expect, vi, beforeEach } from "vitest";

// Same isolation pattern as run-digest-matter-fields.test.ts: mock the two
// AI pipelines, keep planDigest/titleSimilarity real. Here synthesize is
// controllable per-test so we can simulate a failed run.
vi.mock("../src/lib/ai/categorize", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    categorizeAndRankEvents: vi.fn(async (_m: string, recs: any[]) => ({
      events: [],
      failedSourceRecordIds: [],
      processedSourceRecordIds: recs.map((r: any) => r.sourceRecordId),
      errors: [],
      usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
    })),
  };
});
vi.mock("../src/lib/ai/synthesize", () => ({
  synthesizeInsights: vi.fn(),
}));

import { runDigest } from "../src/lib/ai/run-digest";
import { synthesizeInsights } from "../src/lib/ai/synthesize";

function makeRepo(rows: any[]) {
  const insights: any[] = [];
  return {
    rows,
    insights,
    getMatterRecords: async () => rows,
    getLatestDigestVersion: async () => {
      const versions = insights.map((i) => i.digestVersion);
      return versions.length > 0 ? Math.max(...versions) : 0;
    },
    getExistingEventsForMerge: async () => [],
    createCaseEvent: async () => ({ id: "e1" }),
    updateCaseEvent: async () => {},
    createInsight: async (input: any) => {
      insights.push({ ...input });
      return { id: `i${insights.length}` };
    },
    getInsightsAtVersion: async (_matterId: string, version: number) =>
      insights
        .filter((i) => i.digestVersion === version)
        .map((i) => ({
          type: i.type,
          label: i.label,
          value: i.value,
          confidence: i.confidence,
          sourceRecordIds: i.sourceRecordIds,
        })),
    markRecordsDigested: async (ids: string[], hashes: Map<string, string>) => {
      for (const r of rows) if (ids.includes(r.id)) r.lastDigestedContentHash = hashes.get(r.id) ?? r.contentHash;
    },
  } as any;
}

const row = (id: string, clioType: string, over: Record<string, unknown> = {}) => ({
  id,
  matterId: "m1",
  clioType,
  clioId: id,
  occurredAt: new Date("2026-09-20T00:00:00Z"),
  author: null,
  subject: `subject ${id}`,
  excerpt: null,
  rawContent: `content ${id}`,
  contentHash: `h-${id}`,
  lastDigestedContentHash: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("runDigest insights-wipe guard", () => {
  it("carries forward the previous version's LLM insights when synthesis fails on a later run", async () => {
    const repo = makeRepo([row("n1", "note")]);

    // Run 1: synthesis succeeds, produces a posture insight.
    (synthesizeInsights as any).mockResolvedValueOnce({
      insights: [
        { type: "posture", label: "Case posture", value: "Case is in active litigation.", confidence: "ai_synthesis", sourceRecordIds: ["n1"] },
      ],
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    });
    const first = await runDigest("m1", repo);
    expect(first.ranAi).toBe(true);
    expect(repo.insights.some((i: any) => i.type === "posture")).toBe(true);

    // Something changes (new record), triggering run 2, but this time
    // synthesis fails entirely.
    repo.rows.push(row("n2", "note"));
    (synthesizeInsights as any).mockResolvedValueOnce({
      insights: [],
      error: "model unavailable",
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    });
    const second = await runDigest("m1", repo);
    expect(second.ranAi).toBe(true);
    expect(second.errors.some((e) => e.includes("synthesize_insights"))).toBe(true);

    // The posture insight must still be present AT THE NEW latest version,
    // carried forward rather than silently dropped.
    const latestVersion = second.digestVersion;
    const postureAtLatest = repo.insights.find((i: any) => i.type === "posture" && i.digestVersion === latestVersion);
    expect(postureAtLatest).toBeDefined();
    expect(postureAtLatest.value).toBe("Case is in active litigation.");
  });

  it("does not attempt to carry forward on the very first run (nothing to carry)", async () => {
    const repo = makeRepo([row("n1", "note")]);
    (synthesizeInsights as any).mockResolvedValueOnce({
      insights: [],
      error: "model unavailable",
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    });

    const result = await runDigest("m1", repo);
    expect(result.ranAi).toBe(true);
    // Only last_contact (deterministic) should exist -- nothing to carry forward.
    expect(repo.insights.every((i: any) => i.type === "last_contact")).toBe(true);
  });

  it("does not duplicate a deterministic insight when carrying forward", async () => {
    const repo = makeRepo([row("c1", "communication"), row("f1", "matter_field", { subject: "Estimated Case Value", rawContent: "Estimated Case Value: $375,000" })]);

    // The LLM independently mentions the same fact the deterministic field
    // extractor also covers -- same label, to exercise the dedup path.
    (synthesizeInsights as any).mockResolvedValueOnce({
      insights: [
        { type: "posture", label: "Case posture", value: "v1", confidence: "ai_synthesis", sourceRecordIds: ["c1"] },
        { type: "financial", label: "Estimated Case Value", value: "roughly $375k per case notes", confidence: "ai_synthesis", sourceRecordIds: ["c1"] },
      ],
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    });
    await runDigest("m1", repo);

    repo.rows.push(row("c2", "communication"));
    (synthesizeInsights as any).mockResolvedValueOnce({
      insights: [],
      error: "model unavailable",
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    });
    const second = await runDigest("m1", repo);

    const estimatedValueInsights = repo.insights.filter(
      (i: any) => i.digestVersion === second.digestVersion && i.label === "Estimated Case Value"
    );
    expect(estimatedValueInsights).toHaveLength(1); // not duplicated
  });
});
