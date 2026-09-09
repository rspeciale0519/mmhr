import { describe, expect, test } from "vitest";

import {
  approvedVendorInputSchema,
  evaluatePublishedOption,
  maskedOptionSchema,
  publicationConfigSchema,
  publicationReadSchema,
} from "./option-publication-contract";

const id = (value: string) => `00000000-0000-4000-8000-${value.replace(/[^0-9a-f]/gi, "a").padStart(12, "0")}`;
const requirements = [
  { requirementId: id("1"), revision: 1, key: "payroll", label: "Payroll", importance: "must" as const, weight: 3, response: true },
  { requirementId: id("2"), revision: 1, key: "benefits", label: "Benefits", importance: "nice" as const, weight: 1, response: { answer: "yes" } },
];
const config = {
  version: 1 as const,
  criteria: [
    { requirementKey: "payroll", factKey: "payroll", responsePath: [] },
    { requirementKey: "benefits", factKey: "benefits", responsePath: ["answer"] },
  ],
};
const input = (fieldKey: string, value: string, suffix: string) => ({
  fact_id: id(suffix), field_key: fieldKey, value, provenance: "evidence" as const,
  evidence_id: id(`e${suffix}`), source_id: id(`s${suffix}`), review_id: id(`r${suffix}`),
  evidence_version: 1, content_hash: "a".repeat(64), observed_at: "2026-09-09T00:00:00.000Z",
  captured_at: "2026-09-09T01:00:00.000Z", valid_until: "2026-10-09T00:00:00.000Z",
  override_id: null, approved_at: "2026-09-09T02:00:00.000Z",
});

