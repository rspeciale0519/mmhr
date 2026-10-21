import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import {
  AiEvaluationError,
  aiEvaluationFixtureSchema,
  evaluateAiAdapter,
  hashAiFixtureOutput,
} from "./ai-evaluation-contract";

const profile = {
  adapterId: "adapter:fixture",
  modelId: "model:fixture-v1",
  capabilities: ["normalize_response"],
  dataClasses: ["internal"],
  timeoutMs: 100,
  maxAttempts: 1,
  maxCostCents: 25,
  enabled: true,
} as const;
const outputSchema = z.strictObject({ answer: z.string() });
const fixtureInputs = { "fixture:a": { text: "A" }, "fixture:b": { text: "B" } } as const;
const fixtureInputForHash = (fixtureId: string) => fixtureInputs[fixtureId as keyof typeof fixtureInputs] ?? { text: fixtureId };
const fixture = (fixtureId: string, expectedOutputHash: string) => ({
  fixtureId,
  capability: "normalize_response" as const,
  dataClass: "internal" as const,
  schemaVersion: "response-v1",
  inputArtifactId: `artifact:${fixtureId}`,
  inputHash: hashAiFixtureOutput(fixtureInputForHash(fixtureId)),
  expectedOutputHash,
});
const request = {
  profile,
  capability: "normalize_response" as const,
  dataClass: "internal" as const,
  schemaVersion: "response-v1",
  inputs: fixtureInputs,
  schema: outputSchema,
};

describe("AI fixture evaluation contract", () => {
  test("passes complete fixtures and returns only hashed output evidence", async () => {
    const expected = hashAiFixtureOutput({ answer: "ok" });
    const result = await evaluateAiAdapter({
      ...request,
      fixtures: [fixture("fixture:b", expected), fixture("fixture:a", expected)],
      execute: vi.fn(async () => ({ answer: "ok" })),
    });
    expect(result).toMatchObject({ adapterId: "adapter:fixture", passed: true });
    expect(result.rows.map((row) => row.fixtureId)).toEqual(["fixture:a", "fixture:b"]);
    expect(JSON.stringify(result)).not.toContain("answer");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
  });

  test("rejects malformed, duplicate, mismatched, and incomplete fixtures", async () => {
    expect(() => aiEvaluationFixtureSchema.parse({ ...fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" })), extra: true })).toThrow();
    await expect(evaluateAiAdapter({ ...request, fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" })), fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" }))], execute: vi.fn() }))
      .rejects.toMatchObject({ code: "DUPLICATE_FIXTURE" });
    await expect(evaluateAiAdapter({ ...request, fixtures: [{ ...fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" })), dataClass: "public" }], execute: vi.fn() }))
      .rejects.toMatchObject({ code: "INVALID_FIXTURE" });
    await expect(evaluateAiAdapter({ ...request, fixtures: [fixture("fixture:c", hashAiFixtureOutput({ answer: "ok" }))], execute: vi.fn() }))
      .rejects.toMatchObject({ code: "INCOMPLETE_INPUTS" });
  });

  test("rejects an adapter that cannot handle the requested class or capability", async () => {
    await expect(evaluateAiAdapter({
      ...request,
      profile: { ...profile, dataClasses: ["public"] },
      fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" }))],
      execute: vi.fn(),
    })).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });

  test("records validation and output mismatch failures without output values", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ wrong: true })
      .mockResolvedValueOnce({ answer: "different" });
    const result = await evaluateAiAdapter({
      ...request,
      fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "expected" })), fixture("fixture:b", hashAiFixtureOutput({ answer: "expected" }))],
      execute,
    });
    expect(result.passed).toBe(false);
    expect(result.rows).toEqual([
      expect.objectContaining({ fixtureId: "fixture:a", failureCode: "validation_failed", outputHash: null }),
      expect.objectContaining({ fixtureId: "fixture:b", failureCode: "output_mismatch" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("different");
  });

  test("rejects changed fixture input before invoking the adapter", async () => {
    const execute = vi.fn(async () => ({ answer: "ok" }));
    const result = await evaluateAiAdapter({
      ...request,
      inputs: { ...fixtureInputs, "fixture:a": { text: "changed" } },
      fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" }))],
      execute,
    });
    expect(result).toMatchObject({ passed: false, rows: [{ failureCode: "input_mismatch" }] });
    expect(execute).not.toHaveBeenCalled();
  });

  test("keeps provider errors visible and typed", async () => {
    const result = await evaluateAiAdapter({
      ...request,
      fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" }))],
      execute: vi.fn(async () => { throw new Error("private provider response"); }),
    });
    expect(result).toMatchObject({ passed: false, rows: [{ failureCode: "provider_error" }] });
    expect(JSON.stringify(result)).not.toContain("private provider response");
  });

  test("does not allow an empty fixture set to pass", async () => {
    const result = await evaluateAiAdapter({ ...request, fixtures: [], execute: vi.fn() });
    expect(result.passed).toBe(false);
    expect(result.rows).toEqual([]);
  });

  test("exposes a stable, order-independent output hash", () => {
    expect(hashAiFixtureOutput({ b: 2, a: 1 })).toBe(hashAiFixtureOutput({ a: 1, b: 2 }));
  });

  test("uses the declared schema version as part of fixture scope", async () => {
    await expect(evaluateAiAdapter({
      ...request,
      schemaVersion: "response-v2",
      fixtures: [fixture("fixture:a", hashAiFixtureOutput({ answer: "ok" }))],
      execute: vi.fn(),
    })).rejects.toThrowError(new AiEvaluationError("INVALID_FIXTURE"));
  });

  test("fails closed for malformed fixture collections and schema versions", async () => {
    await expect(evaluateAiAdapter({ ...request, fixtures: null as unknown as readonly unknown[], execute: vi.fn() }))
      .rejects.toMatchObject({ code: "INCOMPLETE_INPUTS" });
    await expect(evaluateAiAdapter({ ...request, schemaVersion: "not valid", fixtures: [], execute: vi.fn() }))
      .rejects.toMatchObject({ code: "INVALID_FIXTURE" });
  });
});
