import { describe, it, expect } from "vitest";
import { computeMatterFieldInsights } from "../src/lib/ai/compute-matter-field-insights";
import { normalizeMatterFields } from "../src/lib/ai/matter-fields";

function normalize(fieldName: string, value: unknown, id: string) {
  return normalizeMatterFields("matter-1", "2023-05-07T00:00:00.000Z", [{ id, field_name: fieldName, value }])[0];
}

describe("computeMatterFieldInsights", () => {
  it("extracts a case-value field as a financial insight", () => {
    const rec = normalize("Estimated Case Value", 375000.0, "f1");
    const result = computeMatterFieldInsights([{ id: "sr1", clioType: rec.clioType, subject: rec.subject, rawContent: rec.rawContent }]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("financial");
    expect(result[0].label).toBe("Estimated Case Value");
    expect(result[0].value).toContain("375,000");
    expect(result[0].confidence).toBe("observed");
    expect(result[0].sourceRecordIds).toEqual(["sr1"]);
  });

  it("extracts a coverage field (policy limits prose) verbatim, not collapsed to one number", () => {
    const rec = normalize("Policy Limits", "Defendant liability: $100,000 / $300,000\nClient UM/UIM: $25,000 / $50,000", "f2");
    const result = computeMatterFieldInsights([{ id: "sr2", clioType: rec.clioType, subject: rec.subject, rawContent: rec.rawContent }]);
    expect(result[0].type).toBe("coverage");
    expect(result[0].value).toContain("$100,000 / $300,000");
    expect(result[0].value).toContain("$25,000 / $50,000");
  });

  it("extracts carrier and lien fields as coverage insights", () => {
    const carrier = normalize("Insurance Carrier", "Metro-North, self-insured", "f3");
    const lien = normalize("Health Insurance or Lien Holder", "Medicaid lien, $22,180.00 asserted", "f4");
    const result = computeMatterFieldInsights([
      { id: "sr3", clioType: carrier.clioType, subject: carrier.subject, rawContent: carrier.rawContent },
      { id: "sr4", clioType: lien.clioType, subject: lien.subject, rawContent: lien.rawContent },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === "coverage")).toBe(true);
  });

  it("does NOT promote rationale or flag fields to a standalone insight (provider-visibility safety)", () => {
    const rationale = normalize("Case Value Rationale", "Internal valuation reasoning not for providers.", "f5");
    const flag = normalize("Policy Limits Confirmed", true, "f6");
    const result = computeMatterFieldInsights([
      { id: "sr5", clioType: rationale.clioType, subject: rationale.subject, rawContent: rationale.rawContent },
      { id: "sr6", clioType: flag.clioType, subject: flag.subject, rawContent: flag.rawContent },
    ]);
    expect(result).toHaveLength(0);
  });

  it("REGRESSION: a boolean flag field whose NAME contains coverage vocabulary is still excluded", () => {
    // "Policy Limits Confirmed" is a boolean, but its name contains "Limits",
    // which classifyMatterField's name-only matching (no value available at
    // this stage) would otherwise mis-route to "coverage_limits". Caught by
    // this exact test while building the fix.
    const flag = normalize("Policy Limits Confirmed", true, "f8");
    expect(flag.rawContent).toBe("Policy Limits Confirmed: Yes");
    const result = computeMatterFieldInsights([
      { id: "sr8", clioType: flag.clioType, subject: flag.subject, rawContent: flag.rawContent },
    ]);
    expect(result).toHaveLength(0);
  });

  it("REGRESSION: a false boolean also renders as 'No' and is excluded the same way", () => {
    const flag = normalize("HIPAA Authorization Received", false, "f9");
    expect(flag.rawContent).toBe("HIPAA Authorization Received: No");
    const result = computeMatterFieldInsights([
      { id: "sr9", clioType: flag.clioType, subject: flag.subject, rawContent: flag.rawContent },
    ]);
    expect(result).toHaveLength(0);
  });

  it("ignores non-matter_field records", () => {
    const result = computeMatterFieldInsights([
      { id: "r1", clioType: "note", subject: "Estimated Case Value", rawContent: "Estimated Case Value: $375,000" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("strips the 'Label: ' prefix from the displayed value", () => {
    const rec = normalize("Estimated Case Value", 375000, "f7");
    expect(rec.rawContent).toBe("Estimated Case Value: $375,000");
    const result = computeMatterFieldInsights([{ id: "sr7", clioType: rec.clioType, subject: rec.subject, rawContent: rec.rawContent }]);
    expect(result[0].value).toBe("$375,000");
  });
});
