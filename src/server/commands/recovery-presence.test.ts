import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requirePermission, type RequestSupabaseClient } from "@/server/auth/authorization";
import {
  createRecoveryPresence, prepareRecoveryPresence, type PreparedRecoveryPresence,
} from "./recovery";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const random = vi.fn((size: number) => actual.randomBytes(size));
  // Vitest also resolves the production Node import through its default facade.
  return { ...actual, randomBytes: random, default: { ...actual, randomBytes: random } };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() { super("Request is not authorized"); }
  },
}));

const subjectId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const presenceId = "33333333-3333-4333-8333-333333333333";
const receiptId = "44444444-4444-4444-8444-444444444444";
const correlationId = "abcdefab-1234-4567-8abc-def012345678";
const idempotencyKey = "abcdefab-2222-4567-8abc-def012345678";
const nextCorrelation = "abcdefab-3333-4567-8abc-def012345678";
const metadata = { idempotencyKey: idempotencyKey.toUpperCase() };
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId: correlationId.toUpperCase() };
const claims = { sub: subjectId, session_id: sessionId, role: "authenticated", aal: "aal1", iat: 1_700_000_000, exp: 1_800_000_000 };
const receipt = { receipt_id: receiptId, entity_id: presenceId, action: "identity.recovery.presence.create" };

