import { describe, it, expect, vi, beforeEach } from "vitest";
import { synthesizeInsights } from "../src/lib/ai/synthesize";
import type { RawRecordForPrompt } from "../src/lib/ai/prepare";

describe("synthesizeInsights (stub mode, end-to-end)", () => {
  beforeEach(() => {
    process.env.AI_USE_STUB = "true";
  });

  it("returns no insights and makes no call when there are no records", async () => {
    const result = await synthesizeInsights("matter-1", []);
    expect(result.insights).toEqual([]);
    expect(result.usage.calls).toBe(0);
  });

  it("resolves refs back to real sourceRecordIds and never leaks raw refs", async () => {
    const records: RawRecordForPrompt[] = [
      {
        sourceRecordId: "real-comm-1",
        clioType: "communication",
        occurredAt: "2026-09-27T14:00:00Z",
        subject: "Call with client",
        content: "Discussed upcoming right shoulder surgery.",
      },
      {
        sourceRecordId: "real-note-1",
        clioType: "note",
        occurredAt: "2026-09-24T09:00:00Z",
        content: "Confirmed policy limit of $100,000 bodily injury coverage.",
      },
    ];

    const result = await synthesizeInsights("matter-1", records);

    expect(result.usage.calls).toBe(1);
    expect(result.insights.length).toBeGreaterThan(0);
    for (const insight of result.insights) {
      for (const id of insight.sourceRecordIds) {
        expect(id).not.toMatch(/^r\d+$/);
        expect(["real-comm-1", "real-note-1"]).toContain(id);
      }
    }
  });

  it("marks insights with no supporting evidence as unknown rather than fabricating a confident claim", async () => {
    const result = await synthesizeInsights("matter-1", [
      {
        sourceRecordId: "only-task",
        clioType: "task",
        occurredAt: "2026-09-20T00:00:00Z",
        content: "routine internal reminder",
      },
    ]);

    const coverage = result.insights.find((i) => i.type === "coverage");
    expect(coverage?.confidence).toBe("unknown");
    expect(coverage?.sourceRecordIds).toEqual([]);
  });
});

describe("synthesizeInsights (hallucinated citation safety net)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("downgrades a confident insight to unknown when its only cited ref is invalid", async () => {
    vi.doMock("../src/lib/ai/gemini", () => ({
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          insights: [
            {
              type: "financial",
              label: "Estimated case value",
              value: "$500,000",
              confidence: "observed",
              sourceRefs: ["r99"], // not a real ref for a 1-record batch
            },
          ],
        },
        model: "mock",
        durationMs: 1,
        usedStub: false,
      }),
    }));

    const { synthesizeInsights: isolatedSynthesize } = await import("../src/lib/ai/synthesize");

    const result = await isolatedSynthesize("matter-1", [
      {
        sourceRecordId: "real-1",
        clioType: "note",
        occurredAt: "2026-09-24T00:00:00Z",
        content: "some real content",
      },
    ]);

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].confidence).toBe("unknown");
    expect(result.insights[0].value).toContain("could not be verified");
    expect(result.insights[0].sourceRecordIds).toEqual([]);
  });

  it("keeps insights whose refs resolve correctly untouched", async () => {
    vi.doMock("../src/lib/ai/gemini", () => ({
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          insights: [
            {
              type: "coverage",
              label: "Coverage",
              value: "Policy limit $100,000",
              confidence: "observed",
              sourceRefs: ["r1"],
            },
          ],
        },
        model: "mock",
        durationMs: 1,
        usedStub: false,
      }),
    }));

    const { synthesizeInsights: isolatedSynthesize } = await import("../src/lib/ai/synthesize");

    const result = await isolatedSynthesize("matter-1", [
      {
        sourceRecordId: "real-1",
        clioType: "note",
        occurredAt: "2026-09-24T00:00:00Z",
        content: "policy limit confirmed at $100,000",
      },
    ]);

    expect(result.insights[0].confidence).toBe("observed");
    expect(result.insights[0].sourceRecordIds).toEqual(["real-1"]);
  });

  it("returns an error and empty insights rather than throwing when the AI call fails", async () => {
    vi.doMock("../src/lib/ai/gemini", () => ({
      generateStructured: vi.fn().mockRejectedValue(new Error("model unavailable")),
    }));

    const { synthesizeInsights: isolatedSynthesize } = await import("../src/lib/ai/synthesize");

    const result = await isolatedSynthesize("matter-1", [
      {
        sourceRecordId: "real-1",
        clioType: "note",
        occurredAt: "2026-09-24T00:00:00Z",
        content: "some content",
      },
    ]);

    expect(result.insights).toEqual([]);
    expect(result.error).toContain("model unavailable");
  });
});
