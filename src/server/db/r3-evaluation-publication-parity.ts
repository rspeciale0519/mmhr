import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { evaluatePublishedOption, type PublicationConfig } from "@/server/matching/option-publication-contract";
import type { SecurityTransaction } from "./r1-security-command-fixtures";

const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function input(value: string, fieldKey = "payroll") {
  const now = Date.now();
  return {
    fact_id: randomUUID(), field_key: fieldKey, value, provenance: "evidence",
    evidence_id: randomUUID(), source_id: randomUUID(), review_id: randomUUID(), evidence_version: 1,
    content_hash: HASH, observed_at: new Date(now - 86_400_000).toISOString(),
    captured_at: new Date(now - 86_400_000).toISOString(),
    valid_until: new Date(now + 86_400_000).toISOString(), override_id: null,
    approved_at: new Date(now - 86_400_000).toISOString(),
  };
}

function requirement(key: string, response: unknown, importance: "must" | "nice" = "must", weight = 100) {
  return { requirementId: randomUUID(), revision: 1, key, label: key, importance, weight, response };
}

function config(criteria: Array<{ requirementKey: string; factKey: string; responsePath: string[] }>): PublicationConfig {
  return { version: 1, criteria };
}

async function evaluateSql(sql: SecurityTransaction, requirements: unknown[], configuration: PublicationConfig, inputs: unknown[]) {
  const [row] = await sql<{ result: Record<string, unknown> }[]>`
    SELECT mmhr_private.r3_evaluate_publication_option(
      ${JSON.stringify(configuration)}::jsonb, ${JSON.stringify(requirements)}::jsonb,
      ${JSON.stringify(inputs)}::jsonb
    ) AS result
  `;
  return row!.result;
}

async function evaluateSqlRaw(sql: SecurityTransaction, requirementsJson: string, configuration: PublicationConfig) {
  const [row] = await sql<{ result: Record<string, unknown> }[]>`
    SELECT mmhr_private.r3_evaluate_publication_option(
      ${JSON.stringify(configuration)}::jsonb, ${requirementsJson}::jsonb, '[]'::jsonb
    ) AS result
  `;
  return row!.result;
}

function rawNumericRequirement(responseLexeme: string) {
  const base = JSON.stringify({
    requirementId: randomUUID(), revision: 1, key: "payroll", label: "payroll",
    importance: "must", weight: 100,
  });
  return `[${base.slice(0, -1)},"response":${responseLexeme}}]`;
}

function expectEvaluationParity(sqlResult: Record<string, unknown>, tsResult: ReturnType<typeof evaluatePublishedOption>) {
  expect(sqlResult).toMatchObject({
    eligibility: tsResult.eligibility,
    deterministicScore: tsResult.deterministicScore,
    confidenceBasisPoints: tsResult.confidenceBasisPoints,
    fitReasons: tsResult.fitReasons,
    limitations: tsResult.limitations,
  });
  expect(Date.parse(String(sqlResult.evidenceFreshAt))).toBe(Date.parse(String(tsResult.evidenceFreshAt)));
  expect(Date.parse(String(sqlResult.validUntil))).toBe(Date.parse(String(tsResult.validUntil)));
}

