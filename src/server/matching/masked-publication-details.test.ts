import { describe, expect, test } from "vitest";
import { maskedPublicationDetailsSchema } from "./masked-publication-details";
import { maskedOptionSchema } from "./option-publication-contract";

const evidence = {
  basis: "evidence", capturedAt: "2026-09-15T10:00:00Z", reviewedAt: "2026-09-15T11:00:00Z",
  validUntil: "2026-10-15T10:00:00Z", version: 2,
};
const annualCost = {
  recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 100,
  includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: ["taxes"],
  oneTime: null, evidence,
};
const details = {
  version: 1,
  features: [{ requirementKey: "payroll", outcome: "match", coverage: "add_on", evidence, coverageEvidence: evidence }],
  annualCost,
  setup: { duration: { minimum: 4, maximum: 8 }, unit: "weeks", scope: "initial_implementation",
    includedModules: ["hr", "payroll"], assumptions: ["customer_data_ready"], evidence },
};
const option = {
  optionId: "11111111-1111-4111-8111-111111111111", ordinal: 1, maskedLabel: "Option 1",
  eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000,
  fitReasons: ["payroll"], limitations: [], evidenceFreshAt: evidence.capturedAt, validUntil: evidence.validUntil,
};

describe("masked publication details", () => {
  test("accepts supported estimates and preserves explicit unknown fields", () => {
    expect(maskedOptionSchema.parse({ ...option, details }).details).toEqual(details);
    expect(maskedPublicationDetailsSchema.parse({ version: 1, features: [], annualCost: null, setup: null }))
      .toEqual({ version: 1, features: [], annualCost: null, setup: null });
    expect(maskedOptionSchema.parse(option)).not.toHaveProperty("details");
  });

  test.each(["native", "add_on", "partner", "limited", "not_supported", "unknown"])("keeps %s coverage distinct from a requirement match", (coverage) => {
    const value = { ...details, features: [{ ...details.features[0], coverage, outcome: "unknown" }] };
    expect(maskedPublicationDetailsSchema.safeParse(value).success).toBe(true);
  });

  test("rejects missing evidence for a known outcome or coverage", () => {
    for (const feature of [
      { ...details.features[0], evidence: null },
      { ...details.features[0], evidence: null, coverageEvidence: null, outcome: "unknown" },
    ]) expect(maskedPublicationDetailsSchema.safeParse({ ...details, features: [feature] }).success).toBe(false);
  });

  test.each([
    { sourceUrl: "https://vendor.example" }, { productName: "Example HR" }, { documentId: "vendor-document" },
  ])("rejects identity-bearing evidence additions: %j", (extra) => {
    expect(maskedPublicationDetailsSchema.safeParse({ ...details,
      features: [{ ...details.features[0], evidence: { ...evidence, ...extra } }],
    }).success).toBe(false);
  });

  test.each([
    { currency: "Vendor name" }, { includedModules: ["Branded Payroll"] },
    { assumptions: ["https://vendor.example/quote"] }, { exclusions: ["Vendor package"] },
    { recurring: { minimum: 10, maximum: 9 } }, { employeeCount: 0 },
    { includedModules: ["payroll", "payroll"] }, { assumptions: [] },
    { recurring: { minimum: NaN, maximum: Infinity } },
    { evidence: { ...evidence, validUntil: evidence.capturedAt } },
    { evidence: { ...evidence, reviewedAt: "2026-09-14T00:00:00Z" } },
    { oneTime: { minimum: -1, maximum: 0 } },
  ])("rejects unusable or unmasked estimate data: %j", (patch) => {
    expect(maskedPublicationDetailsSchema.safeParse({ ...details, annualCost: { ...annualCost, ...patch } }).success).toBe(false);
  });

  test("rejects features that disagree with the publication or repeat a requirement", () => {
    for (const features of [[], [...details.features, ...details.features],
      [{ ...details.features[0], outcome: "mismatch" }], [{ ...details.features[0], requirementKey: "other" }]]) {
      expect(maskedOptionSchema.safeParse({ ...option, details: { ...details, features } }).success).toBe(false);
    }
  });

  test("requires a supported setup unit and scope", () => {
    for (const patch of [{ unit: "soon" }, { scope: "Vendor launch" }, { duration: { minimum: 8, maximum: 4 } }]) {
      expect(maskedPublicationDetailsSchema.safeParse({ ...details, setup: { ...details.setup, ...patch } }).success).toBe(false);
    }
  });
});
