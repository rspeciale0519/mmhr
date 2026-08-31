import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { securityUuidSchema } from "@/server/audit/security-values";
import { AuthorizationError, requirePermission, type AuthorizationOptions, type RequestSupabaseClient } from "@/server/auth/authorization";
import * as commands from "./recovery-mfa";
import type { ReactivateRecoveredIdentityInput, RegisterRecoveryFactorInput } from "./recovery-mfa-contract";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() { super("Request is not authorized"); }
  },
}));

const subjectId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const identityId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const presenceId = "55555555-5555-4555-8555-555555555555";
const receiptId = "66666666-6666-4666-8666-666666666666";
const factorId = "abcdefab-1111-4111-8111-111111111111";
const correlationId = "abcdefab-2222-4222-8222-222222222222";
const idempotencyKey = "abcdefab-3333-4333-8333-333333333333";
const nextCorrelation = "abcdefab-4444-4444-8444-444444444444";
const now = Math.floor(Date.now() / 1000);
const claims = { sub: subjectId, session_id: sessionId, role: "authenticated", aal: "aal2", iat: now - 60, exp: now + 3_600 };
const row = { recovery_request_id: requestId, recovery_presence_id: presenceId, expected_factor_id: null, state: "enrollment_required" };
const metadata = { idempotencyKey: idempotencyKey.toUpperCase() };
const registerInput = { ...metadata, factorId: factorId.toUpperCase() };
const getClaims = vi.fn();
const getSession = vi.fn();
const enroll = vi.fn();
const challenge = vi.fn();
const verify = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims, getSession, mfa: { enroll, challenge, verify } }, rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId: correlationId.toUpperCase() };
const registerAction = "identity.recovery.factor.register";
const reactivateAction = "identity.recovery.reactivate";
const receipt = { receipt_id: receiptId, entity_id: presenceId, action: registerAction };
const cases = [
  {
    name: "context read", rpc: "mmhr_get_recovery_mfa_context", action: null,
    invoke: (configured: AuthorizationOptions = options) => commands.getRecoveryMfaContext(configured),
  },
  {
    name: "factor registration", rpc: "mmhr_register_recovery_factor", action: registerAction,
    invoke: (configured: AuthorizationOptions = options) => commands.registerRecoveryFactor(registerInput, configured),
  },
  {
    name: "reactivation", rpc: "mmhr_reactivate_recovered_identity", action: reactivateAction,
    invoke: (configured: AuthorizationOptions = options) => commands.reactivateRecoveredIdentity(metadata, configured),
  },
];
const writes = cases.filter((entry) => entry.action !== null);

