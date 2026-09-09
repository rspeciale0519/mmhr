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
}
