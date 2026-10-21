import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
const { selected } = vi.hoisted(() => ({ selected: vi.fn() }));
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: selected }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = "https://mmhr.example", identityId = id(8), metadata = { organizationId: id(1), correlationId: id(2), commissionEventId: id(3) };
const command = { ...metadata, action: "issue_invoice" as const, invoiceId: id(4), preparationId: id(5),
  expectedEventRevision: 2, expectedInvoiceRevision: 2, expectedPreparationRevision: 2 as const,
  expectedSourceDigest: "a".repeat(64), reason: "Issue independently approved invoice", idempotencyKey: id(6) };
const rpc = vi.fn(), getClaims = vi.fn();
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: id(20) }, supabase: { auth: { getClaims }, rpc } as never,
    transport: { method: "POST", origin }, ...overrides }).managedInvoices;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); selected.mockReset().mockResolvedValue(metadata.organizationId);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: id(20), aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, arguments_) => {
    if (name === "mmhr_authorize") return { data: [{ identity_id: identityId, authorized_organization_id: arguments_.organization_id, assurance: "aal2" }], error: null };
    if (name === "mmhr_get_managed_invoice_owners") return { data: { ...metadata, owners: [], nextCursor: null }, error: null };
    if (name === "mmhr_get_managed_invoice_detail") return { data: { ...metadata, currentActorIdentityId: identityId,
      eventRevision: 1, eventState: "pending_review", calculationId: null, calculationRevision: 0, mandatorySources: [],
      invoice: null, currentPreparation: null, preparations: [], nextPreparationCursor: null }, error: null };
    return { data: { ...metadata, invoiceId: command.invoiceId, preparationId: command.preparationId, action: command.action,
      preparationRevision: 2, invoiceRevision: 3, eventRevision: 3, status: "issued", outcomeCode: "recorded" }, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());
test("requires finance, workspace, and platform staff authority before a mutation", async () => {
  expect(await caller().execute(command)).toMatchObject({ invoiceRevision: 3, status: "issued" });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize").map(([, arguments_]) => arguments_.permission_key))
    .toEqual(["finance.manage", "workspace.access", "finance.manage", "admin.access"]);
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: null },
  { method: "POST", origin: "https://wrong.example" }])("denies unsafe mutation transport %#", async transport => {
  await expect(caller({ transport }).execute(command)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(rpc).not.toHaveBeenCalled();
});
test("denies anonymous and low assurance before invoice data access", async () => {
  await expect(caller({ user: null }).execute(command)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  getClaims.mockResolvedValue({ data: { claims: { sub: id(20), aal: "aal1" } }, error: null });
  await expect(caller().execute(command)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(rpc).not.toHaveBeenCalled();
});
test("denies all invoice operations outside the selected workspace", async () => {
  selected.mockResolvedValue(id(99));
  await expect(caller().execute(command)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(caller().detail(metadata)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(caller().owners(metadata)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("permits selected GET reads with exact trusted actor output", async () => {
  const reads = caller({ transport: { method: "GET", origin: null } });
  expect(await reads.owners(metadata)).toMatchObject({ owners: [] });
  expect(await reads.detail(metadata)).toMatchObject({ currentActorIdentityId: identityId, invoice: null });
});
test("rejects injected money or actor fields before authorization", async () => {
  await expect(caller().execute({ ...command, amountMinorUnits: 0 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(caller().detail({ ...metadata, actorIdentityId: identityId } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([["42501", "NOT_FOUND"], ["22023", "BAD_REQUEST"], ["40001", "CONFLICT"], ["XX000", "INTERNAL_SERVER_ERROR"]])(
  "maps %s without disclosing provider details", async (sqlCode, expectedCode) => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name, arguments_) => name === "mmhr_authorize" ? original(name, arguments_)
      : { data: null, error: { code: sqlCode, message: "Private invoice source" } });
    await expect(caller().execute(command)).rejects.toMatchObject({ code: expectedCode, message: "Managed invoice request failed" });
  });
