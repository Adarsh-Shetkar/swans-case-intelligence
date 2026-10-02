import { describe, it, expect } from "vitest";
import {
  classifyMatterField, parseMoney, extractMoneyAmounts,
  normalizeMatterFields, deriveMatterFieldFacts, type ClioCustomFieldValue,
} from "../src/lib/ai/matter-fields";
import { selectInsightCandidates } from "../src/lib/ai/select-insight-candidates";
import { computeInputHash } from "../src/lib/ai/hash";

// Read-side shape Clio returns: {id, value, field_name}. Mirrors the Sapini export.
const FIELDS: ClioCustomFieldValue[] = [
  { id: "date-1", field_name: "Date of Incident", value: "2023-04-23" },
  { id: "text_line-2", field_name: "Insurance Carrier", value: "Metro-North, SELF-INSURED. Client no-fault: Progressive." },
  { id: "text_area-3", field_name: "Policy Limits", value: "Defendant liability: $100,000 / $300,000\nClient UM/UIM: $25,000 / $50,000\nNo-fault: $50,000" },
  { id: "checkbox-4", field_name: "Policy Limits Confirmed", value: true },
  { id: "currency-5", field_name: "Estimated Case Value", value: 375000.0 },
  { id: "text_area-6", field_name: "Case Value Rationale", value: "Economics come to $332,400; lien of $22,180.00." },
  { id: "currency-7", field_name: "Medical Specials To Date", value: 118400.0 },
  { id: "text_area-8", field_name: "Wage Loss Claimed", value: "$214,000.00 claimed to date. Commission-only." },
  { id: "text_area-9", field_name: "Health Insurance or Lien Holder", value: "Medicaid lien, $22,180.00 asserted." },
  { id: "text_area-10", field_name: "Empty One", value: "   " },
  { id: "text_area-11", field_name: "Nulled", value: null },
];

describe("classifyMatterField", () => {
  it("maps generic PI field names to roles", () => {
    expect(classifyMatterField("Estimated Case Value")).toBe("case_value");
    expect(classifyMatterField("Case Value Rationale")).toBe("rationale");
    expect(classifyMatterField("Medical Specials To Date")).toBe("medical_specials");
    expect(classifyMatterField("Policy Limits")).toBe("coverage_limits");
    expect(classifyMatterField("Insurance Carrier")).toBe("carrier");
    expect(classifyMatterField("Wage Loss Claimed")).toBe("wage_loss");
    expect(classifyMatterField("Date of Incident")).toBe("other");
  });
  it("lien beats carrier when the name mentions both", () => {
    expect(classifyMatterField("Health Insurance or Lien Holder")).toBe("lien");
  });
  it("boolean values are flags regardless of name", () => {
    expect(classifyMatterField("Policy Limits Confirmed", true)).toBe("flag");
  });
});