describe("server-generated recovery presence", () => {
  beforeEach(() => {
    vi.mocked(randomBytes).mockClear();
    vi.mocked(requirePermission).mockReset();
    vi.mocked(createClient).mockReset().mockResolvedValue(supabase);
    getClaims.mockReset().mockResolvedValue({ data: { claims }, error: null });
    rpc.mockReset().mockResolvedValue({ data: receipt, error: null });
  });

  test("creates an opaque in-memory handle without reading identity or making a request", () => {
    const prepared = prepareRecoveryPresence(metadata);
    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(32);
    expect(Object.keys(prepared)).toEqual([]);
    expect(Object.getOwnPropertySymbols(prepared)).toEqual([]);
    expect(JSON.stringify(prepared)).toBe("{}");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test("sends only a SHA256 digest and returns the reference through an in-memory accessor", async () => {
    const prepared = prepareRecoveryPresence(metadata);
    const result = await createRecoveryPresence(prepared, options);
    const reference = result.readReference();
    expect(reference).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt).toEqual({ receiptId, entityId: presenceId, action: "identity.recovery.presence.create" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_recovery_presence", {
      reference_hash: createHash("sha256").update(reference, "utf8").digest("hex"),
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(reference);
    expect(JSON.stringify(result)).toBe(JSON.stringify({ receipt: result.receipt }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(getClaims).toHaveBeenCalledOnce();
    expect(createClient).not.toHaveBeenCalled();
  });
  test("uses fresh cryptographic randomness for a new prepared handle", async () => {
    const first = await createRecoveryPresence(prepareRecoveryPresence(metadata), options);
    const second = await createRecoveryPresence(prepareRecoveryPresence({ idempotencyKey: nextCorrelation }), options);
    expect(first.readReference()).not.toBe(second.readReference());
    expect(randomBytes).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1].idempotency_key).toBe(nextCorrelation);
  });
  test.each(["aal1", "aal2"])("uses the fixed SQL presence exception with verified %s", async (aal) => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal } }, error: null });
    await createRecoveryPresence(prepareRecoveryPresence(metadata), options);
    expect(rpc).toHaveBeenCalledOnce();
    expect(requirePermission).not.toHaveBeenCalled();
  });
  test("uses the caller's cookie client when none is injected", async () => {
    await createRecoveryPresence(prepareRecoveryPresence(metadata), { correlationId });
    expect(createClient).toHaveBeenCalledExactlyOnceWith();
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([
    null, undefined, {}, [], "handle", { idempotencyKey }, { reference: "a".repeat(64) },
    { subjectId, sessionId, idempotencyKey, referenceHash: "a".repeat(64) },
  ])("rejects forged or serialized handles before identity access: %j", async (handle) => {
    await expect(createRecoveryPresence(handle as PreparedRecoveryPresence, options)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test("cannot restore a prepared handle from JSON", async () => {
    const serialized = JSON.parse(JSON.stringify(prepareRecoveryPresence(metadata))) as PreparedRecoveryPresence;
    await expect(createRecoveryPresence(serialized, options)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    null, {}, { ...metadata, reference: "a".repeat(64) }, { ...metadata, referenceHash: "a".repeat(64) },
    { ...metadata, subjectId }, { ...metadata, sessionId }, { idempotencyKey: "invalid" },
    { idempotencyKey: "11111111-1111-f111-8111-111111111111" },
  ])("rejects invalid preparation before generating any reference: %j", (input) => {
    expect(() => prepareRecoveryPresence(input as typeof metadata)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(randomBytes).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([null, "", "11111111-1111-f111-8111-111111111111", "11111111-1111-4111-7111-111111111111"])
    ("rejects invalid correlation metadata before any request: %j", async (correlation) => {
      await expect(createRecoveryPresence(prepareRecoveryPresence(metadata), { supabase, correlationId: correlation as string }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(getClaims).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
  test("generates a canonical transport correlation when absent", async () => {
    await createRecoveryPresence(prepareRecoveryPresence(metadata), { supabase });
    expect(rpc.mock.calls[0][1].correlation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("reuses the same reference and key only when explicitly called again", async () => {
    const handle = prepareRecoveryPresence(metadata);
    const first = await createRecoveryPresence(handle, options);
    const second = await createRecoveryPresence(handle, { supabase, correlationId: nextCorrelation });
    expect(second.receipt).toEqual(first.receipt);
    expect(second.readReference()).toBe(first.readReference());
    expect(randomBytes).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual([rpc.mock.calls[0][0], { ...rpc.mock.calls[0][1], correlation_id: nextCorrelation }]);
  });
  test("keeps an uncertain result retryable in memory without returning or regenerating its reference", async () => {
    const handle = prepareRecoveryPresence(metadata);
    rpc.mockRejectedValueOnce(new Error("private provider data"));
    const failed = createRecoveryPresence(handle, options);
    await expect(failed).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery command could not be completed" });
    await expect(failed).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
    expect(JSON.stringify(handle)).toBe("{}");
    const result = await createRecoveryPresence(handle, options);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(randomBytes).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1].reference_hash).toBe(createHash("sha256").update(result.readReference(), "utf8").digest("hex"));
  });
  test.each(["subject", "session"])("rejects an explicit retry after its verified %s changes", async (changed) => {
    const handle = prepareRecoveryPresence(metadata);
    rpc.mockRejectedValueOnce(new Error("uncertain result"));
    await expect(createRecoveryPresence(handle, options)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    getClaims.mockResolvedValue({ data: { claims: {
      ...claims, sub: changed === "subject" ? presenceId : subjectId,
      session_id: changed === "session" ? presenceId : sessionId,
    } }, error: null });
    await expect(createRecoveryPresence(handle, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("rechecks verified identity on a successful receipt replay", async () => {
    const handle = prepareRecoveryPresence(metadata);
    await createRecoveryPresence(handle, options);
    getClaims.mockResolvedValue({ data: null, error: { message: "revoked" } });
    await expect(createRecoveryPresence(handle, options)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).toHaveBeenCalledOnce();
  });
  test.each(["receipt_id", "entity_id"])("rejects a changed %s on a successful receipt replay", async (field) => {
    const handle = prepareRecoveryPresence(metadata);
    await createRecoveryPresence(handle, options);
    rpc.mockResolvedValue({ data: { ...receipt, [field]: subjectId }, error: null });
    await expect(createRecoveryPresence(handle, options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    null, [], {}, { ...receipt, action: "identity.recovery.request" }, { ...receipt, receipt_id: "invalid" },
    { ...receipt, entity_id: "invalid" }, { ...receipt, opaque_reference: "not allowed" }, { ...receipt, auth_session_id: sessionId },
  ])("withholds the reference for an invalid receipt: %j", async (data) => {
    const handle = prepareRecoveryPresence(metadata);
    rpc.mockResolvedValue({ data, error: null });
    await expect(createRecoveryPresence(handle, options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(JSON.stringify(handle)).toBe("{}");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("withholds the reference and raw SQL error on rejection", async () => {
    const handle = prepareRecoveryPresence(metadata);
    rpc.mockResolvedValue({ data: receipt, error: { message: "private SQL detail", code: "23505" } });
    const failed = createRecoveryPresence(handle, options);
    await expect(failed).rejects.toMatchObject({ code: "REJECTED", message: "Recovery command could not be completed" });
    await expect(failed).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });
  test("sanitizes a failed randomness source without creating a request", () => {
    vi.mocked(randomBytes).mockImplementationOnce(() => { throw new Error("private crypto detail"); });
    expect(() => prepareRecoveryPresence(metadata)).toThrow(expect.objectContaining({
      code: "UNAVAILABLE", message: "Recovery command could not be completed",
    }));
    expect(rpc).not.toHaveBeenCalled();
  });
  test("sanitizes a verified-claims service failure without sending a digest", async () => {
    getClaims.mockRejectedValue(new Error("private claims detail"));
    const failed = createRecoveryPresence(prepareRecoveryPresence(metadata), options);
    await expect(failed).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Recovery command could not be completed" });
    await expect(failed).rejects.not.toHaveProperty("cause");
    expect(rpc).not.toHaveBeenCalled();
  });
});