describe("option publication contract", () => {
  test("accepts strict configuration and rejects duplicate, malformed, and commercial criteria", () => {
    expect(publicationConfigSchema.safeParse(config).success).toBe(true);
    expect(publicationConfigSchema.safeParse({ ...config, extra: true }).success).toBe(false);
    expect(publicationConfigSchema.safeParse({ ...config, criteria: [...config.criteria, config.criteria[0]] }).success).toBe(false);
    expect(publicationConfigSchema.safeParse({ ...config, criteria: [{ requirementKey: "payroll", factKey: "commission_rate", responsePath: [] }] }).success).toBe(false);
    expect(publicationConfigSchema.safeParse({ ...config, criteria: [{ requirementKey: "payroll", factKey: "payment_status", responsePath: [] }] }).success).toBe(false);
    expect(publicationConfigSchema.safeParse({ ...config, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: Array.from({ length: 6 }, () => "x") }] }).success).toBe(false);
  });

  test("requires exact requirement keys and rejects duplicate or invalid requirements", () => {
    expect(() => evaluatePublishedOption(requirements, { ...config, criteria: [{ ...config.criteria[0], requirementKey: "other" }, config.criteria[1]] }, [])).toThrow("exactly match");
    expect(() => evaluatePublishedOption([...requirements, requirements[0]], config, [])).toThrow("duplicate requirement");
    expect(() => evaluatePublishedOption([{ ...requirements[0], weight: 0 }], { version: 1, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: [] }] }, [])).toThrow("requirements are invalid");
  });

  test("evaluates mapped scalar and nested responses with weighted must and nice results", () => {
    expect(evaluatePublishedOption(requirements, config, [input("payroll", " TRUE ", "3"), input("benefits", "YES", "4")])).toEqual({
      eligibility: "eligible", deterministicScore: 10_000, confidenceBasisPoints: 10_000,
      fitReasons: ["benefits", "payroll"], limitations: [],
      evidenceFreshAt: "2026-09-09T01:00:00.000Z", validUntil: "2026-10-09T00:00:00.000Z",
    });
    expect(evaluatePublishedOption(requirements, config, [input("payroll", "false", "5"), input("benefits", "no", "6")])).toMatchObject({
      eligibility: "ineligible", deterministicScore: 0, confidenceBasisPoints: 10_000,
      fitReasons: [], limitations: ["benefits", "payroll"],
    });
  });

  test("returns unknown with no relevant approved inputs and ignores irrelevant inputs", () => {
    expect(evaluatePublishedOption(requirements, config, [input("unrelated", "true", "7")])).toEqual({
      eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0,
      fitReasons: [], limitations: ["benefits", "payroll"], evidenceFreshAt: null, validUntil: null,
    });
  });

  test("rejects missing, null, complex, and non-finite response paths", () => {
    expect(evaluatePublishedOption(requirements, config, [input("payroll", "true", "8"), input("benefits", "yes", "9")])).toMatchObject({ eligibility: "eligible" });
    for (const response of [null, {}, [], { missing: "true" }]) {
      expect(() => evaluatePublishedOption([{ ...requirements[0], response }, requirements[1]], config, [input("payroll", "true", "10")])).toThrow("response path must resolve to a scalar");
    }
    expect(() => evaluatePublishedOption([{ ...requirements[0], response: Infinity }, requirements[1]], config, [])).toThrow("requirements are invalid");
    expect(evaluatePublishedOption([{ ...requirements[0], response: { nested: { value: "true" } } }, requirements[1]], { version: 1, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["nested", "value"] }, config.criteria[1]] }, [input("payroll", "true", "11")])).toMatchObject({ fitReasons: ["payroll"] });
  });

  test.each([[1, "1"], [1e-7, "0.0000001"], [1e21, "1000000000000000000000"], [-2.5e-8, "-0.000000025"]])(
    "compares numeric responses as canonical plain decimal %s", (response, value) => {
      expect(evaluatePublishedOption([{ ...requirements[0], response }, requirements[1]], config, [input("payroll", String(value), "37")])).toMatchObject({ fitReasons: ["payroll"] });
    },
  );

  test("does not impose a separate 2000-fact catalog limit", () => {
    const inputs = Array.from({ length: 2001 }, (_, index) => input("payroll", "true", String(index + 100)));
    expect(evaluatePublishedOption(requirements, config, inputs)).toMatchObject({ fitReasons: ["payroll"] });
  });

  test.each(["01", "1.0", "1e0"])("does not coerce vendor text %s into a number", (value) => {
    expect(evaluatePublishedOption([{ ...requirements[0], response: 1 }, requirements[1]], config, [input("payroll", value, "38")]))
      .toMatchObject({ deterministicScore: 0, limitations: ["benefits", "payroll"] });
  });

  test("uses locale-independent ASCII folding without changing other characters", () => {
    const evaluate = (response: string, value: string) => evaluatePublishedOption(
      [{ ...requirements[0], response }, requirements[1]], config, [input("payroll", value, "39")],
    );
    expect(evaluate(" YES ", "yes").deterministicScore).toBe(7500);
    expect(evaluate("İ", "i").deterministicScore).toBe(0);
    expect(evaluate("É", "É").deterministicScore).toBe(7500);
    expect(evaluate("É", "é").deterministicScore).toBe(0);
    expect(evaluate("\tyes", "yes").deterministicScore).toBe(0);
  });

  test("uses only relevant inputs for freshness and limits each option to masked fields", () => {
    const evaluated = evaluatePublishedOption(requirements, config, [
      input("payroll", "true", "12"),
      { ...input("unrelated", "x", "13"), captured_at: "2020-01-01T00:00:00.000Z", valid_until: "2020-01-02T00:00:00.000Z" },
      { ...input("benefits", "yes", "14"), captured_at: "2026-09-02T00:00:00.000Z", valid_until: "2026-09-20T00:00:00.000Z" },
    ]);
    expect(evaluated.evidenceFreshAt).toBe("2026-09-02T00:00:00.000Z");
    expect(evaluated.validUntil).toBe("2026-09-20T00:00:00.000Z");
    expect(maskedOptionSchema.safeParse({ optionId: id("15"), ordinal: 1, maskedLabel: "Option 1", ...evaluated }).success).toBe(true);
    expect(maskedOptionSchema.safeParse({ optionId: id("15"), ordinal: 1, maskedLabel: "Option 1", ...evaluated, productId: id("16") }).success).toBe(false);
  });

  test("validates read versions, digest, and bounded all-options pages", () => {
    const option = { optionId: id("17"), ordinal: 1, maskedLabel: "Option 1", ...evaluatePublishedOption(requirements, config, []) };
    const value = {
      publicationId: id("18"), organizationId: id("19"), intakeId: id("20"), sequence: 2, configurationVersion: 2,
      state: "published" as const, inputDigest: "b".repeat(64), optionCount: 6, options: [option], nextOrdinal: 2, correlationId: id("21"),
    };
    expect(publicationReadSchema.safeParse(value).success).toBe(true);
    expect(publicationReadSchema.safeParse({ ...value, configurationVersion: 1 }).success).toBe(false);
    expect(publicationReadSchema.safeParse({ ...value, inputDigest: "B".repeat(64) }).success).toBe(false);
    expect(publicationReadSchema.safeParse({ ...value, options: Array.from({ length: 51 }, (_, index) => ({ ...option, ordinal: index + 1, maskedLabel: `Option ${index + 1}` })) }).success).toBe(false);
  });

  test("allows more than five displayed options without applying the initial-selection cap", () => {
    const option = { optionId: id("22"), ordinal: 1, maskedLabel: "Option 1", ...evaluatePublishedOption(requirements, config, [input("payroll", "true", "23")]) };
    const options = Array.from({ length: 6 }, (_, index) => ({ ...option, optionId: id(String(24 + index)), ordinal: index + 1, maskedLabel: `Option ${index + 1}` }));
    const publication = { publicationId: id("30"), organizationId: id("31"), intakeId: id("32"), sequence: 1, configurationVersion: 1, state: "published", inputDigest: "c".repeat(64), optionCount: 6, options, nextOrdinal: null, correlationId: id("33") };
    expect(publicationReadSchema.safeParse(publication).success).toBe(true);
    expect(publicationReadSchema.safeParse({ ...publication, options: options.map((entry) => ({ ...entry, optionId: option.optionId })) }).success).toBe(false);
  });

  test("validates the approved input row contract without exposing provider identifiers in options", () => {
    expect(approvedVendorInputSchema.safeParse(input("payroll", "true", "34")).success).toBe(true);
    expect(approvedVendorInputSchema.safeParse({ ...input("payroll", "true", "35"), unknown: "blocked" }).success).toBe(false);
    expect(maskedOptionSchema.safeParse({ optionId: id("36"), ordinal: 1, maskedLabel: "Option 2", ...evaluatePublishedOption(requirements, config, []) }).success).toBe(false);
  });
});
