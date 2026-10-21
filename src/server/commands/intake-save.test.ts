import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";

import { intakeSaveSchema, saveIntake } from "./intake-save";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() {
      super("Request is not authorized");
      this.name = "AuthorizationError";
    }
  }

  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const ids = {
  intakeId: null,
  organizationId: "11111111-1111-4111-8111-111111111111",
  actorIdentityId: "22222222-2222-4222-8222-222222222222",
  expectedRevision: 0,
  status: "draft" as const,
  data: { companyContext: { sector: "services" } },
  correlationId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
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
  intakeId: "55555555-5555-4555-8555-555555555555",
  organizationId: ids.organizationId,
  status: "draft",
  revision: 1,
  outcomeCode: "created",
  correlationId: ids.correlationId,
  ...overrides,
});

describe("intake save command", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockImplementation(async (permission) => permission === "admin.access"
      ? { ...context, scope: { kind: "platform" } } : context);
  });

  test("accepts only the canonical bounded intake patch shape", () => {
    const parsed = intakeSaveSchema.parse(ids);
    expect(parsed.data).toEqual(ids.data);
    expect(parsed.data).not.toHaveProperty("budget");
    expect(intakeSaveSchema.safeParse({ ...ids, extra: true }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, data: { currentSystems: [" "] } }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, data: { companyContext: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`field${index}`, true])) } }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, data: { companyContext: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`field${index}`, "x".repeat(2_000)])) } }).success).toBe(false);
  });

  test("requires revision zero for new drafts and a positive revision for updates", () => {
    expect(intakeSaveSchema.safeParse({ ...ids, expectedRevision: 1 }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, status: "submitted" }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, intakeId: ids.organizationId, expectedRevision: 0 }).success).toBe(false);
    expect(intakeSaveSchema.safeParse({ ...ids, intakeId: ids.organizationId, expectedRevision: 1 }).success).toBe(true);
  });

  test("rejects actor mismatch before RPC", async () => {
    await expect(saveIntake({ ...ids, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("requires internal administration as well as the scoped workspace", async () => {
    rpc.mockResolvedValue({ data: result(), error: null });
    await saveIntake(ids);
    expect(requirePermission).toHaveBeenNthCalledWith(1, "workspace.access", context.scope, {});
    expect(requirePermission).toHaveBeenNthCalledWith(2, "admin.access", { kind: "platform" }, { supabase: context.supabase });
  });

  test("rejects a viewer with workspace access before calling the legacy writer", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce(context).mockRejectedValueOnce(new AuthorizationError());
    await expect(saveIntake(ids)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    { ...context, scope: { kind: "organization" as const, organizationId: ids.organizationId } },
    { ...context, scope: { kind: "platform" as const }, identityId: ids.correlationId },
  ])("rejects mismatched administration context %#", async (administration) => {
    vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce(administration);
    await expect(saveIntake(ids)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("preserves omitted patch fields and validates a created result", async () => {
    rpc.mockResolvedValue({ data: result(), error: null });
    await expect(saveIntake(ids)).resolves.toMatchObject({ outcomeCode: "created", revision: 1 });
    expect(rpc).toHaveBeenCalledWith("mmhr_save_intake", expect.objectContaining({ payload: expect.objectContaining({ data: ids.data }) }));
    expect(rpc.mock.calls[0]?.[1].payload.data).not.toHaveProperty("budget");
  });

  test("requires the existing intake ID and expected revision for updates", async () => {
    const update = { ...ids, intakeId: "55555555-5555-4555-8555-555555555555", expectedRevision: 1, status: "in_progress" as const };
    rpc.mockResolvedValue({ data: result({ intakeId: update.intakeId, status: "in_progress", revision: 2, outcomeCode: "updated" }), error: null });
    await expect(saveIntake(update)).resolves.toMatchObject({ intakeId: update.intakeId, revision: 2, outcomeCode: "updated" });

    rpc.mockResolvedValue({ data: result({ intakeId: update.intakeId, revision: 1, outcomeCode: "updated" }), error: null });
    await expect(saveIntake(update)).rejects.toThrow("Invalid intake response");
  });

  test("rejects missing or malformed responses without leaking provider errors", async () => {
    rpc.mockResolvedValue({ data: undefined, error: null });
    await expect(saveIntake(ids)).rejects.toThrow("Invalid intake response");

    rpc.mockRejectedValue(new Error("database secret detail"));
    await expect(saveIntake(ids)).rejects.toThrow("Intake unavailable");
    await expect(saveIntake(ids)).rejects.not.toThrow("database secret detail");
  });

  test("accepts a creation retry after a later revision without pretending it created another intake", async () => {
    rpc.mockResolvedValue({ data: result({ revision: 3, status: "submitted", outcomeCode: "replayed" }), error: null });
    await expect(saveIntake(ids)).resolves.toMatchObject({ revision: 3, status: "submitted", outcomeCode: "replayed" });
  });

  test.each(["in_progress", "submitted", "completed"])("rejects a newly created result with the wrong status %s", async (status) => {
    rpc.mockResolvedValue({ data: result({ status }), error: null });
    await expect(saveIntake(ids)).rejects.toThrow("Invalid intake response");
  });

  test("rejects an update response that did not store the requested status", async () => {
    const update = { ...ids, intakeId: result().intakeId, expectedRevision: 1, status: "in_progress" };
    rpc.mockResolvedValue({ data: result({ revision: 2, outcomeCode: "updated" }), error: null });
    await expect(saveIntake(update)).rejects.toThrow("Invalid intake response");
  });

  test.each([2_147_483_647, Number.MAX_SAFE_INTEGER, Infinity, 0.5])("rejects revision %s before authorization", async (expectedRevision) => {
    await expect(saveIntake({ ...ids, intakeId: result().intakeId, expectedRevision })).rejects.toThrow("Invalid intake input");
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test.each([
    { companyContext: { nested: { text: "not a scalar" } } },
    { budget: { amount: Infinity } },
    { currentSystems: Array.from({ length: 51 }, () => "System") },
    { stakeholders: Array.from({ length: 101 }, () => "Role") },
    { companyContext: null },
    { companyContext: { ["x".repeat(101)]: true } },
    { companyContext: { note: "x".repeat(2001) } },
    { companyContext: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, "界".repeat(1000)])) },
    { unknown: [] },
  ])("rejects invalid or oversized data before authorization %#", async (data) => {
    await expect(saveIntake({ ...ids, data })).rejects.toThrow("Invalid intake input");
    expect(requirePermission).not.toHaveBeenCalled();
  });
});
