import { beforeEach, expect, test, vi } from "vitest";
import { synchronizeCallerIdentity } from "./identity-synchronization";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";
const getClaims = vi.fn(); const getUser = vi.fn(); const rpc = vi.fn();
const options = { correlationId, supabase: { auth: { getClaims, getUser }, rpc } as never };
const user = { id: subject, email: "confirmed@example.invalid", email_confirmed_at: "2026-09-05T12:00:00Z", is_anonymous: false };
const result = { identityId, status: "pending", outcome: "created", correlationId };
beforeEach(() => {
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" } }, error: null });
  getUser.mockReset().mockResolvedValue({ data: { user }, error: null });
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
});
test("checks verified claims and provider identity without sending email or subject to the RPC", async () => {
  await expect(synchronizeCallerIdentity(options)).resolves.toEqual(result);
  expect(getClaims).toHaveBeenCalledOnce(); expect(getUser).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("mmhr_sync_my_identity", { correlation_id: correlationId });
  expect(identityId).not.toBe(subject);
});
test.each([null, { sub: subject, aal: "aal3" }, { sub: "malformed", aal: "aal1" }])("denies invalid claims %#", async (claims) => {
  getClaims.mockResolvedValue({ data: { claims }, error: null });
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "REJECTED" });
  expect(getUser).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
test.each([null, { ...user, id: identityId }, { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true },
  { ...user, email: "invalid" }])("denies unsupported provider identity %#", async (value) => {
  getUser.mockResolvedValue({ data: { user: value }, error: null });
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "REJECTED" });
  expect(rpc).not.toHaveBeenCalled();
});
test.each([getClaims, getUser])("denies a provider error even with populated response data %#", async (method) => {
  method.mockResolvedValue({ data: { claims: { sub: subject, aal: "aal1" }, user }, error: { message: "private" } });
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "REJECTED" }); expect(rpc).not.toHaveBeenCalled();
});
test.each([getClaims, getUser, rpc])("hides transport errors %#", async (method) => {
  method.mockRejectedValue(new Error("private details"));
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Account setup could not be completed" });
});

test.each([getClaims, getUser, rpc])("rejects a missing provider response without leaking an internal error %#", async (method) => {
  method.mockResolvedValue(undefined);
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "REJECTED", message: "Account setup could not be completed" });
});
test.each([null, { ...result, status: "active" }, { ...result, status: "suspended" }, { ...result, email: user.email },
  { ...result, correlationId: identityId }])("rejects unsafe synchronization results %#", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(synchronizeCallerIdentity(options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
test("permits an already active unchanged identity without treating its ID as the provider subject", async () => {
  rpc.mockResolvedValue({ data: { ...result, status: "active", outcome: "unchanged" }, error: null });
  await expect(synchronizeCallerIdentity(options)).resolves.toMatchObject({ identityId, status: "active", outcome: "unchanged" });
});
test("denies bad correlation before provider access", async () => {
  await expect(synchronizeCallerIdentity({ ...options, correlationId: "bad" })).rejects.toMatchObject({ code: "REJECTED" });
  expect(getClaims).not.toHaveBeenCalled();
});
