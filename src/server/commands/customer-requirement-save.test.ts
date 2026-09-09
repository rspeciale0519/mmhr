import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";

import {
  CustomerRequirementSaveError,
  customerRequirementSaveSchema,
  saveCustomerIntakeRequirement,
} from "./customer-requirement-save";

vi.mock("@/server/auth/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization");
  return { ...actual, requirePermission: vi.fn() };
});

const ids = {
  requirementId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  intakeId: "33333333-3333-4333-8333-333333333333",
  actorIdentityId: "44444444-4444-4444-8444-444444444444",
  correlationId: "55555555-5555-4555-8555-555555555555",
  idempotencyKey: "66666666-6666-4666-8666-666666666666",
};

const base = {
  requirementId: ids.requirementId,
  organizationId: ids.organizationId,
  intakeId: ids.intakeId,
  correlationId: ids.correlationId,
  idempotencyKey: ids.idempotencyKey,
  expectedRevision: 0,
  stableKey: "payroll",
  label: "Payroll",
  importance: "must" as const,
  weight: 100,
  response: { answer: "yes" },
  requirementType: "structured" as const,
};
const rpc = vi.fn();
const context = {
  supabase: { rpc } as unknown as RequestSupabaseClient,
  identityId: ids.actorIdentityId,
  scope: { kind: "organization", organizationId: ids.organizationId },
  assurance: "aal1",
  correlationId: ids.correlationId,
} as const satisfies AuthorizationContext;
const result = (overrides: Record<string, unknown> = {}) => ({
  requirementId: ids.requirementId,
  organizationId: ids.organizationId,
  intakeId: ids.intakeId,
  revision: 1,
  correlationId: ids.correlationId,
  outcomeCode: "created",
  ...overrides,
});

const invoke = (input: unknown = base) => saveCustomerIntakeRequirement(input);