export async function assertEvaluationParity(sql: SecurityTransaction) {
  const scalarConfig = config([{ requirementKey: "payroll", factKey: "payroll", responsePath: [] }]);
  for (const [value, expected] of [["1", true], ["1.0", false], ["01", false], ["1e0", false]] as const) {
    const requirements = [requirement("payroll", 1)];
    const vectorInput = input(value);
    const tsResult = evaluatePublishedOption(requirements, scalarConfig, [vectorInput]);
    const sqlResult = await evaluateSql(sql, requirements, scalarConfig, [vectorInput]);
    expectEvaluationParity(sqlResult, tsResult);
    expect(tsResult.eligibility === "eligible").toBe(expected);
  }
  const tinyRequirements = [requirement("payroll", 1e-7)];
  const tinyInput = input("0.0000001");
  expectEvaluationParity(
    await evaluateSql(sql, tinyRequirements, scalarConfig, [tinyInput]),
    evaluatePublishedOption(tinyRequirements, scalarConfig, [tinyInput]),
  );

  for (const responseLexeme of ["9007199254740991", "0.1234567890123456", "1e21", "1e-7"]) {
    const requirementsJson = rawNumericRequirement(responseLexeme);
    const parsedRequirements = JSON.parse(requirementsJson) as unknown[];
    expectEvaluationParity(
      await evaluateSqlRaw(sql, requirementsJson, scalarConfig),
      evaluatePublishedOption(parsedRequirements, scalarConfig, []),
    );
  }
  await expect(sql.savepoint((probe) =>
    evaluateSqlRaw(probe, rawNumericRequirement("9007199254740993"), scalarConfig),
  )).rejects.toMatchObject({ code: "22023" });

  const unicodeCases = [["İ", "i", false], ["É", "É", true], ["É", "é", false], ["\tÉ\t", "É", false]] as const;
  for (const [value, response, expected] of unicodeCases) {
    const requirements = [requirement("payroll", response)];
    const vectorInput = input(value);
    const tsResult = evaluatePublishedOption(requirements, scalarConfig, [vectorInput]);
    const sqlResult = await evaluateSql(sql, requirements, scalarConfig, [vectorInput]);
    expectEvaluationParity(sqlResult, tsResult);
    expect(tsResult.eligibility === "eligible").toBe(expected);
  }

  const weightedRequirements = [requirement("must_req", "yes", "must", 3), requirement("nice_req", "yes", "nice", 1)];
  const weightedConfig = config([
    { requirementKey: "must_req", factKey: "must_fact", responsePath: [] },
    { requirementKey: "nice_req", factKey: "nice_fact", responsePath: [] },
  ]);
  const weighted = await evaluateSql(sql, weightedRequirements, weightedConfig, [input("yes", "must_fact")]);
  expect(weighted).toMatchObject({ eligibility: "eligible", deterministicScore: 7500, confidenceBasisPoints: 7500, fitReasons: ["must_req"], limitations: ["nice_req"] });
  const unknown = await evaluateSql(sql, weightedRequirements, weightedConfig, []);
  expect(unknown).toMatchObject({ eligibility: "unknown", deterministicScore: 0, confidenceBasisPoints: 0, fitReasons: [], limitations: ["must_req", "nice_req"] });

  const invalidCases = [
    { requirements: [requirement("payroll", null)], configuration: scalarConfig, inputs: [input("yes")] },
    { requirements: [requirement("payroll", {})], configuration: scalarConfig, inputs: [input("yes")] },
    { requirements: [requirement("payroll", {})], configuration: config([{ requirementKey: "payroll", factKey: "payroll", responsePath: ["missing"] }]), inputs: [input("yes")] },
  ];
  for (const invalid of invalidCases) {
    await expect(sql.savepoint((probe) =>
      evaluateSql(probe, invalid.requirements, invalid.configuration, invalid.inputs),
    )).rejects.toMatchObject({ code: "22023" });
  }
  await assertFormatTwoParity(sql);
}

