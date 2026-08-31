import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { IdentityIntentSqlExecutor } from "@/server/db/identity-intent-repository";
import type { IdentityService } from "@/server/identity/service";

const mocks = vi.hoisted(() => ({
  databaseLoaded: vi.fn(),
  execute: vi.fn<IdentityIntentSqlExecutor["execute"]>(),
  createService: vi.fn(),
  service: {
    providerWriteIdempotency: "unsupported" as const,
    getVerificationFacts: vi.fn<IdentityService["getVerificationFacts"]>(),
    listMfaFactors: vi.fn<IdentityService["listMfaFactors"]>(),
    resetMfaEnrollment: vi.fn<IdentityService["resetMfaEnrollment"]>(),
    reconcileMfaReset: vi.fn<IdentityService["reconcileMfaReset"]>(),
    deliverInvitation: vi.fn<IdentityService["deliverInvitation"]>(),
    reconcileInvitation: vi.fn<IdentityService["reconcileInvitation"]>(),
  } satisfies IdentityService,
}));
vi.mock("@/server/db", () => {
  mocks.databaseLoaded();
  return { db: { execute: mocks.execute } };
});
vi.mock("./supabase", () => ({ createSupabaseIdentityService: mocks.createService }));

const intentId = "abcdefab-1111-4111-8111-111111111111";
const correlationId = "abcdefab-2222-4222-8222-222222222222";
const leaseToken = "abcdefab-3333-4333-8333-333333333333";
const idempotencyKey = "abcdefab-4444-4444-8444-444444444444";
const claim = {
  intentId, correlationId, leaseToken, idempotencyKey, attemptNumber: 1, maximumAttempts: 5,
  leaseExpiresAt: "2026-08-30T22:10:00.000Z", operation: "invitation_delivery", email: "approved@example.test",
};
const dialect = new PgDialect();
const run = async () => (await import("./worker")).runIdentityIntentWorker();

function expectNoProviderRequests() {
  for (const method of [mocks.service.deliverInvitation, mocks.service.reconcileInvitation,
    mocks.service.resetMfaEnrollment, mocks.service.reconcileMfaReset,
    mocks.service.getVerificationFacts, mocks.service.listMfaFactors]) expect(method).not.toHaveBeenCalled();
}

describe("identity worker composition", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-30T22:00:00.000Z");
    vi.stubEnv("IDENTITY_INTENT_WORKER_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://provider.example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-private-key-1234567890");
    mocks.createService.mockReturnValue(mocks.service);
    mocks.execute.mockResolvedValue([]);
    mocks.service.deliverInvitation.mockResolvedValue({ outcome: "succeeded", value: { acknowledgement: "provider_accepted" } });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  test.each([undefined, "0"])("stays disabled without loading SQL or provider configuration: %s", async (value) => {
    vi.stubEnv("IDENTITY_INTENT_WORKER_ENABLED", value);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    await expect(run()).resolves.toEqual({ outcome: "disabled" });
    expect(mocks.databaseLoaded).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expectNoProviderRequests();
  });

  test.each(["", "true", "false", "01", " 1", "1 "])("rejects an invalid activation flag: %s", async (value) => {
    vi.stubEnv("IDENTITY_INTENT_WORKER_ENABLED", value);
    await expect(run()).resolves.toEqual({ outcome: "failed", code: "configuration_invalid" });
    expect(mocks.databaseLoaded).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  test.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY"])(
    "requires the configured %s before database access", async (name) => {
      vi.stubEnv(name, undefined);
      await expect(run()).resolves.toEqual({ outcome: "failed", code: "configuration_invalid" });
      expect(mocks.databaseLoaded).not.toHaveBeenCalled();
      expect(mocks.createService).not.toHaveBeenCalled();
      expectNoProviderRequests();
    },
  );

  test("redacts invalid provider configuration without opening the database", async () => {
    mocks.createService.mockImplementation(() => { throw new Error("private adapter configuration"); });
    await expect(run()).resolves.toEqual({ outcome: "failed", code: "configuration_invalid" });
    expect(mocks.databaseLoaded).not.toHaveBeenCalled();
    expectNoProviderRequests();
  });

  test("redacts database initialization failure before provider requests", async () => {
    mocks.databaseLoaded.mockImplementation(() => { throw new Error("private owner connection"); });
    await expect(run()).resolves.toEqual({ outcome: "failed", code: "initialization_failed" });
    expect(mocks.execute).not.toHaveBeenCalled();
    expectNoProviderRequests();
  });

  test.each(["access_denied", "malformed_candidates"])("stops on %s before any provider call", async (failure) => {
    if (failure === "access_denied") mocks.execute.mockRejectedValue(new Error("42501 private grant detail"));
    else mocks.execute.mockResolvedValue([{ intent_id: "private invalid ID" }]);
    await expect(run()).resolves.toMatchObject({ outcome: "failed", code: "source_unavailable", items: [] });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expectNoProviderRequests();
  });

  test("treats an empty outbox as a completed read with no provider request", async () => {
    await expect(run()).resolves.toEqual({
      outcome: "completed", items: [],
      counts: { succeeded: 0, not_claimed: 0, retry_pending: 0, reconcile: 0, needs_attention: 0 },
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expectNoProviderRequests();
  });

  test("wires discovery, a leased claim, one provider call, and atomic result recording", async () => {
    mocks.execute.mockResolvedValueOnce([{ intent_id: intentId }])
      .mockResolvedValueOnce([{ claim }]).mockResolvedValueOnce([{ result: "recorded" }]);
    await expect(run()).resolves.toMatchObject({
      outcome: "completed", counts: { succeeded: 1, needs_attention: 0 },
      items: [{ intentId, status: "succeeded", outcome: "succeeded", code: "invitation_provider_accepted" }],
    });
    expect(mocks.createService).toHaveBeenCalledWith({
      supabaseUrl: "https://provider.example.test", applicationOrigin: "https://app.example.test",
      adminKey: "synthetic-private-key-1234567890",
    });
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    expect(mocks.service.deliverInvitation).toHaveBeenCalledOnce();
    expect(mocks.service.deliverInvitation).toHaveBeenCalledWith({
      email: claim.email, context: { intentId, correlationId, idempotencyKey, operation: "invitation_delivery" },
    });
    const queries = mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
    expect(queries[0]).toMatchObject({ sql: "SELECT intent_id FROM mmhr_private.mmhr_list_identity_intent_candidates()", params: [] });
    expect(queries[1]).toMatchObject({ sql: "SELECT mmhr_private.mmhr_claim_identity_intent($1::uuid) AS claim", params: [intentId] });
    expect(queries[2].params).toEqual([
      intentId, leaseToken, JSON.stringify({ outcome: "succeeded", resultCode: "invitation_provider_accepted" }),
    ]);
  });

  test("does not repeat a provider write after its result acknowledgement fails", async () => {
    mocks.execute.mockResolvedValueOnce([{ intent_id: intentId }])
      .mockResolvedValueOnce([{ claim }]).mockRejectedValueOnce(new Error("private result failure"));
    const result = await run();
    expect(result).toMatchObject({
      outcome: "completed", counts: { reconcile: 1 },
      items: [{ intentId, status: "reconcile", outcome: "outcome_unknown", code: "result_recording_failed" }],
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(mocks.service.deliverInvitation).toHaveBeenCalledOnce();
    expect(mocks.service.reconcileInvitation).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });
});
