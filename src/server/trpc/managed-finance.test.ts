import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
const { selected } = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: selected }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = "https://mmhr.example", organizationId = id(1), correlationId = id(2), identityId = id(8);
const metadata = { organizationId, correlationId };
const command = { ...metadata, action: "resolve_eligibility" as const, contractId: id(3), handoffId: id(4),
  idempotencyKey: id(5), reason: "Resolve stored signing evidence" };
const rpc = vi.fn(), getClaims = vi.fn();
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: id(20) }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides }).managedFinance;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); selected.mockReset().mockResolvedValue(organizationId);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: id(20), aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, arguments_) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId,
      authorized_organization_id: arguments_.organization_id, assurance: "aal2" }], error: null };
    if (name === "mmhr_get_managed_finance_page") return { data: { ...metadata, view: arguments_.payload.view, items: [], nextCursor: null }, error: null };
    if (name === "mmhr_get_managed_finance_originals") return { data: { ...metadata, source: arguments_.payload.source, items: [], nextCursor: null }, error: null };
    return { data: { ...metadata, action: command.action, contractId: command.contractId, handoffId: command.handoffId,
      entityId: id(6), revision: 1, outcomeCode: "recorded" }, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());
test("requires scoped finance, workspace, and platform staff authority for a mutation", async () => {
  expect(await caller().execute(command)).toMatchObject({ entityId: id(6), revision: 1 });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, arguments_]) => arguments_.permission_key))
    .toEqual(["finance.manage", "workspace.access", "finance.manage", "admin.access"]);
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null },
  { method: "POST", origin: "https://wrong.example" }])("denies unsafe mutation transport %#", async transport => {
  await expect(caller({ transport }).execute(command)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies anonymous and low assurance requests before managed data access", async () => {
  await expect(caller({ user: null }).execute(command)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  getClaims.mockResolvedValue({ data: { claims: { sub: id(20), aal: "aal1" } }, error: null });
  await expect(caller().execute(command)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalled();
});
test("requires the explicit selected workspace before commands or reads", async () => {
  selected.mockResolvedValue(id(99));
  await expect(caller().execute(command)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(caller().list({ ...metadata, view: "agreements" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("permits scoped GET reads without mutation transport", async () => {
  const reads = caller({ transport: { method: "GET", origin: null } });
  expect(await reads.list({ ...metadata, view: "contracts" })).toMatchObject({ items: [] });
  expect(await reads.originals({ ...metadata, source: { sourceClass: "agreement", vendorOrganizationId: id(9) } })).toMatchObject({ items: [] });
  expect(selected).toHaveBeenCalledTimes(2);
});
test("rejects injected financial authority and unexpected fields", async () => {
  await expect(caller().execute({ ...command, commissionAmountMinorUnits: 100 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(caller().list({ ...metadata, view: "agreements", actorIdentityId: identityId } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([["42501", "NOT_FOUND"], ["22023", "BAD_REQUEST"], ["40001", "CONFLICT"],
  ["XX000", "INTERNAL_SERVER_ERROR"]])("maps %s without exposing private data", async (sqlCode, expectedCode) => {
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, arguments_) => name === "mmhr_authorize" ? original(name, arguments_)
    : { data: null, error: { code: sqlCode, message: "Private agreement original" } });
  await expect(caller().execute(command)).rejects.toMatchObject({ code: expectedCode, message: "Managed finance request failed" });
});
