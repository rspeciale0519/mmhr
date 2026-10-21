import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordRfpAmendment } from "./rfp-amendment";
import { rfpAmendmentCommandSchema } from "@/server/workflows/rfp-amendment-contract";
vi.mock("@/server/auth/authorization", async () => { const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"); return { ...actual, requirePermission: vi.fn() }; });
const ids = { amendmentId: "11111111-1111-4111-8111-111111111111", rfpId: "22222222-2222-4222-8222-222222222222", organizationId: "33333333-3333-4333-8333-333333333333", vendorProfileId: "44444444-4444-4444-8444-444444444444", actorIdentityId: "55555555-5555-4555-8555-555555555555", correlationId: "66666666-6666-4666-8666-666666666666", idempotencyKey: "77777777-7777-4777-8777-777777777777" };
const item = { amendmentKey: "pricing", sectionKey: "commercial", title: "Pricing", text: "Vendor-specific pricing terms." };
const base = { ...ids, action: "create" as const, baseVersion: 1, version: 1, title: "Vendor terms", items: [item] };
const rpc = vi.fn(); const context = { supabase: { rpc } as never, identityId: ids.actorIdentityId, scope: { kind: "organization", organizationId: ids.organizationId }, assurance: "aal2", correlationId: ids.correlationId } as const;
describe("amendment action permissions", () => {
  test.each(["create", "approve"] as const)("requires the exact permission for %s", async (action) => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockRejectedValue(new AuthorizationError());
    const input = action === "create" ? base : {
      ...ids, action, baseVersion: 1, version: 1, approvalReference: "approval:review",
    };
    await expect(recordRfpAmendment(input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(requirePermission).toHaveBeenCalledWith(
      action === "approve" ? "rfp.approve" : "workspace.access",
      { kind: "organization", organizationId: ids.organizationId }, {},
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
describe("RFP amendment command", () => { beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); }); test("requires unique bounded amendment items", () => { expect(rfpAmendmentCommandSchema.safeParse({ ...base, items: [item, item] }).success).toBe(false); expect(rfpAmendmentCommandSchema.safeParse({ ...base, extra: true }).success).toBe(false); }); test("rejects actor mismatch before RPC", async () => { await expect(recordRfpAmendment({ ...base, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled(); }); });
