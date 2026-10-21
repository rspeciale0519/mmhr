import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";
const receiptId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const origin = "https://mmhr.example";
const metadata = { organizationId, membershipId, reason: "Review member access", idempotencyKey };
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc };
function caller(overrides: Partial<Context> = {}) {
  return appRouter.createCaller({ user: { id: subject }, supabase: supabase as never,
    transport: { method: "POST", origin }, ...overrides }).memberships;
}
function response(name: string, input: Record<string, string>) {
  if (name === "mmhr_authorize") return { data: [{ identity_id: identityId,
    authorized_organization_id: input.organization_id, assurance: "aal2" }], error: null };
  return { data: { receipt_id: receiptId, entity_id: membershipId,
    action: name === "mmhr_change_membership_role" ? "membership.role.change" : "membership.status.change" }, error: null };
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal2" } }, error: null });
  rpc.mockReset().mockImplementation(async (name, input) => response(name, input));
});
afterEach(() => vi.unstubAllEnvs());

test("changes role through both permission checks and the fixed command", async () => {
  await expect(caller().changeRole({ ...metadata, roleKey: "contributor" })).resolves.toEqual({
    receiptId, entityId: membershipId, action: "membership.role.change",
  });
  expect(rpc).toHaveBeenCalledWith("mmhr_change_membership_role", {
    organization_id: organizationId, membership_id: membershipId, role_key: "contributor",
    reason: metadata.reason, idempotency_key: idempotencyKey, correlation_id: expect.any(String),
  });
  expect(rpc.mock.calls.filter(([name]) => name === "mmhr_authorize")).toHaveLength(2);
});
test.each(["active", "suspended"] as const)("requires status-change permission for %s", async (status) => {
  await caller().changeStatus({ ...metadata, status });
  expect(rpc).toHaveBeenCalledWith("mmhr_authorize", {
    permission_key: "org.members.status.change", organization_id: organizationId,
  });
  expect(rpc).toHaveBeenCalledWith("mmhr_change_membership_status", expect.objectContaining({ status }));
});
test("revokes only through its separate permission and fixed status", async () => {
  await caller().revoke(metadata);
  expect(rpc).toHaveBeenCalledWith("mmhr_authorize", { permission_key: "org.members.revoke", organization_id: organizationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_change_membership_status", expect.objectContaining({ status: "revoked" }));
});
test.each([
  () => caller().changeStatus({ ...metadata, status: "revoked" } as never),
  () => caller().revoke({ ...metadata, status: "active" } as never),
  () => caller().changeRole({ ...metadata, roleKey: "super_admin" } as never),
  () => caller().changeRole({ ...metadata, roleKey: "viewer", actorIdentityId: subject } as never),
])("rejects forged command fields before authorization %#", async (operation) => {
  await expect(operation()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([undefined, { method: "GET", origin }, { method: "POST", origin: "https://untrusted.example" }])(
  "rejects untrusted mutation transport %#", async (transport) => {
    await expect(caller({ transport }).revoke(metadata)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  },
);
test("denies anonymous callers and AAL1", async () => {
  await expect(caller({ user: null }).revoke(metadata)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  getClaims.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  await expect(caller().revoke(metadata)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc).not.toHaveBeenCalled();
});
test("denies a forged organization authorization response", async () => {
  rpc.mockResolvedValue({ data: [{ identity_id: identityId, authorized_organization_id: subject, assurance: "aal2" }], error: null });
  await expect(caller().revoke(metadata)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("honors permission loss at the command recheck", async () => {
  rpc.mockResolvedValueOnce(response("mmhr_authorize", { organization_id: organizationId }))
    .mockResolvedValueOnce({ data: [], error: null });
  await expect(caller().revoke(metadata)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Membership unavailable" });
  expect(rpc.mock.calls.every(([name]) => name === "mmhr_authorize")).toBe(true);
});
test("hides database rejection details", async () => {
  rpc.mockImplementation(async (name, input) => name === "mmhr_authorize" ? response(name, input)
    : { data: null, error: { message: "private details" } });
  await expect(caller().revoke(metadata)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Membership unavailable" });
});
test("rejects a receipt for another membership", async () => {
  rpc.mockImplementation(async (name, input) => name === "mmhr_authorize" ? response(name, input)
    : { data: { receipt_id: receiptId, entity_id: subject, action: "membership.status.change" }, error: null });
  await expect(caller().revoke(metadata)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Membership request failed" });
});
