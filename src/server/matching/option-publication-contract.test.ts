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

const unrestrictedScopes = () => input("comparison_fact_scopes", JSON.stringify(Object.fromEntries(
  ["payroll", "time", "recruiting", "benefits"].map((key) => [key, { version: 1, conditions: [] }]),
)), "999");

describe("format 2 reviewed configuration scope", () => {
  const rules = { version: 2, criteria: [{ ...config.criteria[0], responsePath: ["requested"] }, config.criteria[1]] };
  const scopeInput = () => input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [
    { kind: "module", requirementKey: "payroll", responsePath: ["moduleIncluded"], allowedValues: [true] },
  ] } }), "998");
  const saved = (moduleIncluded?: boolean) => [
    { ...requirements[0], response: { requested: true, ...(moduleIncluded === undefined ? {} : { moduleIncluded }) } },
    requirements[1],
  ];

  test.each([
    [true, "eligible", 7500, 7500],
    [false, "ineligible", 0, 7500],
    [undefined, "unknown", 0, 0],
  ])("applies confirmed module scope %s to fit and coverage", (answer, eligibility, score, coverage) => {
    expect(evaluatePublishedOption(saved(answer), rules, [input("payroll", "true", "997"), scopeInput()]))
      .toMatchObject({ eligibility, deterministicScore: score, confidenceBasisPoints: coverage });
  });

  test("does not give credit to a capability with no approved scope", () => {
    expect(evaluatePublishedOption(saved(true), rules, [input("payroll", "true", "997")]))
      .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
  });

  test("uses scope evidence expiry and rejects duplicate scope records", () => {
    const scope = { ...scopeInput(), valid_until: "2026-09-10T00:00:00.000Z" };
    expect(evaluatePublishedOption(saved(true), rules, [input("payroll", "true", "997"), scope]).validUntil)
      .toBe(scope.valid_until);
    expect(() => evaluatePublishedOption(saved(true), rules, [scope, scope])).toThrow("duplicate approved fact scopes");
  });
});

describe("option publication contract", () => {
  test.each([
    { facts: ["true", "true", "true"], score: 10000, coverage: 10000, eligibility: "eligible" },
    { facts: ["true", null, "true"], score: 7000, coverage: 7000, eligibility: "unknown" },
    { facts: ["true", "false", "true"], score: 7000, coverage: 10000, eligibility: "ineligible" },
    { facts: ["true", "true", null], score: 8000, coverage: 8000, eligibility: "eligible" },
    { facts: [null, null, null], score: 0, coverage: 0, eligibility: "unknown" },
    { facts: ["true", null, null], score: 5000, coverage: 5000, eligibility: "unknown" },
    { facts: [null, "false", "true"], score: 2000, coverage: 5000, eligibility: "ineligible" },
  ])("format 2 follows the proposed weighted missing-data rule: %j", ({ facts, score, coverage, eligibility }) => {
    const keys = ["payroll", "time", "recruiting"];
    const weighted = keys.map((key, index) => ({ requirementId: id(String(index + 100)), revision: 1,
      key, label: key, importance: index < 2 ? "must" : "nice", weight: [5, 3, 2][index], response: true }));
    const configuration = { version: 2, criteria: keys.map((key) => ({ requirementKey: key, factKey: key, responsePath: [] })) };
    const inputs = facts.flatMap((value, index) => value === null ? [] : [input(keys[index], value, String(index + 200))]);
    inputs.push(unrestrictedScopes());
    const actual = evaluatePublishedOption(weighted, configuration, inputs);
    expect(actual).toMatchObject({ deterministicScore: score, confidenceBasisPoints: coverage, eligibility });
    expect(evaluatePublishedOption(weighted, configuration, [...inputs, input("commission_rate", "99", "204")])).toEqual(actual);
  });

  test("format 2 changes only the missing-required eligibility of the same approved inputs", () => {
    const optionalInput = input("benefits", "yes", "210");
    const legacy = evaluatePublishedOption(requirements, config, [optionalInput]);
    const next = evaluatePublishedOption(requirements, { ...config, version: 2 }, [optionalInput, unrestrictedScopes()]);
    expect(legacy.eligibility).toBe("ineligible");
    expect(next).toEqual({ ...legacy, eligibility: "unknown" });
  });

  test("format 2 handles optional-only requirements and rejects unsupported formats", () => {
    const optional = requirements.map((requirement) => ({ ...requirement, importance: "nice" }));
    expect(evaluatePublishedOption(optional, { ...config, version: 2 }, [input("benefits", "no", "211"), unrestrictedScopes()]))
      .toMatchObject({ eligibility: "eligible", deterministicScore: 0, confidenceBasisPoints: 2500 });
    expect(evaluatePublishedOption(optional, { ...config, version: 2 }, []))
      .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
    expect(publicationConfigSchema.safeParse({ ...config, version: 4 }).success).toBe(false);
    expect(publicationConfigSchema.safeParse({ ...config, version: "2" }).success).toBe(false);
  });

  test.each(["commission_rate", "payment_status", "commercial_relationship", "sponsorship_tier", "advertising_spend", "paid_placement", "partner_status"])(
    "format 2 rejects a commercial criterion: %s", (factKey) => {
      expect(publicationConfigSchema.safeParse({ ...config, version: 2,
        criteria: [{ ...config.criteria[0], factKey }, config.criteria[1]],
      }).success).toBe(false);
    },
  );

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

describe("format 3 reviewed delivery conditions", () => {
  const saved = (accepted?: boolean) => [{ ...requirements[0], response: { required: true,
    ...(accepted === undefined ? {} : { acceptPartner: accepted }) } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"],
    partnerAcceptance: { requirementKey: "payroll", responsePath: ["acceptPartner"] } }] };
  const scopes = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [] } }), "991");
  const coverage = (kind: string) => input("comparison_feature_coverage", JSON.stringify({ payroll: kind }), "992");
  const inclusions = (included: boolean) => input("comparison_addon_inclusions", JSON.stringify({ payroll: included }), "993");
  const capability = input("payroll", "true", "994");

  test("does not credit a paid addition without reviewed package inclusion", () => {
    for (const extra of [[], [inclusions(false)]]) {
      expect(evaluatePublishedOption(saved(), rules, [capability, scopes, coverage("add_on"), ...extra]))
        .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
    }
    expect(evaluatePublishedOption(saved(), rules, [capability, scopes, coverage("add_on"), inclusions(true)]))
      .toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
  });

  test("requires the saved customer decision before crediting partner delivery", () => {
    const inputs = [capability, scopes, coverage("partner")];
    expect(evaluatePublishedOption(saved(), rules, inputs))
      .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
    expect(evaluatePublishedOption(saved(false), rules, inputs))
      .toMatchObject({ eligibility: "ineligible", deterministicScore: 0, confidenceBasisPoints: 10000 });
    expect(evaluatePublishedOption(saved(true), rules, inputs))
      .toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
  });
});

