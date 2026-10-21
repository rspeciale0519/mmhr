import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient,
} from "@/server/auth/authorization";
import * as commands from "./recovery";
import type { RecoveryCommandReceipt } from "./recovery-receipt";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() { super("Request is not authorized"); }
  },
}));

const subjectId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const receiptId = "44444444-4444-4444-8444-444444444444";
const correlationId = "abcdefab-1234-4567-8abc-def012345678";
const idempotencyKey = "abcdefab-2222-4567-8abc-def012345678";
const evidenceReference = "abcdefab-3333-4567-8abc-def012345678";
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId: correlationId.toUpperCase() };
const normalizedOptions = { supabase, correlationId };
const context: AuthorizationContext = { supabase, identityId: subjectId, correlationId, scope: { kind: "platform" }, assurance: "aal2" };
const claims = { sub: subjectId, session_id: sessionId, role: "authenticated", aal: "aal1", iat: 1_700_000_000, exp: 1_800_000_000 };
const metadata = { idempotencyKey: idempotencyKey.toUpperCase() };
const requestInput = { ...metadata, opaqueReference: "a".repeat(64), reasonCode: "lost_factor" as const };
const decisionInput = {
  ...metadata, requestId: requestId.toUpperCase(), phoneResult: "confirmed" as const, preexistingContactAttested: true,
  phoneCheckedAt: "2026-08-30T12:30:00-04:00", evidenceReference: evidenceReference.toUpperCase(),
};
const endInput = { ...metadata, requestId, endState: "cancelled" as const };
const requestReceipt = { receipt_id: receiptId, entity_id: requestId, action: "identity.recovery.request" };
type Case = {
  name: string; invoke(): Promise<RecoveryCommandReceipt>; rpc: string; args: object;
  action: RecoveryCommandReceipt["action"]; permission?: string;
};
const cases: Case[] = [
  {
    name: "request", invoke: () => commands.requestIdentityRecovery(requestInput, options),
    rpc: "mmhr_request_identity_recovery", args: { opaque_reference: requestInput.opaqueReference, reason_code: "lost_factor" },
    action: "identity.recovery.request",
  },
  {
    name: "approve", invoke: () => commands.decideIdentityRecovery(decisionInput, options),
    rpc: "mmhr_decide_identity_recovery", permission: "identity.recovery.approve", args: {
      request_id: requestId, phone_result: "confirmed", preexisting_contact_attested: true,
      phone_checked_at: "2026-08-30T16:30:00.000Z", evidence_reference: evidenceReference,
    }, action: "identity.recovery.approve",
  },
  {
    name: "deny", invoke: () => commands.decideIdentityRecovery({ ...decisionInput, phoneResult: "failed", evidenceReference: null }, options),
    rpc: "mmhr_decide_identity_recovery", permission: "identity.recovery.approve", args: {
      request_id: requestId, phone_result: "failed", preexisting_contact_attested: true,
      phone_checked_at: "2026-08-30T16:30:00.000Z", evidence_reference: null,
    }, action: "identity.recovery.deny",
  },
  ...(["cancelled", "expired"] as const).map((endState): Case => ({
    name: endState, invoke: () => commands.endIdentityRecovery({ ...endInput, endState }, options),
    rpc: "mmhr_end_identity_recovery", permission: "identity.recovery.request", args: { request_id: requestId, end_state: endState },
    action: endState === "cancelled" ? "identity.recovery.cancel" : "identity.recovery.expire",
  })),
];

