// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseIdentityService, MAX_RESET_FACTORS, RESET_WRITE_BUDGET_MS } from "./supabase";

const subjectId = "c80e9dca-fdf9-4d1e-bce1-281f0e9f188a";
const correlationId = "95284599-c545-46a8-8b02-2f8e6f3fda26";
const context = {
  operation: "mfa_enrollment_reset" as const,
  intentId: "50988d32-2943-4ef9-9db4-c8bef2817b90",
  correlationId,
  idempotencyKey: "95b4b381-d03a-4d05-98aa-68a52e5936fb",
};
const factorA = { id: "490c1ffc-698f-4a89-84d5-27df43a3d236", factor_type: "totp", status: "verified" };
const factorB = { id: "5ce36f62-074e-41cf-a61c-20d6c021c69a", factor_type: "phone", status: "unverified" };
const factorC = { id: "f5b8b5de-9d9c-44e6-9e5f-12fb6f755fc8", factor_type: "webauthn", status: "unverified" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup() {
  const fetchImplementation = vi.fn<typeof fetch>();
  const service = createSupabaseIdentityService({
    supabaseUrl: "https://identity.example.test",
    applicationOrigin: "https://app.example.test",
    adminKey: "synthetic-admin-key-never-real",
    fetchImplementation,
  });
  return { service, fetchImplementation };
}

afterEach(() => vi.restoreAllMocks());

describe("all-factor MFA observations", () => {
  test("lists verified and unverified factors without factor secrets or phone values", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json([
      { ...factorA, secret: "private-marker", friendly_name: "private-marker" },
      { ...factorB, phone: "+15555550100" },
      { ...factorC, factor_type: "future-kind", status: "future-status" },
    ]));
    const result = await service.listMfaFactors({ subjectId, correlationId });
    expect(result).toEqual({ outcome: "succeeded", value: {
      subjectId, observedAt: expect.any(String), factors: [
        { id: factorA.id, kind: "totp", status: "verified" },
        { id: factorB.id, kind: "phone", status: "unverified" },
        { id: factorC.id, kind: "unknown", status: "unknown" },
      ],
    } });
    expect(JSON.stringify(result)).not.toContain("private-marker");
    expect(JSON.stringify(result)).not.toContain("+15555550100");
  });

  test.each([null, {}, [factorA, factorA], [{ ...factorA, id: "invalid-id" }]])(
    "does not treat malformed or duplicate factors as an empty list", async (body) => {
      const { service, fetchImplementation } = setup();
      fetchImplementation.mockResolvedValue(json(body));
      expect(await service.listMfaFactors({ subjectId, correlationId })).toEqual({
        outcome: "failed", code: "provider_response_invalid", retry: "never",
      });
    },
  );
});

