import { beforeEach, expect, test, vi } from "vitest";
import { requirePermission } from "@/server/auth/authorization";
import { getOrganizationInvitations } from "./organization-invitation-read";

vi.mock("@/server/auth/authorization", () => ({ requirePermission: vi.fn() }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "33333333-3333-4333-8333-333333333333";
const row = {
  invitation_id: id1, organization_id: organizationId, invited_email: "synthetic@example.invalid",
  role_key: null, status: "pending", created_at: "2026-09-05T00:00:00.000Z", expires_at: "2026-09-08T00:00:00.000Z",
};
const rpc = vi.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase: { rpc } } as never);
});

test("uses the permission-bound client and returns redacted roles", async () => {
  await expect(getOrganizationInvitations({ organizationId })).resolves.toEqual({ invitations: [row], nextCursor: null });
  expect(requirePermission).toHaveBeenCalledWith("org.members.view", { kind: "organization", organizationId }, {});
  expect(rpc).toHaveBeenCalledWith("mmhr_get_organization_invitations", {
    requested_organization_id: organizationId, after_id: null, page_size: 50,
  });
});
test("uses one look-ahead row without skipping it on the next page", async () => {
  rpc.mockResolvedValueOnce({ data: [row, { ...row, invitation_id: id2 }], error: null });
  await expect(getOrganizationInvitations({ organizationId, pageSize: 1 }))
    .resolves.toEqual({ invitations: [row], nextCursor: id1 });
  rpc.mockResolvedValueOnce({ data: [{ ...row, invitation_id: id2 }], error: null });
  await expect(getOrganizationInvitations({ organizationId, pageSize: 1, afterId: id1 }))
    .resolves.toMatchObject({ nextCursor: null, invitations: [{ invitation_id: id2 }] });
});
test.each([
  null, [{ ...row, organization_id: id2 }], [row, row], [{ ...row, token: "forbidden-field" }],
  [{ ...row, role_key: "super_admin" }], [{ ...row, invited_email: "invalid" }],
  [{ ...row, invitation_id: id2 }, row],
])("rejects unsafe or ambiguous rows %#", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(getOrganizationInvitations({ organizationId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
test("does not read after permission denial", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new Error("Denied"));
  await expect(getOrganizationInvitations({ organizationId })).rejects.toThrow("Denied");
  expect(rpc).not.toHaveBeenCalled();
});
test.each([0, -1, 101, 1.5])("rejects page size %s", async (pageSize) => {
  await expect(getOrganizationInvitations({ organizationId, pageSize })).rejects.toMatchObject({ code: "REJECTED" });
  expect(requirePermission).not.toHaveBeenCalled();
});
test("maps transport details to a generic failure", async () => {
  rpc.mockRejectedValue(new Error("private transport details"));
  await expect(getOrganizationInvitations({ organizationId })).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