describe("customer requirement save command", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset()
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce(context);
  });

  test("accepts the customer-owned fields and rejects authority fields", () => {
    expect(customerRequirementSaveSchema.safeParse(base).success).toBe(true);
    expect(customerRequirementSaveSchema.safeParse({ ...base, label: undefined }).success).toBe(false);
    expect(customerRequirementSaveSchema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(customerRequirementSaveSchema.safeParse({ ...base, ownerIdentityId: ids.actorIdentityId }).success).toBe(false);
    expect(customerRequirementSaveSchema.safeParse({ ...base, actorIdentityId: ids.actorIdentityId }).success).toBe(false);
    expect(customerRequirementSaveSchema.safeParse({ ...base, evidenceReferences: [] }).success).toBe(false);
  });

  test.each([
    [0, true], [2_147_483_646, true], [-1, false], [2_147_483_647, false], [1.5, false],
  ])("enforces the expected revision boundary: %s", (expectedRevision, valid) => {
    expect(customerRequirementSaveSchema.safeParse({ ...base, expectedRevision }).success).toBe(valid);
  });

  test("requires the action and customer portal for a new save", async () => {
    rpc.mockResolvedValue({ data: result(), error: null });
    await expect(invoke()).resolves.toEqual(result());
    expect(requirePermission).toHaveBeenNthCalledWith(1, "intake.requirement.save", {
      kind: "organization", organizationId: ids.organizationId,
    }, { correlationId: ids.correlationId });
    expect(requirePermission).toHaveBeenNthCalledWith(2, "portal.customer.access", {
      kind: "organization", organizationId: ids.organizationId,
    }, { supabase: context.supabase, correlationId: ids.correlationId });
    expect(rpc).toHaveBeenCalledWith("mmhr_save_customer_intake_requirement", {
      payload: {
        requirementId: ids.requirementId, organizationId: ids.organizationId, intakeId: ids.intakeId,
        expectedRevision: 0, stableKey: "payroll", label: "Payroll", importance: "must", weight: 100,
        response: { answer: "yes" }, requirementType: "structured",
      },
      correlation_id: ids.correlationId,
      idempotency_key: ids.idempotencyKey,
    });
  });

  test("omits transport metadata from the payload", async () => {
    rpc.mockResolvedValue({ data: result(), error: null });
    await invoke();
    const payload = rpc.mock.calls[0]?.[1]?.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("correlationId");
    expect(payload).not.toHaveProperty("idempotencyKey");
  });

  test("accepts a positive revision update and a later replay", async () => {
    const update = { ...base, expectedRevision: 3 };
    rpc.mockResolvedValueOnce({ data: result({ revision: 4, outcomeCode: "updated" }), error: null });
    await expect(invoke(update)).resolves.toMatchObject({ revision: 4, outcomeCode: "updated" });

    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockResolvedValueOnce({ data: result({ revision: 6, outcomeCode: "replayed" }), error: null });
    await expect(invoke(update)).resolves.toMatchObject({ revision: 6, outcomeCode: "replayed" });
  });

  test("binds portal identity and scope before the writer", async () => {
    vi.mocked(requirePermission).mockReset().mockResolvedValueOnce(context).mockResolvedValueOnce({
      ...context, identityId: ids.intakeId,
    });
    await expect(invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...context, scope: { kind: "organization" as const, organizationId: ids.intakeId } }, 0],
    [{ ...context, scope: { kind: "platform" as const } }, 0],
    [{ ...context, identityId: ids.intakeId }, 1],
    [{ ...context, scope: { kind: "organization" as const, organizationId: ids.intakeId } }, 1],
  ])("rejects an action or portal result with the wrong identity or scope", async (deniedContext, callIndex) => {
    vi.mocked(requirePermission).mockReset()
      .mockResolvedValueOnce(callIndex === 0 ? deniedContext : context)
      .mockResolvedValueOnce(callIndex === 1 ? deniedContext : context);
    await expect(invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("reuses the supplied request client for both checks and the write", async () => {
    const suppliedSupabase = { rpc } as unknown as RequestSupabaseClient;
    const suppliedContext = { ...context, supabase: suppliedSupabase };
    vi.mocked(requirePermission).mockReset()
      .mockResolvedValueOnce(suppliedContext)
      .mockResolvedValueOnce(suppliedContext);
    rpc.mockResolvedValue({ data: result(), error: null });

    await expect(saveCustomerIntakeRequirement(base, { supabase: suppliedSupabase })).resolves.toEqual(result());
    expect(vi.mocked(requirePermission).mock.calls[0]?.[2]).toEqual({
      supabase: suppliedSupabase, correlationId: ids.correlationId,
    });
    expect(vi.mocked(requirePermission).mock.calls[1]?.[2]).toEqual({
      supabase: suppliedSupabase, correlationId: ids.correlationId,
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([
    null,
    { data: result(), error: undefined },
    { data: undefined, error: null },
  ])("rejects a malformed provider envelope", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(invoke()).rejects.toMatchObject({ code: response && "data" in response && response.error === null ? "INVALID_RESPONSE" : "UNAVAILABLE" });
  });

  test("redacts a thrown provider error", async () => {
    rpc.mockRejectedValue(new Error("private connection details"));
    await expect(invoke()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(invoke()).rejects.not.toThrow("private connection details");
  });

  test.each([
    { requirementId: ids.intakeId },
    { organizationId: ids.intakeId },
    { intakeId: ids.organizationId },
    { correlationId: ids.idempotencyKey },
    { outcomeCode: "updated", revision: 1 },
    { revision: 0 },
    { revision: 2 },
    { outcomeCode: "replayed", revision: 0 },
  ])("rejects a wrong create result envelope %#", async (override) => {
    rpc.mockResolvedValue({ data: result(override), error: null });
    await expect(invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test.each([
    { outcomeCode: "created", revision: 4 },
    { outcomeCode: "updated", revision: 3 },
    { outcomeCode: "replayed", revision: 3 },
  ])("rejects an invalid update result revision or outcome %#", async (override) => {
    const update = { ...base, expectedRevision: 3 };
    rpc.mockResolvedValue({ data: result({ ...override }), error: null });
    await expect(invoke(update)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("redacts rejection and malformed results", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "private" } });
    await expect(invoke()).rejects.toMatchObject({ code: "REJECTED" });
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockResolvedValueOnce({ data: { ...result(), organizationId: ids.intakeId }, error: null });
    await expect(invoke()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(new CustomerRequirementSaveError("UNAVAILABLE").message).toBe("Requirement could not be saved");
  });
});
