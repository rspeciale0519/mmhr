import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";

import {
  CustomerIntakeSubmitError,
  customerIntakeSubmitSchema,
  submitCustomerIntake,
} from "./customer-intake-submit";

vi.mock("@/server/auth/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization");
  return { ...actual, requirePermission: vi.fn() };
});

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  intakeId: "22222222-2222-4222-8222-222222222222",
  identityId: "33333333-3333-4333-8333-333333333333",
  correlationId: "44444444-4444-4444-8444-444444444444",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};

const input = {
  organizationId: ids.organizationId,
  intakeId: ids.intakeId,
  expectedRevision: 3,
  correlationId: ids.correlationId,
  idempotencyKey: ids.idempotencyKey,
};

const rpc = vi.fn();
const context = {
  supabase: { rpc } as unknown as RequestSupabaseClient,
  identityId: ids.identityId,
  scope: { kind: "organization" as const, organizationId: ids.organizationId },
  assurance: "aal1" as const,
  correlationId: ids.correlationId,
} satisfies AuthorizationContext;

const result = (overrides: Record<string, unknown> = {}) => ({
  intakeId: ids.intakeId,
  organizationId: ids.organizationId,
  status: "submitted",
  revision: 4,
  outcomeCode: "updated",
  correlationId: ids.correlationId,
  ...overrides,
});

const invoke = (value: unknown = input) => submitCustomerIntake(value);

describe("customer intake submit command", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValueOnce(context).mockResolvedValueOnce(context);
    rpc.mockResolvedValue({ data: result(), error: null });
  });

  test("accepts only the scoped submit shape and rejects caller authority fields", () => {
    expect(customerIntakeSubmitSchema.safeParse(input).success).toBe(true);
    expect(customerIntakeSubmitSchema.safeParse({ ...input, data: {} }).success).toBe(false);
    expect(customerIntakeSubmitSchema.safeParse({ ...input, status: "submitted" }).success).toBe(false);
    expect(customerIntakeSubmitSchema.safeParse({ ...input, actorIdentityId: ids.identityId }).success).toBe(false);
    expect(customerIntakeSubmitSchema.safeParse({ ...input, ownerIdentityId: ids.identityId }).success).toBe(false);
  });

  test.each([
    { expectedRevision: 0 },
    { expectedRevision: 2_147_483_647 },
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { expectedRevision: Infinity },
    { organizationId: "bad" },
    { intakeId: "bad" },
    { correlationId: "bad" },
    { idempotencyKey: "bad" },
  ])("rejects invalid input before authorization %#", async (patch) => {
    await expect(invoke({ ...input, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("requires submit authority and same-identity customer portal access", async () => {
    await expect(invoke()).resolves.toEqual(result());
    expect(requirePermission).toHaveBeenNthCalledWith(1, "intake.submit", {
      kind: "organization", organizationId: ids.organizationId,
    }, { correlationId: ids.correlationId });
    expect(requirePermission).toHaveBeenNthCalledWith(2, "portal.customer.access", {
      kind: "organization", organizationId: ids.organizationId,
    }, { supabase: context.supabase, correlationId: ids.correlationId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_submit_customer_intake", {
      payload: {
        organizationId: ids.organizationId,
        intakeId: ids.intakeId,
        expectedRevision: 3,
      },
      correlation_id: ids.correlationId,
      idempotency_key: ids.idempotencyKey,
    });
  });

  test("reuses the supplied request client for both checks and the write", async () => {
    const supplied = { rpc } as unknown as RequestSupabaseClient;
    const suppliedContext = { ...context, supabase: supplied };
    vi.mocked(requirePermission).mockReset().mockResolvedValueOnce(suppliedContext).mockResolvedValueOnce(suppliedContext);
    await expect(submitCustomerIntake(input, { supabase: supplied })).resolves.toEqual(result());
    expect(vi.mocked(requirePermission).mock.calls[0]?.[2]).toEqual({ supabase: supplied, correlationId: ids.correlationId });
    expect(vi.mocked(requirePermission).mock.calls[1]?.[2]).toEqual({ supabase: supplied, correlationId: ids.correlationId });
  });

  test.each([
    [{ ...context, scope: { kind: "platform" as const } }, 0],
    [{ ...context, scope: { kind: "organization" as const, organizationId: ids.intakeId } }, 0],
    [{ ...context, identityId: ids.intakeId }, 1],
    [{ ...context, scope: { kind: "platform" as const } }, 1],
  ])("rejects wrong action or portal scope and identity %#", async (denied, callIndex) => {
    vi.mocked(requirePermission).mockReset()
      .mockResolvedValueOnce(callIndex === 0 ? denied : context)
      .mockResolvedValueOnce(callIndex === 1 ? denied : context);
    await expect(invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    { outcomeCode: "created" },
    { status: "in_progress" },
    { revision: 3 },
    { revision: 5 },
    { outcomeCode: "updated", status: "submitted", revision: 5 },
  ])("rejects an invalid fresh submit result %#", async (patch) => {
    rpc.mockResolvedValue({ data: result(patch), error: null });
    await expect(invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("accepts a later replay with its current status", async () => {
    rpc.mockResolvedValue({ data: result({ outcomeCode: "replayed", status: "under_review", revision: 6 }), error: null });
    await expect(invoke()).resolves.toMatchObject({ outcomeCode: "replayed", status: "under_review", revision: 6 });
  });

  test.each([
    { intakeId: ids.organizationId },
    { organizationId: ids.intakeId },
    { correlationId: ids.idempotencyKey },
    { outcomeCode: "replayed", revision: 3 },
    { outcomeCode: "replayed", revision: 2 },
  ])("rejects an invalid replay envelope %#", async (patch) => {
    rpc.mockResolvedValue({ data: result(patch), error: null });
    await expect(invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    [{ data: undefined, error: null }, "INVALID_RESPONSE"],
    [{ data: result(), error: undefined }, "UNAVAILABLE"],
    [null, "UNAVAILABLE"],
  ] as const)("rejects malformed provider envelopes %#", async (response, code) => {
    rpc.mockResolvedValue(response);
    await expect(invoke()).rejects.toMatchObject({ code });
  });

  test("maps SQL permission errors to rejection and hides provider details", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private detail" } });
    await expect(invoke()).rejects.toMatchObject({ code: "REJECTED", message: "Intake could not be submitted" });
    rpc.mockRejectedValue(new Error("database secret detail"));
    await expect(invoke()).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Intake could not be submitted" });
    await expect(invoke()).rejects.not.toThrow("database secret detail");
  });

  test("does not leak invalid response details", async () => {
    rpc.mockResolvedValue({ data: { ...result(), revision: 0 }, error: null });
    await expect(invoke()).rejects.toEqual(expect.objectContaining({
      code: "INVALID_RESPONSE",
      message: "Intake could not be submitted",
    }));
    expect(new CustomerIntakeSubmitError("UNAVAILABLE").message).toBe("Intake could not be submitted");
  });
});