describe("format 3 coverage evidence boundaries", () => {
  const saved = [{ ...requirements[0], response: { required: true, country: "US" } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
  const capability = input("payroll", "true", "971");
  const scope = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [] } }), "972");
  const coverage = (value: string) => input("comparison_feature_coverage", value, "973");

  test.each([
    [undefined, "unknown"], ["unknown", "unknown"], ["limited", "unknown"],
    ["not_supported", "unknown"], ["partner", "unknown"], ["native", "eligible"],
  ])("keeps %s coverage conservative", (kind, eligibility) => {
    const inputs = [capability, scope, ...(kind ? [coverage(JSON.stringify({ payroll: kind }))] : [])];
    expect(evaluatePublishedOption(saved, rules, inputs).eligibility).toBe(eligibility);
  });

  test("keeps an established scope mismatch when delivery evidence is absent", () => {
    const restricted = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [
      { kind: "country", requirementKey: "payroll", responsePath: ["country"], allowedValues: ["CA"] },
    ] } }), "974");
    expect(evaluatePublishedOption(saved, rules, [capability, restricted]))
      .toMatchObject({ eligibility: "ineligible", deterministicScore: 0, confidenceBasisPoints: 10000 });
  });

  test("rejects malformed or duplicate delivery evidence", () => {
    const valid = coverage(JSON.stringify({ payroll: "native" }));
    expect(() => evaluatePublishedOption(saved, rules, [capability, scope, valid, valid])).toThrow();
    expect(() => evaluatePublishedOption(saved, rules, [capability, scope, coverage("not-json")])).toThrow();
    expect(() => evaluatePublishedOption(saved, rules, [capability, scope, coverage(JSON.stringify({ payroll: "invented" }))])).toThrow();
  });

  test("includes delivery evidence in the freshness boundary", () => {
    const older = { ...coverage(JSON.stringify({ payroll: "native" })), valid_until: "2026-09-20T00:00:00.000Z" };
    expect(evaluatePublishedOption(saved, rules, [capability, scope, older]).validUntil).toBe(older.valid_until);
  });
});

