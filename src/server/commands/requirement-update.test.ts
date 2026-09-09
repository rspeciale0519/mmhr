import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";

import { requirementUpdateSchema, updateIntakeRequirement } from "./requirement-update";

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

const valid = {
  ...ids,
  expectedRevision: 1,
  stableKey: "payroll",
  label: "Payroll",
  importance: "must" as const,
  weight: 2,
  ownerIdentityId: null,
  response: { value: "mid" },
  requirementType: "structured" as const,
  evidenceReferences: ["https://example.com/evidence"],
  vendorResponseLinks: ["https://vendor.example.com/response"],
};

const rpc = vi.fn();
const context = {
  supabase: { rpc } as unknown as RequestSupabaseClient,
  identityId: ids.actorIdentityId,
  scope: { kind: "organization", organizationId: ids.organizationId },
  assurance: "aal2",
  correlationId: ids.correlationId,
} as const satisfies AuthorizationContext;

const result = (overrides: Record<string, unknown> = {}) => ({
  requirementId: ids.requirementId,
  organizationId: ids.organizationId,
  intakeId: ids.intakeId,
  revision: 2,
  correlationId: ids.correlationId,
  outcomeCode: "updated",
  ...overrides,
});

const invoke = (input: unknown = valid) => updateIntakeRequirement(input);

describe("requirement metadata update command", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test("accepts both requirement types and the maximum weight", () => {
    expect(requirementUpdateSchema.safeParse({ ...valid, requirementType: "structured", weight: 100 }).success).toBe(true);
    expect(requirementUpdateSchema.safeParse({ ...valid, requirementType: "custom", weight: 100 }).success).toBe(true);
    expect(requirementUpdateSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(requirementUpdateSchema.parse({ ...valid, stableKey: " PAYROLL " }).stableKey).toBe("payroll");
  });

  test.each([0, 2_147_483_647, 2_147_483_647 + 1, 1.5])("rejects update revision %s before permission lookup", async (expectedRevision) => {
    await expect(invoke({ ...valid, expectedRevision })).rejects.toThrow("Invalid requirement metadata input");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("requires active caller binding and exact organization scope", async () => {
    await expect(invoke({ ...valid, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();

    vi.mocked(requirePermission).mockResolvedValueOnce({
      ...context,
      scope: { kind: "organization", organizationId: ids.intakeId },
    } as never);
    await expect(invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();

    vi.mocked(requirePermission).mockResolvedValueOnce({
      ...context,
      scope: { kind: "platform" },
    } as never);
    await expect(invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("passes only the exact scoped write and maps an update result", async () => {
    rpc.mockResolvedValue({ data: result(), error: null });
    await expect(invoke()).resolves.toEqual(result());
    expect(requirePermission).toHaveBeenCalledWith("workspace.access", {
      kind: "organization",
      organizationId: ids.organizationId,
    }, {});
    expect(rpc).toHaveBeenCalledWith("mmhr_update_intake_requirement", {
      payload: valid,
      correlation_id: ids.correlationId,
      idempotency_key: ids.idempotencyKey,
    });
  });

  test.each([
    { ...result(), requirementId: ids.intakeId },
    { ...result(), organizationId: ids.intakeId },
    { ...result(), intakeId: ids.organizationId },
    { ...result(), correlationId: ids.idempotencyKey },
    { ...result(), revision: 1 },
    { ...result(), outcomeCode: "created" },
    { ...result(), extra: "forbidden" },
  ])("rejects an unsafe update result %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(invoke()).rejects.toThrow("Invalid requirement update response");
  });

  test("accepts a replay at a later revision but rejects a no-op revision", async () => {
    rpc.mockResolvedValue({ data: result({ outcomeCode: "replayed", revision: 4 }), error: null });
    await expect(invoke()).resolves.toMatchObject({ outcomeCode: "replayed", revision: 4 });

    rpc.mockResolvedValue({ data: result({ outcomeCode: "replayed", revision: 1 }), error: null });
    await expect(invoke()).rejects.toThrow("Invalid requirement update response");

    rpc.mockResolvedValue({ data: result({ outcomeCode: "updated", revision: 1 }), error: null });
    await expect(invoke()).rejects.toThrow("Invalid requirement update response");
  });

  test.each([
    undefined,
    () => "not JSON",
    BigInt(1),
    new Date("2026-09-01T00:00:00.000Z"),
  ])("rejects non-JSON response values before RPC %#", async (response) => {
    await expect(invoke({ ...valid, response })).rejects.toThrow("Invalid requirement metadata input");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects cyclic response data before RPC", async () => {
    const response: Record<string, unknown> = {};
    response.self = response;
    await expect(invoke({ ...valid, response })).rejects.toThrow();
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("enforces response depth, collections, strings, keys, and UTF8 size", () => {
    const depthFive = { one: { two: { three: { four: { five: "ok" } } } } };
    const depthSix = { one: { two: { three: { four: { five: { six: "no" } } } } } };
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = "value";
    const fifty = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`key${index}`, true]));
    const fiftyOne = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`key${index}`, true]));
    const key100 = { ["k".repeat(100)]: true };
    const key101 = { ["k".repeat(101)]: true };
    const utf8Within = { left: "é".repeat(1_900), right: "é".repeat(1_900) };
    const utf8Over = { left: "é".repeat(2_000), right: "é".repeat(2_000) };

    for (const response of [depthFive, fifty, key100, utf8Within, Array(50).fill("value"), "x".repeat(2_000)]) {
      expect(requirementUpdateSchema.safeParse({ ...valid, response }).success).toBe(true);
    }
    for (const response of [depthSix, fiftyOne, key101, utf8Over, Array(51).fill("value"), sparse, "x".repeat(2_001)]) {
      expect(requirementUpdateSchema.safeParse({ ...valid, response }).success).toBe(false);
    }
  });

  test("snapshots nested response data before authorization awaits", async () => {
    const input = { ...valid, response: { nested: { value: "before" } } };
    vi.mocked(requirePermission).mockImplementationOnce(async () => {
      (input.response as { nested: { value: string } }).nested.value = "after";
      return context;
    });
    rpc.mockResolvedValue({ data: result(), error: null });

    await expect(updateIntakeRequirement(input)).resolves.toEqual(result());
    expect(rpc.mock.calls[0]?.[1].payload.response).toEqual({ nested: { value: "before" } });
  });

  test("preserves the established unavailable and invalid response errors", async () => {
    rpc.mockRejectedValueOnce(new Error("private transport details"));
    await expect(invoke()).rejects.toThrow("Requirement update unavailable");
    await expect(invoke()).rejects.not.toThrow("private transport details");

    rpc.mockResolvedValueOnce({ data: undefined, error: null });
    await expect(invoke()).rejects.toThrow("Invalid requirement update response");
  });
});
