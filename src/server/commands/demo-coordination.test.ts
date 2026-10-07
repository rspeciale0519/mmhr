import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getDemoCoordination, getDemoCoordinationHistory, recordDemoCoordination } from "./demo-coordination";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), correlationId = randomUUID(), demoId = randomUUID();
const rpc = vi.fn(), supabase = { rpc } as never;
const plan = { round: 1, audience: "Payroll team", purpose: "Check exports", format: "remote",
  participants: [{ name: "Synthetic participant", role: "Payroll lead", organization: "customer" }], requiredTopics: ["Daily export"] };
const create = { action: "create", organizationId, correlationId, candidateId: randomUUID(), recipientId: randomUUID(), plan, idempotencyKey: randomUUID() };
beforeEach(() => {
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ scope, correlationId: options!.correlationId!, identityId: randomUUID(), assurance: "aal2", supabase }));
  rpc.mockReset().mockResolvedValue({ error: null, data: { organizationId, correlationId, demoId,
    status: "requested", revision: 1, outcomeCode: "recorded" } });
});
test("binds creation to staff authority and sends no client actor", async () => {
  await expect(recordDemoCoordination(create)).resolves.toMatchObject({ demoId });
  expect(requirePermission).toHaveBeenCalledWith("rfp.approve", { kind: "organization", organizationId }, { correlationId });
  const { correlationId: correlation, idempotencyKey, ...payload } = create;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_demo_coordination", { payload, correlation_id: correlation, idempotency_key: idempotencyKey });
  await expect(recordDemoCoordination({ ...create, actorIdentityId: randomUUID() })).rejects.toThrow();
});
test.each(["customer", "vendor"] as const)("uses %s portal authority only for its own availability", async (role) => {
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, demoId, status: "requested", revision: 2, outcomeCode: "recorded" } });
  await recordDemoCoordination({ action: `${role}_availability`, organizationId, correlationId, demoId, expectedRevision: 1,
    availability: { timeZone: "UTC", note: null, windows: [{ startAt: "2030-01-02T12:00:00Z", endAt: "2030-01-02T13:00:00Z" }] }, idempotencyKey: randomUUID() });
  expect(requirePermission).toHaveBeenCalledWith(`portal.${role}.access`, { kind: "organization", organizationId }, { correlationId });
});
test("rejects access errors and forged result associations or states", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "42501" } });
  await expect(recordDemoCoordination(create)).rejects.toBeInstanceOf(AuthorizationError);
  for (const overrides of [{ organizationId: randomUUID() }, { status: "scheduled" }, { revision: 2 }, { correlationId: randomUUID() }]) {
    rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, demoId, status: "requested", revision: 1, outcomeCode: "recorded", ...overrides } });
    await expect(recordDemoCoordination(create)).rejects.toThrow("Invalid demo result");
  }
});
test("rejects staff creation choices in customer and vendor reads", async () => {
  const choices = [{ candidateId: create.candidateId, recipientId: create.recipientId, providerName: "Synthetic vendor",
    productName: "Synthetic product", requestTitle: "Synthetic request" }];
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [], choices, nextCursor: null, nextChoiceCursor: null } });
  for (const view of ["customer", "vendor"] as const) await expect(getDemoCoordination({ organizationId, correlationId, view })).rejects.toThrow("Invalid demo page");
  await expect(getDemoCoordination({ organizationId, correlationId, view: "staff" })).resolves.toMatchObject({ choices });
});
test("rejects invalid pagination and incomplete scheduled records", async () => {
  const row = { demoId, revision: 1, status: "scheduled", customerName: "Synthetic customer", vendorName: "Synthetic vendor",
    coordination: { plan, customerAvailability: null, vendorAvailability: null, schedule: null, outcome: null, reason: null }, updatedAt: "2030-01-01T00:00:00Z" };
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [row], choices: [], nextCursor: null, nextChoiceCursor: null } });
  await expect(getDemoCoordination({ organizationId, correlationId, view: "customer" })).rejects.toThrow("Invalid demo page");
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [], choices: [], nextCursor: demoId, nextChoiceCursor: null } });
  await expect(getDemoCoordination({ organizationId, correlationId, view: "customer" })).rejects.toThrow("Invalid demo cursor");
});
test("rejects duplicate choices and forged choice cursors", async () => {
  const choice = { candidateId: create.candidateId, recipientId: create.recipientId, providerName: "Vendor", productName: "Product", requestTitle: "Request" };
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [], choices: [choice, choice], nextCursor: null, nextChoiceCursor: null } });
  await expect(getDemoCoordination({ organizationId, correlationId, view: "staff" })).rejects.toThrow("Invalid demo choices");
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [], choices: [], nextCursor: null,
    nextChoiceCursor: { candidateId: choice.candidateId, recipientId: choice.recipientId } } });
  await expect(getDemoCoordination({ organizationId, correlationId, view: "staff" })).rejects.toThrow("Invalid demo choice cursor");
});
test("reads scoped history and rejects missing revisions, forged associations, and short-page cursors", async () => {
  const row = { revision: 2, action: "customer_availability", status: "requested", occurredAt: "2030-01-01T00:00:00Z",
    coordination: { plan, customerAvailability: null, vendorAvailability: null, schedule: null, outcome: null, reason: null } };
  const page = { organizationId, correlationId, demoId, items: [row], nextRevision: null };
  const input = { organizationId, correlationId, demoId, view: "customer", afterRevision: 1 };
  rpc.mockResolvedValue({ error: null, data: page });
  await expect(getDemoCoordinationHistory(input)).resolves.toEqual(page);
  expect(requirePermission).toHaveBeenCalledWith("portal.customer.access", { kind: "organization", organizationId }, { correlationId });
  for (const patch of [{ demoId: randomUUID() }, { items: [{ ...row, revision: 3 }] }, { nextRevision: 2 }]) {
    rpc.mockResolvedValue({ error: null, data: { ...page, ...patch } });
    await expect(getDemoCoordinationHistory(input)).rejects.toThrow();
  }
});