test("format 3 does not infer a limited feature's restrictions from an unrelated scope condition", () => {
  const saved = [{ ...requirements[0], response: { required: true, country: "US" } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
  const scope = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [
    { kind: "country", requirementKey: "payroll", responsePath: ["country"], allowedValues: ["US"] },
  ] } }), "961");
  const coverage = input("comparison_feature_coverage", JSON.stringify({ payroll: "limited" }), "962");
  expect(evaluatePublishedOption(saved, rules, [input("payroll", "true", "963"), scope, coverage]))
    .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
});

test("format 3 rejects noncanonical or commercial delivery evidence keys", () => {
  const saved = [{ ...requirements[0], response: { required: true } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
  const scope = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [] } }), "951");
  for (const key of ["Payroll", " payroll ", "commission_rate"]) {
    const coverage = input("comparison_feature_coverage", JSON.stringify({ [key]: "native" }), "952");
    expect(() => evaluatePublishedOption(saved, rules, [input("payroll", "true", "953"), scope, coverage])).toThrow();
  }
});

describe("format 3 reviewed limits and absent capabilities", () => {
  const scopes = (value: unknown) => input("comparison_fact_scopes", JSON.stringify({ payroll: value }), "941");
  const coverage = (value: string) => input("comparison_feature_coverage", JSON.stringify({ payroll: value }), "942");
  const restricted = { version: 1, conditions: [{ kind: "restriction", requirementKey: "payroll",
    responsePath: ["workers"], allowedValues: ["employees"] }] };
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"],
    capabilityMeaning: "presence" }] };
  const saved = (required: boolean) => [{ ...requirements[0], response: { required, workers: "employees" } }];

  test("credits a limited feature only when reviewed limits are represented and matched", () => {
    const inputs = [input("payroll", "true", "943"), scopes(restricted), coverage("limited")];
    expect(evaluatePublishedOption(saved(true), rules, inputs).eligibility).toBe("unknown");
    const reviewed = input("comparison_limitation_reviews", JSON.stringify({ payroll: true }), "944");
    expect(evaluatePublishedOption(saved(true), rules, [...inputs, reviewed]))
      .toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
  });

  test("distinguishes a requested capability from a requested absence when meaning is explicit", () => {
    const inputs = [input("payroll", "false", "945"), scopes({ version: 1, conditions: [] }), coverage("not_supported")];
    expect(evaluatePublishedOption(saved(true), rules, inputs))
      .toMatchObject({ eligibility: "ineligible", deterministicScore: 0, confidenceBasisPoints: 10000 });
    expect(evaluatePublishedOption(saved(false), rules, inputs))
      .toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
    expect(evaluatePublishedOption(saved(false), rules, [...inputs, input("payroll", "true", "946")]))
      .toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0 });
  });
});

test("format 3 ignores unrelated add-on evidence when determining freshness", () => {
  const saved = [{ ...requirements[0], response: { required: true } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
  const scope = input("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [] } }), "931");
  const coverage = input("comparison_feature_coverage", JSON.stringify({ payroll: "native" }), "932");
  const unrelated = { ...input("comparison_addon_inclusions", JSON.stringify({ another_feature: true }), "933"),
    valid_until: "2026-09-16T00:00:00.000Z" };
  expect(evaluatePublishedOption(saved, rules, [input("payroll", "true", "934"), scope, coverage, unrelated]).validUntil)
    .toBe(coverage.valid_until);
});

test("format 3 rejects noncanonical saved requirement keys", () => {
  const saved = [{ ...requirements[0], key: "Payroll", response: { required: true } }];
  const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
  expect(() => evaluatePublishedOption(saved, rules, [])).toThrow();
});

test("accepts the reviewed format 3 configuration for publication", () => {
  const next = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"],
    capabilityMeaning: "presence", partnerAcceptance: { requirementKey: "payroll", responsePath: ["allowPayrollPartner"] } }] };
  expect(publicationConfigSchema.safeParse(next).success).toBe(true);
  expect(publicationConfigSchema.safeParse({ ...next, criteria: [{ ...next.criteria[0], factKey: "commission_rate" }] }).success).toBe(false);
  expect(publicationConfigSchema.safeParse({ ...next, criteria: [{ ...next.criteria[0], extra: true }] }).success).toBe(false);
});

test.each(["commission_rate", "payout_total", "referral_fee", "payment_status", "commercial_relationship",
  "sponsorship", "advertising", "paid_placement", "partner_status", " COMMISSION_RATE "])(
  "rejects commercial partner acceptance source %s", (requirementKey) => {
    const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"],
      partnerAcceptance: { requirementKey, responsePath: [] } }] };
    expect(publicationConfigSchema.safeParse(rules).success).toBe(false);
  },
);