describe("caller-bound recovery MFA clients", () => {
  beforeEach(() => {
    rpc.mockReset().mockImplementation(async (name: string) => ({
      data: name === "mmhr_get_recovery_mfa_context" ? [row]
        : name === "mmhr_register_recovery_factor" ? receipt : { ...receipt, entity_id: identityId, action: reactivateAction },
      error: null,
    }));
    getClaims.mockReset().mockResolvedValue({ data: { claims }, error: null });
    getSession.mockReset();
    enroll.mockReset();
    challenge.mockReset();
    verify.mockReset();
    vi.mocked(createClient).mockReset().mockResolvedValue(supabase);
    vi.mocked(requirePermission).mockReset().mockRejectedValue(new AuthorizationError());
  });

  test("reads one safe context without any target, session, or mutation metadata", async () => {
    await expect(commands.getRecoveryMfaContext(options)).resolves.toEqual({
      recoveryRequestId: requestId, recoveryPresenceId: presenceId, expectedFactorId: null, state: "enrollment_required",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_recovery_mfa_context");
  });
  test("returns null when SQL denies the context with no rows", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(commands.getRecoveryMfaContext(options)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("registers only the canonical factor ID and command metadata", async () => {
    await expect(commands.registerRecoveryFactor(registerInput, options))
      .resolves.toEqual({ receiptId, entityId: presenceId, action: registerAction });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_register_recovery_factor", {
      factor_id: factorId, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });
  test("does not confuse the reactivated stable identity with the Auth subject", async () => {
    await expect(commands.reactivateRecoveredIdentity(metadata, options))
      .resolves.toEqual({ receiptId, entityId: identityId, action: reactivateAction });
    expect(identityId).not.toBe(subjectId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_reactivate_recovered_identity", {
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });
  test.each(cases)("uses verified claims, not ordinary permission checks or provider writes, for $name", async (entry) => {
    await entry.invoke();
    expect(getClaims).toHaveBeenCalledExactlyOnceWith();
    expect(requirePermission).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases.slice(0, 2))("permits verified AAL1 for $name and leaves containment checks to SQL", async (entry) => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal: "aal1" } }, error: null });
    await entry.invoke();
    expect(rpc).toHaveBeenCalledOnce();
    expect(requirePermission).not.toHaveBeenCalled();
  });
  test("requires fresh AAL2 before requesting reactivation", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal: "aal1" } }, error: null });
    await expect(commands.reactivateRecoveredIdentity(metadata, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(cases)("builds a request-cookie client for $name only when one is not injected", async (entry) => {
    await entry.invoke({ correlationId });
    expect(createClient).toHaveBeenCalledExactlyOnceWith();
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(writes)("generates only transport correlation metadata for $name", async (entry) => {
    await entry.invoke({ supabase });
    expect(securityUuidSchema.safeParse(rpc.mock.calls[0][1].correlation_id).success).toBe(true);
    expect(rpc.mock.calls[0][1].idempotency_key).toBe(idempotencyKey);
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases)("accepts ordinary extra provider claims without returning them for $name", async (entry) => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, iss: "provider", email: "private value", app_metadata: { value: "private" } } }, error: null });
    const result = await entry.invoke();
    expect(JSON.stringify(result)).not.toContain("private");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([
    null, {}, { ...claims, sub: "invalid" }, { ...claims, session_id: null }, { ...claims, session_id: "invalid" },
    { ...claims, sub: "11111111-1111-f111-8111-111111111111" }, { ...claims, session_id: "11111111-1111-4111-7111-111111111111" },
    { ...claims, role: "service_role" }, { ...claims, role: "anon" }, { ...claims, aal: "aal3" }, { ...claims, aal: null },
    { ...claims, iat: undefined }, { ...claims, iat: "1" }, { ...claims, iat: -1 }, { ...claims, iat: now + 3_600 },
    { ...claims, iat: now - 0.5 }, { ...claims, iat: claims.exp }, { ...claims, exp: now }, { ...claims, exp: now - 60 },
    { ...claims, exp: undefined }, { ...claims, exp: null }, { ...claims, exp: "9999999999" }, { ...claims, exp: Infinity },
    { ...claims, exp: 1_000_000_000_000 },
  ])("rejects malformed, stale, or future claims before any RPC: %j", async (value) => {
    getClaims.mockResolvedValue({ data: { claims: value }, error: null });
    for (const entry of cases) await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([undefined, null, {}, { data: null, error: null }, { data: { claims }, error: { message: "private token data" } }])
    ("rejects absent or unverified claims responses: %j", async (response) => {
      getClaims.mockResolvedValue(response);
      for (const entry of cases) await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
      expect(rpc).not.toHaveBeenCalled();
    });
  test.each(cases)("leaves current session, factor, and capacity rejection to fixed SQL for $name", async (entry) => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private session or factor" } });
    await expect(entry.invoke()).rejects.toMatchObject({ code: "REJECTED", message: "Recovery MFA operation could not be completed" });
    expect(rpc).toHaveBeenCalledOnce();
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test.each([
    null, "invalid", "11111111-1111-f111-8111-111111111111", "11111111-1111-4111-7111-111111111111",
  ])("rejects invalid correlation metadata before identity checks or writes: %j", async (value) => {
    for (const entry of cases) await expect(entry.invoke({ ...options, correlationId: value as string }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
  test.each(["actorId", "subjectId", "sessionId", "aal", "rpc", "factorId", "identityId"])
    ("does not admit a forged %s in trusted server options", async (field) => {
      for (const entry of cases) await expect(entry.invoke({ ...options, [field]: "forged" }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(getClaims).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
  test.each([null, "client", 3, [], {}, { rpc }, { rpc, auth: { getSession } }])("rejects malformed injected clients: %j", async (client) => {
    expectTypeOf(client).not.toExtend<RequestSupabaseClient>();
    expectTypeOf(commands.getRecoveryMfaContext).parameter(0).toEqualTypeOf<AuthorizationOptions | undefined>();
    // Exercise invalid JavaScript input without asserting that the fixture is a valid typed client.
    await expect(Reflect.apply(commands.getRecoveryMfaContext, undefined, [{ supabase: client }]))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  for (const [name, input, invoke] of [
    ["registration", registerInput, (value: unknown) => commands.registerRecoveryFactor(value as RegisterRecoveryFactorInput, options)],
    ["reactivation", metadata, (value: unknown) => commands.reactivateRecoveredIdentity(value as ReactivateRecoveredIdentityInput, options)],
  ] as const) {
    test.each([
      null, undefined, {}, { ...input, idempotencyKey: "invalid" },
      { ...input, idempotencyKey: "11111111-1111-f111-8111-111111111111" },
      { ...input, actorId: identityId }, { ...input, subjectId }, { ...input, sessionId }, { ...input, aal: "aal2" },
      { ...input, identityId }, { ...input, rpc: "other_rpc" }, { ...input, totp: "private" }, { ...input, correlationId },
    ])(`rejects invalid ${name} input before any client or RPC work: %j`, async (value) => {
      await expect(invoke(value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(getClaims).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
    });
  }

  test.each(cases)("does not retry $name after uncertain transport failure", async (entry) => {
    rpc.mockRejectedValue(new Error("private connection and SQL text"));
    const result = entry.invoke();
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery MFA operation could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases)("discards successful-looking data when SQL rejects $name", async (entry) => {
    rpc.mockResolvedValue({ data: entry.action === null ? [row] : { ...receipt, action: entry.action }, error: { code: "23505", message: "private SQL" } });
    const result = entry.invoke();
    await expect(result).rejects.toMatchObject({ code: "REJECTED", message: "Recovery MFA operation could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases)("rejects a missing RPC response for $name", async (entry) => {
    rpc.mockResolvedValue(undefined);
    await expect(entry.invoke()).rejects.toMatchObject({ code: "REJECTED" });
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases)("redacts claim service failures for $name", async (entry) => {
    getClaims.mockRejectedValue(new Error("private token and network data"));
    const result = entry.invoke();
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery MFA operation could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(cases)("redacts request client failures for $name", async (entry) => {
    vi.mocked(createClient).mockRejectedValue(new Error("private cookie content"));
    await expect(entry.invoke({ correlationId })).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery MFA operation could not be completed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    null, undefined, {}, row, [row, row], [{ ...row, expected_factor_id: factorId }],
    [{ ...row, state: "completed" }], [{ ...row, secret: "private" }], [{ ...row, recovery_request_id: "invalid" }],
  ])("rejects malformed context rows at the client boundary: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(commands.getRecoveryMfaContext(options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(writes)("checks the exact receipt action for $name", async (entry) => {
    rpc.mockResolvedValue({ data: { ...receipt, action: entry.action === registerAction ? reactivateAction : registerAction }, error: null });
    await expect(entry.invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each([null, undefined, {}, [], [receipt], { ...receipt, secret: "private" }, { ...receipt, entity_id: "invalid" }])
    ("rejects malformed receipts without exposing raw data: %j", async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      for (const entry of writes) await expect(entry.invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "Recovery MFA operation could not be completed" });
    });

  test.each(writes)("rechecks claims and preserves the semantic key on an explicit $name retry", async (entry) => {
    const first = await entry.invoke();
    const second = await entry.invoke({ supabase, correlationId: nextCorrelation });
    expect(second).toEqual(first);
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([entry.rpc, { ...rpc.mock.calls[0][1], correlation_id: nextCorrelation }]);
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  test.each(writes)("permits only an explicit retry after an uncertain $name response", async (entry) => {
    rpc.mockRejectedValueOnce(new Error("response lost after commit"));
    await expect(entry.invoke()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledOnce();
    await entry.invoke({ supabase, correlationId: nextCorrelation });
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([entry.rpc, { ...rpc.mock.calls[0][1], correlation_id: nextCorrelation }]);
  });
  test.each(writes)("does not reuse stale authorization on a $name retry", async (entry) => {
    await entry.invoke();
    getClaims.mockResolvedValue({ data: { claims }, error: { message: "session revoked" } });
    await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("lets SQL reject changed semantic input instead of creating a new key or retrying", async () => {
    await commands.registerRecoveryFactor(registerInput, options);
    rpc.mockResolvedValue({ data: null, error: { message: "idempotency mismatch" } });
    await expect(commands.registerRecoveryFactor({ ...registerInput, factorId: requestId }, options)).rejects.toMatchObject({ code: "REJECTED" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({ factor_id: requestId, idempotency_key: idempotencyKey, correlation_id: correlationId });
  });
});
