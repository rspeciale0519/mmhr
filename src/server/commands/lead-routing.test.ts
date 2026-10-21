import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import { routeLead } from "./lead-routing";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error { constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; } }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});
const leadId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const ownerIdentityId = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = { supabase, identityId: ownerIdentityId, scope: { kind: "organization", organizationId }, assurance: "aal1", correlationId: leadId } as const satisfies AuthorizationContext;
const input = { leadId, organizationId, ownerIdentityId, status: "contacted" as const };
describe("lead routing boundary", () => {
  beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); });
  test("routes through the fixed RPC", async () => {
    rpc.mockResolvedValue({ data: { ...input, outcomeCode: "routed", correlationId: leadId }, error: null });
    await expect(routeLead(input, { supabase })).resolves.toMatchObject({ outcomeCode: "routed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("mmhr_route_lead");
  });
  test("rejects an authorization denial", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(routeLead(input, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("maps malformed provider responses", async () => {
    rpc.mockResolvedValue({ data: { ...input, outcomeCode: "routed" }, error: null });
    await expect(routeLead(input, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