async function assertFormatTwoParity(sql: SecurityTransaction) {
  const requirements = [requirement("payroll", "yes", "must", 5),
    requirement("time", "yes", "must", 3), requirement("recruiting", "yes", "nice", 2)];
  const configuration: PublicationConfig = { version: 2, criteria: requirements.map((item) => ({
    requirementKey: item.key, factKey: item.key, responsePath: [],
  })) };
  const cases = [
    { values: ["yes", "yes", "yes"], score: 10000, coverage: 10000, eligibility: "eligible" },
    { values: ["yes", null, "yes"], score: 7000, coverage: 7000, eligibility: "unknown" },
    { values: ["yes", "no", "yes"], score: 7000, coverage: 10000, eligibility: "ineligible" },
    { values: ["yes", "yes", null], score: 8000, coverage: 8000, eligibility: "eligible" },
    { values: [null, null, null], score: 0, coverage: 0, eligibility: "unknown" },
    { values: ["yes", null, null], score: 5000, coverage: 5000, eligibility: "unknown" },
    { values: [null, "no", "yes"], score: 2000, coverage: 5000, eligibility: "ineligible" },
  ];
  const scopeInput = input(JSON.stringify(Object.fromEntries(requirements.map((item) =>
    [item.key, { version: 1, conditions: [] }]))), "comparison_fact_scopes");
  for (const vector of cases) {
    const inputs = vector.values.flatMap((value, index) => value === null ? [] : [input(value, requirements[index].key)]);
    inputs.push(scopeInput);
    const result = await evaluateSql(sql, requirements, configuration, inputs);
    expectEvaluationParity(result, evaluatePublishedOption(requirements, configuration, inputs));
    expect(result).toMatchObject({ eligibility: vector.eligibility,
      deterministicScore: vector.score, confidenceBasisPoints: vector.coverage });
    expect(await evaluateSql(sql, requirements, configuration, [...inputs, input("99", "commission_rate")])).toEqual(result);
  }
  const partial = [input("yes", "payroll"), input("yes", "recruiting"), scopeInput];
  const legacy = await evaluateSql(sql, requirements, { ...configuration, version: 1 }, partial);
  const revised = await evaluateSql(sql, requirements, configuration, partial);
  expect(legacy.eligibility).toBe("ineligible");
  expect(revised).toMatchObject({ eligibility: "unknown", deterministicScore: 7000, confidenceBasisPoints: 7000 });

  for (const factKey of ["commercial_relationship", "paid_placement", "sponsorship_tier", "payment_status"]) {
    await expect(sql.savepoint((probe) => evaluateSql(probe, requirements, {
      ...configuration, criteria: configuration.criteria.map((criterion, index) => index === 0 ? { ...criterion, factKey } : criterion),
    }, []))).rejects.toMatchObject({ code: "22023" });
  }
  const scopedRules: PublicationConfig = { version: 2,
    criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["requested"] }] };
  const scopedEvidence = input(JSON.stringify({ payroll: { version: 1, conditions: [
    { kind: "module", requirementKey: "payroll", responsePath: ["moduleIncluded"], allowedValues: [true] },
  ] } }), "comparison_fact_scopes");
  for (const answer of [true, false, undefined, "true", null, "\t", "\u00a0"]) {
    const saved = [requirement("payroll", { requested: true, ...(answer === undefined ? {} : { moduleIncluded: answer }) })];
    const facts = [input("true"), scopedEvidence];
    const result = await evaluateSql(sql, saved, scopedRules, facts);
    expectEvaluationParity(result, evaluatePublishedOption(saved, scopedRules, facts));
    const [details] = await sql<{ result: { features: Array<{ outcome: string }> } }[]>`
      SELECT mmhr_private.r3_masked_publication_details(${JSON.stringify(scopedRules)}::jsonb,
        ${JSON.stringify(saved)}::jsonb,${JSON.stringify(facts)}::jsonb,${JSON.stringify(result)}::jsonb) AS result`;
    expect(details.result.features[0].outcome).toBe(answer === true ? "match"
      : answer === undefined || answer === null || (typeof answer === "string" && answer.trim() === "") ? "unknown" : "mismatch");
  }
  const saved = [requirement("payroll", { requested: true, moduleIncluded: true })];
  const unscoped = [input("true")];
  expectEvaluationParity(await evaluateSql(sql, saved, scopedRules, unscoped),
    evaluatePublishedOption(saved, scopedRules, unscoped));
  for (const invalidScopes of ["null", "[]", "not-json", JSON.stringify({ payroll: { version: 1, conditions: [
    { kind: "module", requirementKey: "commission_rate", responsePath: [], allowedValues: [true] },
  ] } })]) {
    await expect(sql.savepoint((probe) => evaluateSql(probe, saved, scopedRules,
      [input("true"), input(invalidScopes, "comparison_fact_scopes")]))).rejects.toMatchObject({ code: "22023" });
  }
}