describe("bounded MFA enrollment reset", () => {
  test("removes every factor status for exactly the claimed target and confirms zero", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA, factorB]))
      .mockResolvedValueOnce(json({ ...factorA, secret: "private-marker" }))
      .mockResolvedValueOnce(json({ id: factorB.id }))
      .mockResolvedValueOnce(json([]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "succeeded", value: { subjectId, confirmedFactorCount: 0, observedAt: expect.any(String) },
    });
    expect(fetchImplementation.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [`https://identity.example.test/auth/v1/admin/users/${subjectId}/factors`, "GET"],
      [`https://identity.example.test/auth/v1/admin/users/${subjectId}/factors/${factorA.id}`, "DELETE"],
      [`https://identity.example.test/auth/v1/admin/users/${subjectId}/factors/${factorB.id}`, "DELETE"],
      [`https://identity.example.test/auth/v1/admin/users/${subjectId}/factors`, "GET"],
    ]);
    for (const [, init] of fetchImplementation.mock.calls) {
      expect(new Headers(init?.headers).get("x-correlation-id")).toBe(correlationId);
    }
  });

  test("requires a final read even when the initial factor list is empty", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockImplementation(async () => json([]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toMatchObject({ outcome: "succeeded" });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  test("does not repeat or continue deletes after a partial confirmed failure", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA, factorB, factorC]))
      .mockResolvedValueOnce(json({ id: factorA.id }))
      .mockResolvedValueOnce(json({ message: "private-failure-marker" }, 403))
      .mockResolvedValueOnce(json([factorB, factorC]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "failed", code: "factors_remaining", retry: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(fetchImplementation.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(2);
  });

  test.each(["verified", "unverified"])("fails when a new %s factor appears during reset", async (status) => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA]))
      .mockResolvedValueOnce(json({ id: factorA.id }))
      .mockResolvedValueOnce(json([{ ...factorB, status }]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "failed", code: "factors_remaining", retry: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  test("returns unknown when an ambiguous write leaves factors and never retries it", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA]))
      .mockRejectedValueOnce(new Error("private-network-marker"))
      .mockResolvedValueOnce(json([factorA]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "outcome_unknown", code: "factors_remaining", nextAction: "reconcile",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  test("does not trust a deletion receipt for a different factor", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA, factorB]))
      .mockResolvedValueOnce(json({ id: factorC.id }))
      .mockResolvedValueOnce(json([factorA, factorB]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "outcome_unknown", code: "factors_remaining", nextAction: "reconcile",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  test("performs no write when the initial provider read fails", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json({ message: "unavailable" }, 503));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "failed", code: "provider_unavailable", retry: "safe",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0][1]?.method).toBe("GET");
  });

  test("can reconcile an ambiguous deletion only through a later zero-factor read", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA]))
      .mockResolvedValueOnce(json({ message: "provider timeout" }, 503))
      .mockResolvedValueOnce(json([]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toMatchObject({
      outcome: "succeeded", value: { confirmedFactorCount: 0 },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  test("does not report success when final factor verification fails", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation
      .mockResolvedValueOnce(json([factorA]))
      .mockResolvedValueOnce(json({ id: factorA.id }))
      .mockResolvedValueOnce(json({ message: "unavailable" }, 503));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "reconcile",
    });
  });

  test("rejects excessive factor counts before any deletion", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json(Array.from({ length: MAX_RESET_FACTORS + 1 }, (_, index) => ({
      ...factorA, id: `490c1ffc-698f-4a89-84d5-${String(index).padStart(12, "0")}`,
    }))));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toEqual({
      outcome: "failed", code: "reset_limit_exceeded", retry: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  test("stops new deletions when the bounded write budget expires", async () => {
    const { service, fetchImplementation } = setup();
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(RESET_WRITE_BUDGET_MS + 1);
    fetchImplementation
      .mockResolvedValueOnce(json([factorA, factorB]))
      .mockResolvedValueOnce(json({ id: factorA.id }))
      .mockResolvedValueOnce(json([factorB]));
    expect(await service.resetMfaEnrollment({ subjectId, context })).toMatchObject({
      outcome: "failed", code: "factors_remaining", retry: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  test("rejects an incomplete operation context before reading or writing provider data", async () => {
    const { service, fetchImplementation } = setup();
    expect(await service.resetMfaEnrollment({ subjectId, context: { ...context, idempotencyKey: "" } })).toEqual({
      outcome: "failed", code: "invalid_request", retry: "never",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("read-only reset reconciliation", () => {
  test("confirms zero factors without another delete", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json([]));
    expect(await service.reconcileMfaReset({ subjectId, context })).toMatchObject({
      outcome: "succeeded", value: { confirmedFactorCount: 0 },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0][1]?.method).toBe("GET");
  });

  test("requires manual review when factors remain", async () => {
    const { service, fetchImplementation } = setup();
    fetchImplementation.mockResolvedValue(json([factorB]));
    expect(await service.reconcileMfaReset({ subjectId, context })).toEqual({
      outcome: "outcome_unknown", code: "factors_remaining", nextAction: "manual_review",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
