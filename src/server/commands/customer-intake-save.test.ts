import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import { customerIntakeSaveSchema, saveCustomerIntake } from "./customer-intake-save";

vi.mock("@/server/auth/authorization", () => ({
  AuthorizationError: class extends Error {}, requirePermission: vi.fn(),
}));
const organizationId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const intakeId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const input = { intakeId: null, organizationId, expectedRevision: 0, status: "draft", data: { currentSystems: ["Legacy"] }, correlationId, idempotencyKey };
const result = { intakeId, organizationId, revision: 1, status: "draft", outcomeCode: "created", correlationId };
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context: AuthorizationContext = { supabase, identityId, scope: { kind: "organization", organizationId }, assurance: "aal1", correlationId };

beforeEach(() => {
  vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
});

test("saves at AAL1 only after action and customer portal authorization", async () => {
  await expect(saveCustomerIntake(input, { supabase })).resolves.toEqual(result);
  expect(requirePermission).toHaveBeenNthCalledWith(1, "intake.draft.save", context.scope, { supabase, correlationId });
  expect(requirePermission).toHaveBeenNthCalledWith(2, "portal.customer.access", context.scope, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_save_customer_intake", {
    payload: { intakeId: null, organizationId, expectedRevision: 0, status: "draft", data: input.data },
    correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
});

test.each([
  { actorIdentityId: identityId }, { role: "contributor" }, { permission: "workspace.access" },
  { status: "submitted" }, { status: "completed" }, { organizationId: "bad" },
  { intakeId: "bad" }, { expectedRevision: 1 }, { intakeId, expectedRevision: 0 },
  { intakeId, expectedRevision: 2_147_483_647 }, { expectedRevision: -1 },
  { expectedRevision: 0.5 }, { expectedRevision: Infinity }, { correlationId: "bad" },
  { idempotencyKey: "bad" }, { data: { currentSystems: [""] } },
  { data: { companyContext: { nested: {} } } }, { data: { customizations: [] } },
  { data: { stakeholders: Array.from({ length: 101 }, () => "Role") } },
  { data: { budget: { amount: Infinity } } },
])("rejects invalid, privileged, or oversized input before authorization %#", async (patch) => {
  await expect(saveCustomerIntake({ ...input, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("retains omission and explicit empty values in a bounded patch", async () => {
  const data = { companyContext: { employees: 0, international: false, notes: "" }, currentSystems: [] };
  await saveCustomerIntake({ ...input, data });
  expect(rpc.mock.calls[0]?.[1].payload.data).toEqual(data);
  expect(rpc.mock.calls[0]?.[1].payload.data).not.toHaveProperty("budget");
  expect(customerIntakeSaveSchema.safeParse({ ...input, data: {} }).success).toBe(true);
});

test.each([1, 2])("stops when permission check %i denies", async (call) => {
  if (call === 2) vi.mocked(requirePermission).mockResolvedValueOnce(context);
  vi.mocked(requirePermission).mockRejectedValueOnce(new AuthorizationError());
  await expect(saveCustomerIntake(input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { scope: { kind: "platform" as const } },
  { scope: { kind: "organization" as const, organizationId: identityId } },
])("rejects a mismatched action scope %#", async (patch) => {
  vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, ...patch });
  await expect(saveCustomerIntake(input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { identityId: intakeId }, { scope: { kind: "platform" as const } },
  { scope: { kind: "organization" as const, organizationId: identityId } },
])("rejects an inconsistent portal authorization %#", async (patch) => {
  vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, ...patch });
  await expect(saveCustomerIntake(input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test("checks exact update identity, revision and status", async () => {
  const updated = { ...result, revision: 2, status: "in_progress", outcomeCode: "updated" };
  rpc.mockResolvedValue({ data: updated, error: null });
  await expect(saveCustomerIntake({ ...input, intakeId, expectedRevision: 1, status: "in_progress" })).resolves.toEqual(updated);
});

test("accepts a retry that now reports a later locked state without claiming a new save", async () => {
  rpc.mockResolvedValue({ data: { ...result, revision: 3, status: "submitted", outcomeCode: "replayed" }, error: null });
  await expect(saveCustomerIntake(input)).resolves.toMatchObject({ outcomeCode: "replayed", status: "submitted" });
});

test.each([
  { organizationId: identityId }, { correlationId: identityId }, { intakeId: "bad" },
  { revision: 0 }, { revision: 2 }, { revision: 0.5 }, { revision: 2_147_483_648 },
  { status: "in_progress" }, { status: "submitted" }, { outcomeCode: "updated" },
  { outcomeCode: "ignored" }, { privateAnswers: {} },
])("rejects invalid new-save results %#", async (patch) => {
  rpc.mockResolvedValue({ data: { ...result, ...patch }, error: null });
  await expect(saveCustomerIntake(input)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  { intakeId: identityId }, { revision: 1 }, { status: "draft" }, { outcomeCode: "created" },
  { revision: 1, outcomeCode: "replayed" },
])("rejects inconsistent update or replay results %#", async (patch) => {
  rpc.mockResolvedValue({ data: { ...result, revision: 2, status: "in_progress", outcomeCode: "updated", ...patch }, error: null });
  await expect(saveCustomerIntake({ ...input, intakeId, expectedRevision: 1, status: "in_progress" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([undefined, null, [], {}, { data: result }, { data: result, error: { message: "private detail" } }])(
  "does not treat malformed transport responses as success %#", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(saveCustomerIntake(input)).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Intake could not be saved" });
  },
);

test("redacts SQL rejection and thrown transport errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private detail" } });
  await expect(saveCustomerIntake(input)).rejects.toMatchObject({ code: "REJECTED", message: "Intake could not be saved" });
  rpc.mockRejectedValue(new Error("private transport detail"));
  await expect(saveCustomerIntake(input)).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Intake could not be saved" });
});