describe("money parsing is deterministic", () => {
  it("parses a lone amount", () => {
    expect(parseMoney(375000)).toBe(375000);
    expect(parseMoney("$118,400.00")).toBe(118400);
    expect(parseMoney(" 1,250 ")).toBe(1250);
  });
  it("refuses prose so ranges are never collapsed into one number", () => {
    expect(parseMoney("Defendant liability: $100,000 / $300,000")).toBeNull();
    expect(parseMoney("$214,000.00 claimed to date.")).toBeNull();
    expect(parseMoney(NaN)).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
  it("extracts every amount from prose", () => {
    expect(extractMoneyAmounts("Defendant liability: $100,000 / $300,000\nNo-fault: $50,000")).toEqual([100000, 300000, 50000]);
  });
});

describe("normalizeMatterFields", () => {
  const recs = normalizeMatterFields(1811196053, "2026-10-02T09:50:00-07:00", FIELDS);

  it("emits one matter_field record per non-empty field with stable ids", () => {
    expect(recs).toHaveLength(9);
    expect(recs.every((r) => r.clioType === "matter_field")).toBe(true);
    expect(recs.find((r) => r.subject === "Estimated Case Value")!.clioId).toBe("1811196053:currency-5");
  });
  it("renders money roles as USD and booleans as Yes/No", () => {
    expect(recs.find((r) => r.subject === "Estimated Case Value")!.rawContent).toBe("Estimated Case Value: $375,000");
    expect(recs.find((r) => r.subject === "Policy Limits Confirmed")!.rawContent).toBe("Policy Limits Confirmed: Yes");
  });
  it("keeps multi-line policy limits verbatim", () => {
    expect(recs.find((r) => r.subject === "Policy Limits")!.rawContent).toContain("$100,000 / $300,000");
  });
  it("hash ignores matter.updated_at and sync time", () => {
    const later = normalizeMatterFields(1811196053, "2027-01-01T00:00:00Z", FIELDS);
    expect(later.map((r) => r.contentHash)).toEqual(recs.map((r) => r.contentHash));
  });
  it("hash changes when a value changes", () => {
    const edited = FIELDS.map((f) => (f.id === "currency-5" ? { ...f, value: 400000 } : f));
    const after = normalizeMatterFields(1811196053, "2026-10-02T09:50:00-07:00", edited);
    const a = recs.find((r) => r.subject === "Estimated Case Value")!.contentHash;
    const b = after.find((r) => r.subject === "Estimated Case Value")!.contentHash;
    expect(a).not.toBe(b);
    // and nothing else moved
    expect(after.filter((r) => r.subject !== "Estimated Case Value").map((r) => r.contentHash))
      .toEqual(recs.filter((r) => r.subject !== "Estimated Case Value").map((r) => r.contentHash));
  });
  it("skips unlabeled fields", () => {
    expect(normalizeMatterFields(1, new Date(), [{ id: "x", value: "v" }])).toEqual([]);
  });
  it("matter fingerprint is unchanged on identical re-normalization", () => {
    const pairs = (rs: typeof recs) => rs.map((r) => ({ sourceRecordId: r.clioId, contentHash: r.contentHash }));
    expect(computeInputHash(pairs(recs))).toBe(
      computeInputHash(pairs(normalizeMatterFields(1811196053, "2030-01-01", FIELDS)).reverse())
    );
  });
});

describe("deriveMatterFieldFacts", () => {
  const facts = deriveMatterFieldFacts(1811196053, FIELDS);
  it("gives exact amounts only for single-amount money fields", () => {
    expect(facts.find((f) => f.role === "case_value")!.amount).toBe(375000);
    expect(facts.find((f) => f.role === "medical_specials")!.amount).toBe(118400);
    expect(facts.find((f) => f.role === "wage_loss")!.amount).toBeNull(); // prose
    expect(facts.find((f) => f.label === "Policy Limits")!.amount).toBeNull();
  });
  it("every fact carries a clioId for the evidence drawer", () => {
    expect(facts.every((f) => f.clioId.startsWith("1811196053:"))).toBe(true);
  });
});

describe("selectInsightCandidates with matter fields", () => {
  const mk = (i: number, type: string, subject = `s${i}`) => ({
    sourceRecordId: `${type}-${i}`, clioType: type,
    occurredAt: new Date(2024, 0, 1 + (i % 300)), subject, content: `body ${i}`,
  });
  const fieldRecs = (n: number) =>
    Array.from({ length: n }, (_, i) => mk(i, "matter_field", i % 2 ? "Estimated Case Value" : `Misc ${i}`));

  it("always includes matter fields even when old notes are far newer", () => {
    const out = selectInsightCandidates([...Array.from({ length: 200 }, (_, i) => mk(i, "note")), ...fieldRecs(15)], 60);
    expect(out.filter((r) => r.clioType === "matter_field")).toHaveLength(15);
  });
  it("respects the overall cap: 200 records + 15 fields never exceed maxCandidates", () => {
    const out = selectInsightCandidates([...Array.from({ length: 200 }, (_, i) => mk(i, "communication")), ...fieldRecs(15)], 40);
    expect(out.length).toBeLessThanOrEqual(40);
  });
  it("caps fields themselves and prefers role-matched ones", () => {
    const out = selectInsightCandidates(fieldRecs(50), 60);
    const fields = out.filter((r) => r.clioType === "matter_field");
    expect(fields).toHaveLength(20);
    expect(fields.every((r) => r.subject === "Estimated Case Value")).toBe(true); // 25 role-matched beat 25 "other"
  });
  it("a tiny budget still holds", () => {
    expect(selectInsightCandidates(fieldRecs(15), 5)).toHaveLength(5);
  });
});