describe("typed recovery commands", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: requestReceipt, error: null });
    getClaims.mockReset().mockResolvedValue({ data: { claims }, error: null });
    vi.mocked(createClient).mockReset().mockResolvedValue(supabase);
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test.each(cases)("uses the exact caller-scoped contract to $name", async (entry) => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, action: entry.action }, error: null });
    await expect(entry.invoke()).resolves.toEqual({ receiptId, entityId: requestId, action: entry.action });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(entry.rpc, { ...entry.args, correlation_id: correlationId, idempotency_key: idempotencyKey });
    if (entry.permission) {
      expect(requirePermission).toHaveBeenCalledExactlyOnceWith(entry.permission, { kind: "platform" }, normalizedOptions);
      expect(getClaims).not.toHaveBeenCalled();
    } else {
      expect(getClaims).toHaveBeenCalledOnce();
      expect(requirePermission).not.toHaveBeenCalled();
    }
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("auth_subject_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("auth_session_id");
  });

  test.each(["aal1", "aal2"])("passes only the fixed request RPC after verified %s", async (aal) => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal } }, error: null });
    await commands.requestIdentityRecovery(requestInput, options);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("leaves wrong-target AAL1 denial to the fixed SQL exception without a broader permission check", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "private target details", code: "42501" } });
    await expect(commands.requestIdentityRecovery(requestInput, options)).rejects.toMatchObject({ code: "REJECTED" });
    expect(rpc).toHaveBeenCalledOnce();
    expect(requirePermission).not.toHaveBeenCalled();
  });
  test("uses a request-bound cookie client when the server does not inject one", async () => {
    await commands.requestIdentityRecovery(requestInput, { correlationId });
    expect(createClient).toHaveBeenCalledExactlyOnceWith();
    expect(getClaims).toHaveBeenCalledOnce();
  });

  test.each([
    null, {}, { ...claims, sub: "invalid" }, { ...claims, session_id: null }, { ...claims, session_id: "invalid" },
    { ...claims, role: "service_role" }, { ...claims, aal: "aal3" }, { ...claims, exp: null },
    { ...claims, exp: "1800000000" }, { ...claims, iat: -1 }, { ...claims, iat: claims.exp },
  ])("rejects malformed verified identity data: %j", async (value) => {
    getClaims.mockResolvedValue({ data: { claims: value }, error: null });
    await expect(commands.requestIdentityRecovery(requestInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(cases)("does not $name after authorization denial", async (entry) => {
    getClaims.mockResolvedValue({ data: { claims }, error: { message: "invalid token" } });
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each(cases.filter((entry) => entry.permission))("requires AAL2 for $name", async (entry) => {
    vi.mocked(requirePermission).mockResolvedValue({ ...context, assurance: "aal1" });
    await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("uses only the client returned by current permission authorization", async () => {
    const authorizedRpc = vi.fn().mockResolvedValue({ data: { ...requestReceipt, action: "identity.recovery.approve" }, error: null });
    vi.mocked(requirePermission).mockResolvedValue({ ...context, supabase: { rpc: authorizedRpc } as unknown as RequestSupabaseClient });
    await commands.decideIdentityRecovery(decisionInput, options);
    expect(authorizedRpc).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    { ...context, scope: { kind: "organization" as const, organizationId: requestId } },
    { ...context, correlationId: "11111111-1111-f111-8111-111111111111" },
    { ...context, correlationId: evidenceReference },
  ])("rejects an inconsistent authorization context before a write", async (invalidContext) => {
    vi.mocked(requirePermission).mockResolvedValue(invalidContext);
    await expect(commands.decideIdentityRecovery(decisionInput, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  for (const [name, invoke] of [
    ["request", (value: unknown) => commands.requestIdentityRecovery(value as typeof requestInput, options)],
    ["decision", (value: unknown) => commands.decideIdentityRecovery(value as typeof decisionInput, options)],
    ["end", (value: unknown) => commands.endIdentityRecovery(value as typeof endInput, options)],
  ] as const) {
    const input = name === "request" ? requestInput : name === "decision" ? decisionInput : endInput;
    test.each([
      null, {}, { ...input, actorId: subjectId }, { ...input, sessionId }, { ...input, subjectId },
      { ...input, targetIdentityId: subjectId }, { ...input, phoneNumber: "not permitted" },
      { ...input, correlationId }, { ...input, idempotencyKey: "11111111-1111-f111-8111-111111111111" },
    ])(`rejects invalid ${name} input before any authorization or write: %j`, async (value) => {
      await expect(invoke(value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(rpc).not.toHaveBeenCalled();
      expect(getClaims).not.toHaveBeenCalled();
      expect(requirePermission).not.toHaveBeenCalled();
    });
  }
  test.each([null, "invalid", "11111111-1111-f111-8111-111111111111", "11111111-1111-4111-7111-111111111111"])
    ("rejects unsupported correlation metadata before writes: %j", async (invalid) => {
      const badOptions = { ...options, correlationId: invalid as string };
      for (const invoke of [
        () => commands.requestIdentityRecovery(requestInput, badOptions),
        () => commands.decideIdentityRecovery(decisionInput, badOptions),
        () => commands.endIdentityRecovery(endInput, badOptions),
      ]) await expect(invoke()).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(rpc).not.toHaveBeenCalled();
      expect(getClaims).not.toHaveBeenCalled();
      expect(requirePermission).not.toHaveBeenCalled();
    });

  test.each(cases)("does not retry $name after an uncertain transport failure", async (entry) => {
    rpc.mockRejectedValue(new Error("private connection content"));
    const result = entry.invoke();
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery command could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(cases)("discards data and private errors when SQL rejects $name", async (entry) => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, action: entry.action }, error: { message: "private SQL content", code: "23505" } });
    const result = entry.invoke();
    await expect(result).rejects.toMatchObject({ code: "REJECTED", message: "Recovery command could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(["identity", "permission", "client"])("sanitizes unexpected %s service failure", async (source) => {
    const error = new Error("private service content");
    getClaims.mockRejectedValue(error);
    vi.mocked(requirePermission).mockRejectedValue(error);
    vi.mocked(createClient).mockRejectedValue(error);
    const result = source === "permission" ? commands.decideIdentityRecovery(decisionInput, options)
      : commands.requestIdentityRecovery(requestInput, source === "client" ? { correlationId } : options);
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery command could not be completed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, [], [requestReceipt], {}, { ...requestReceipt, receipt_id: "invalid" },
    { ...requestReceipt, entity_id: "invalid" }, { ...requestReceipt, action: "identity.recovery.approve" },
    { ...requestReceipt, action: "identity.recovery.reset_confirmed" }, { ...requestReceipt, raw_reference: "must-not-escape" },
    { ...requestReceipt, actor_identity_id: subjectId }, { ...requestReceipt, request_matches: true },
  ])("rejects unsafe or mismatched receipts: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(commands.requestIdentityRecovery(requestInput, options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  test.each(cases.filter((entry) => entry.permission))("rejects another request's receipt for $name", async (entry) => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, entity_id: sessionId, action: entry.action }, error: null });
    await expect(entry.invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  test.each(cases)("requires the exact receipt action for $name", async (entry) => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, action: "identity.recovery.presence.create" }, error: null });
    await expect(entry.invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  test("expects denial when contact confirmation lacks the required attestation", async () => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, action: "identity.recovery.deny" }, error: null });
    await expect(commands.decideIdentityRecovery({ ...decisionInput, preexistingContactAttested: false, evidenceReference: null }, options))
      .resolves.toMatchObject({ action: "identity.recovery.deny" });
  });
  test("keeps semantic inputs and the key for an explicit retry with a new correlation", async () => {
    const first = await commands.requestIdentityRecovery(requestInput, options);
    const nextCorrelation = evidenceReference;
    const second = await commands.requestIdentityRecovery(requestInput, { supabase, correlationId: nextCorrelation });
    expect(first).toEqual(second);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([rpc.mock.calls[0][0], { ...rpc.mock.calls[0][1], correlation_id: nextCorrelation }]);
    expect(getClaims).toHaveBeenCalledTimes(2);
  });
  test("keeps equivalent phone-check instants identical for semantic replay", async () => {
    rpc.mockResolvedValue({ data: { ...requestReceipt, action: "identity.recovery.approve" }, error: null });
    await commands.decideIdentityRecovery(decisionInput, options);
    await commands.decideIdentityRecovery({ ...decisionInput, phoneCheckedAt: "2026-08-30T16:30:00.000Z" }, options);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  test("leaves request deadline and phone-check boundaries to SQL", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "expired" } });
    await expect(commands.decideIdentityRecovery({ ...decisionInput, phoneCheckedAt: "2000-01-01T00:00:00Z" }, options))
      .rejects.toMatchObject({ code: "REJECTED" });
    expect(rpc.mock.calls[0][1].phone_checked_at).toBe("2000-01-01T00:00:00.000Z");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
