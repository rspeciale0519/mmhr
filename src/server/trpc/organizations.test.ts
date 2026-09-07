import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const receiptId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const origin = "https://mmhr.example";
const metadata = { organizationId, reason: "Review organization lifecycle", idempotencyKey };
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc };
const authorization = { data: [{ identity_id: identityId, authorized_organization_id: null, assurance: "aal2" }], error: null };
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: supabase as never,
    transport: { method: "POST", origin }, ...overrides }).organizations;
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : {
    data: { receipt_id: receiptId, entity_id: organizationId,
      action: name === "mmhr_change_organization_type" ? "organization.type.change" : "organization.status.change" }, error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

test.each(["active", "suspended", "archived"] as const)("routes %s through platform status authority and audited command", async (status) => {
  await expect(caller().changeStatus({ ...metadata, status })).resolves.toEqual({ receiptId, entityId: organizationId, action: "organization.status.change" });
  expect(rpc).toHaveBeenCalledWith("mmhr_authorize", { permission_key: "org.status.change", organization_id: null });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize")).toHaveLength(2);
  expect(rpc).toHaveBeenCalledWith("mmhr_change_organization_status", { organization_id: organizationId, status,
    reason: metadata.reason, idempotency_key: idempotencyKey, correlation_id: expect.any(String) });
});
test.each(["internal", "customer", "vendor"] as const)("routes %s through separate type authority", async (type) => {
  await caller().changeType({ ...metadata, type });
  expect(rpc).toHaveBeenCalledWith("mmhr_authorize", { permission_key: "org.type.change", organization_id: null });
  expect(rpc).toHaveBeenCalledWith("mmhr_change_organization_type", expect.objectContaining({ organization_id: organizationId, type }));
});
test.each([
  () => caller().changeStatus({ ...metadata, status: "pending" } as never),
  () => caller().changeType({ ...metadata, type: "unknown" } as never),
  () => caller().changeStatus({ ...metadata, status: "active", actorIdentityId: subject } as never),
  () => caller().changeType({ ...metadata, type: "vendor", correlationId: subject } as never),
  () => caller().changeStatus({ ...metadata, status: "active", reason: "" }),
])("rejects unsupported or forged fields before authorization %#", async (operation) => {
  await expect(operation()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: "https://untrusted.example" }])("rejects untrusted transport %#", async (transport) => {
  await expect(caller({ transport }).changeType({ ...metadata, type: "customer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies anonymous and AAL1 callers", async () => {
  await expect(caller({ user: null }).changeStatus({ ...metadata, status: "suspended" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  await expect(caller().changeStatus({ ...metadata, status: "suspended" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc).not.toHaveBeenCalled();
});
test("rejects organization authority substituted for platform authority", async () => {
  rpc.mockResolvedValue({ data: [{ ...authorization.data[0], authorized_organization_id: organizationId }], error: null });
  await expect(caller().changeType({ ...metadata, type: "vendor" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("honors permission loss at the command recheck", async () => {
  rpc.mockResolvedValueOnce(authorization).mockResolvedValueOnce({ data: [], error: null });
  await expect(caller().changeStatus({ ...metadata, status: "active" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Organization request denied" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("hides database rejection details", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : { data: null, error: { message: "private details" } });
  await expect(caller().changeType({ ...metadata, type: "vendor" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Organization request denied" });
});
test("rejects a receipt for another organization", async () => {
  rpc.mockImplementation(async (name) => name === "mmhr_authorize" ? authorization : {
    data: { receipt_id: receiptId, entity_id: subject, action: "organization.type.change" }, error: null,
  });
  await expect(caller().changeType({ ...metadata, type: "vendor" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Organization request failed" });
});
