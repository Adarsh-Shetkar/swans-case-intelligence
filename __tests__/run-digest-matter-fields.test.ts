import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate run-digest's own decisions from AI: mock the two AI pipelines but
// keep everything else (planDigest, titleSimilarity) real.
vi.mock("../src/lib/ai/categorize", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    categorizeAndRankEvents: vi.fn(async (_m: string, recs: any[]) => ({
      events: [],
      failedSourceRecordIds: [],
      processedSourceRecordIds: recs.map((r) => r.sourceRecordId),
      errors: [],
      usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
    })),
  };
});
vi.mock("../src/lib/ai/synthesize", () => ({
  synthesizeInsights: vi.fn(async () => ({
    insights: [],
    usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
  })),
}));

import { runDigest } from "../src/lib/ai/run-digest";
import { categorizeAndRankEvents } from "../src/lib/ai/categorize";
import { synthesizeInsights } from "../src/lib/ai/synthesize";

function makeRepo(rows: any[]) {
  return {
    rows,
    getMatterRecords: async () => rows,
    getLatestDigestVersion: async () => 0,
    getExistingEventsForMerge: async () => [],
    createCaseEvent: async () => {},
    updateCaseEvent: async () => {},
    createInsight: async () => {},
    markRecordsDigested: async (ids: string[], hashes: Map<string, string>) => {
      for (const r of rows) if (ids.includes(r.id)) r.lastDigestedContentHash = hashes.get(r.id) ?? r.contentHash;
    },
  } as any;
}

const row = (id: string, clioType: string, over: Record<string, unknown> = {}) => ({
  id, matterId: "m1", clioType, clioId: id,
  occurredAt: new Date("2026-09-20T00:00:00Z"),
  author: null, subject: `subject ${id}`, excerpt: null,
  rawContent: `content ${id}`, contentHash: `h-${id}`, lastDigestedContentHash: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("runDigest with matter_field records", () => {
  it("withholds matter fields from the event step but still feeds them to insights", async () => {
    const repo = makeRepo([row("n1", "note"), row("f1", "matter_field", { subject: "Estimated Case Value" })]);
    await runDigest("m1", repo);

    const eventInput = (categorizeAndRankEvents as any).mock.calls[0][1].map((r: any) => r.sourceRecordId);
    expect(eventInput).toEqual(["n1"]);

    const insightInput = (synthesizeInsights as any).mock.calls[0][1].map((r: any) => r.sourceRecordId);
    expect(insightInput).toContain("f1");
  });

  it("marks matter fields digested, so an unchanged matter makes zero AI calls next run", async () => {
    const repo = makeRepo([row("n1", "note"), row("f1", "matter_field")]);
    const first = await runDigest("m1", repo);
    expect(first.ranAi).toBe(true);
    expect(repo.rows.find((r: any) => r.id === "f1").lastDigestedContentHash).toBe("h-f1");

    const second = await runDigest("m1", repo);
    expect(second.ranAi).toBe(false);
  });

  it("an edited matter field triggers a re-run but creates no timeline event", async () => {
    const repo = makeRepo([row("n1", "note"), row("f1", "matter_field")]);
    await runDigest("m1", repo);
    vi.clearAllMocks();

    repo.rows.find((r: any) => r.id === "f1").contentHash = "h-f1-edited";
    const again = await runDigest("m1", repo);
    expect(again.ranAi).toBe(true);
    expect((categorizeAndRankEvents as any).mock.calls[0][1]).toEqual([]); // nothing event-worthy
    expect(again.eventsCreated).toBe(0);
  });
});
