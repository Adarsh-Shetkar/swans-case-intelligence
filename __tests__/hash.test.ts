import { describe, it, expect } from "vitest";
import { hashRecordContent, computeInputHash, sha256 } from "../src/lib/ai/hash";

describe("hashRecordContent", () => {
  it("is deterministic for identical input", () => {
    const fields = {
      clioType: "note",
      occurredAt: "2026-09-24T09:00:00.000Z",
      author: "Attorney",
      subject: "Coverage note",
      content: "Confirmed policy limit of $100,000.",
    };
    expect(hashRecordContent(fields)).toBe(hashRecordContent({ ...fields }));
  });

  it("changes when content changes", () => {
    const base = {
      clioType: "note",
      occurredAt: "2026-09-24T09:00:00.000Z",
      author: "Attorney",
      subject: "Coverage note",
      content: "Confirmed policy limit of $100,000.",
    };
    const edited = { ...base, content: "Confirmed policy limit of $250,000." };
    expect(hashRecordContent(base)).not.toBe(hashRecordContent(edited));
  });

  it("does not collide across field boundaries", () => {
    const a = hashRecordContent({
      clioType: "note",
      occurredAt: "2026-01-01T00:00:00.000Z",
      author: "A",
      subject: "B",
      content: "C",
    });
    const b = hashRecordContent({
      clioType: "note",
      occurredAt: "2026-01-01T00:00:00.000Z",
      author: "AB",
      subject: "",
      content: "C",
    });
    expect(a).not.toBe(b);
  });

  it("accepts a Date object the same as its ISO string", () => {
    const iso = "2026-09-24T09:00:00.000Z";
    const asDate = hashRecordContent({
      clioType: "note",
      occurredAt: new Date(iso),
      content: "x",
    });
    const asString = hashRecordContent({
      clioType: "note",
      occurredAt: iso,
      content: "x",
    });
    expect(asDate).toBe(asString);
  });
});

describe("computeInputHash", () => {
  it("is order-independent", () => {
    const pairs = [
      { sourceRecordId: "sr2", contentHash: "h2" },
      { sourceRecordId: "sr1", contentHash: "h1" },
    ];
    const reversed = [...pairs].reverse();
    expect(computeInputHash(pairs)).toBe(computeInputHash(reversed));
  });

  it("changes when any record's hash changes", () => {
    const before = [{ sourceRecordId: "sr1", contentHash: "h1" }];
    const after = [{ sourceRecordId: "sr1", contentHash: "h1-edited" }];
    expect(computeInputHash(before)).not.toBe(computeInputHash(after));
  });

  it("changes when a record is added or removed", () => {
    const one = [{ sourceRecordId: "sr1", contentHash: "h1" }];
    const two = [
      { sourceRecordId: "sr1", contentHash: "h1" },
      { sourceRecordId: "sr2", contentHash: "h2" },
    ];
    expect(computeInputHash(one)).not.toBe(computeInputHash(two));
  });

  it("empty input hashes to a stable value", () => {
    expect(computeInputHash([])).toBe(sha256(""));
  });
});
