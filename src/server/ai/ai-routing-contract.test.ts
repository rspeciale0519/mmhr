import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import {
  AiRoutingError,
  aiAdapterProfileSchema,
  executeAiWithPolicy,
  selectAiAdapter,
} from "./ai-routing-contract";

const profiles = [
  {
    adapterId: "adapter:zeta",
    modelId: "model:zeta-v1",
    capabilities: ["normalize_response"],
    dataClasses: ["internal"],
    timeoutMs: 100,
    maxAttempts: 2,
    maxCostCents: 50,
    enabled: true,
  },
  {
    adapterId: "adapter:alpha",
    modelId: "model:alpha-v1",
    capabilities: ["normalize_response"],
    dataClasses: ["internal"],
    timeoutMs: 100,
    maxAttempts: 1,
    maxCostCents: 50,
    enabled: true,
  },
] as const;

const request = { capability: "normalize_response" as const, dataClass: "internal" as const, maxCostCents: 10 };
const outputSchema = z.strictObject({ answer: z.string().min(1) });

describe("AI routing contract", () => {
  test("selects a permitted adapter deterministically without a business provider choice", () => {
    expect(selectAiAdapter(profiles, request).adapterId).toBe("adapter:alpha");
  });

  test("rejects malformed, duplicate, disabled, and unauthorized profiles", () => {
    expect(() => aiAdapterProfileSchema.parse({ ...profiles[0], capabilities: [] })).toThrow();
    expect(() => selectAiAdapter([...profiles, profiles[0]], request)).toThrowError(new AiRoutingError("DUPLICATE_ADAPTER"));
    expect(() => selectAiAdapter([{ ...profiles[0], enabled: false }], request)).toThrowError(new AiRoutingError("UNAVAILABLE"));
    expect(() => selectAiAdapter([{ ...profiles[0], dataClasses: ["restricted"] }], request)).toThrowError(new AiRoutingError("UNAVAILABLE"));
  });

  test("selects the deterministic primary and returns a validated value", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ answer: "ok" });
    const result = await executeAiWithPolicy({
      profiles,
      request,
      input: { text: "safe" },
      schema: outputSchema,
      execute,
    });
    expect(result).toMatchObject({ status: "succeeded", adapterId: "adapter:alpha", attempts: 1 });
    expect(execute).toHaveBeenCalledOnce();
  });

  test("uses a bounded retry for the selected adapter", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ answer: "ok" });
    const result = await executeAiWithPolicy({
      profiles: [profiles[0]],
      request,
      input: { text: "safe" },
      schema: outputSchema,
      execute,
    });
    expect(result).toMatchObject({ status: "succeeded", adapterId: "adapter:zeta", attempts: 2 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test("aborts a timed-out adapter call and returns a typed timeout failure", async () => {
    let aborted = false;
    const execute = vi.fn((_profile, _input, signal: AbortSignal) => new Promise<never>(() => {
      signal.addEventListener("abort", () => { aborted = true; }, { once: true });
    }));
    const result = await executeAiWithPolicy({
      profiles: [{ ...profiles[0], maxAttempts: 1, timeoutMs: 100 }],
      request,
      input: {},
      schema: outputSchema,
      execute,
    });
    expect(result).toMatchObject({ status: "failed", failureCode: "provider_timeout", attempts: 1 });
    expect(aborted).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  test("does not silently fallback without an approval reference", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const primary = { ...profiles[0], maxAttempts: 1 };
    await expect(executeAiWithPolicy({
      profiles: [primary],
      request,
      input: {},
      schema: outputSchema,
      execute,
      fallback: { profile: profiles[1], approvalReference: " " },
    })).rejects.toMatchObject({ code: "FALLBACK_NOT_APPROVED" });
    await expect(executeAiWithPolicy({
      profiles: [primary],
      request,
      input: {},
      schema: outputSchema,
      execute,
      fallback: { profile: profiles[1], approvalReference: "approval with spaces" },
    })).rejects.toMatchObject({ code: "FALLBACK_NOT_APPROVED" });
  });

  test("records an approved fallback and validates its output", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("primary down"))
      .mockResolvedValueOnce({ answer: "fallback" });
    const primary = { ...profiles[0], maxAttempts: 1 };
    const result = await executeAiWithPolicy({
      profiles: [primary],
      request,
      input: {},
      schema: outputSchema,
      execute,
      fallback: { profile: profiles[1], approvalReference: "approval:ai-fallback-1" },
    });
    expect(result).toMatchObject({ status: "succeeded", adapterId: "adapter:alpha", fallbackUsed: true, fallbackReference: "approval:ai-fallback-1" });
  });

  test("keeps schema failures terminal and does not fallback", async () => {
    const execute = vi.fn().mockResolvedValue({ invalid: true });
    const result = await executeAiWithPolicy({
      profiles: [profiles[0]],
      request,
      input: {},
      schema: outputSchema,
      execute,
      fallback: { profile: profiles[1], approvalReference: "approval:ai-fallback-2" },
    });
    expect(result).toMatchObject({ status: "failed", failureCode: "validation_failed", fallbackUsed: false });
    expect(execute).toHaveBeenCalledOnce();
  });
});
