import { beforeEach, expect, test, vi } from "vitest";
import { requirePermission } from "@/server/auth/authorization";
import { getOrganizationMembers } from "./organization-member-read";

vi.mock("@/server/auth/authorization", () => ({ requirePermission: vi.fn() }));
const organizationId = "22222222-2222-4222-8222-222222222222";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "33333333-3333-4333-8333-333333333333";
const row = { membership_id: firstId, organization_id: organizationId, identity_id: secondId, role_key: null, status: "active" };
const rpc = vi.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase: { rpc } } as never);
});
test("uses the exact organization and permission-bound client", async () => {
  await expect(getOrganizationMembers({ organizationId })).resolves.toEqual({ members: [row], nextCursor: null });
  expect(requirePermission).toHaveBeenCalledWith("org.members.view", { kind: "organization", organizationId }, {});
  expect(rpc).toHaveBeenCalledWith("mmhr_get_organization_members_page", {
    requested_organization_id: organizationId, after_id: null, page_size: 50,
  });
});
test("keeps the look-ahead row available on the next page", async () => {
  rpc.mockResolvedValue({ data: [row, { ...row, membership_id: secondId }], error: null });
  await expect(getOrganizationMembers({ organizationId, pageSize: 1 })).resolves.toEqual({ members: [row], nextCursor: firstId });
  rpc.mockResolvedValue({ data: [{ ...row, membership_id: secondId }], error: null });
  await expect(getOrganizationMembers({ organizationId, pageSize: 1, afterId: firstId }))
    .resolves.toMatchObject({ nextCursor: null, members: [{ membership_id: secondId }] });
});
test.each([null, [row, row], [{ ...row, organization_id: secondId }], [{ ...row, email: "forbidden@example.invalid" }],
  [{ ...row, role_key: "super_admin" }], [{ ...row, status: "revoked" }], [{ ...row, membership_id: secondId }, row]])(
  "rejects unsafe or ambiguous response %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(getOrganizationMembers({ organizationId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  },
);
test("rejects rows at or before the cursor", async () => {
  await expect(getOrganizationMembers({ organizationId, afterId: firstId })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
test.each([0, -1, 101, 1.5])("rejects page size %s before permission lookup", async (pageSize) => {
  await expect(getOrganizationMembers({ organizationId, pageSize })).rejects.toMatchObject({ code: "REJECTED" });
  expect(requirePermission).not.toHaveBeenCalled();
});
test("returns the authorized empty state", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(getOrganizationMembers({ organizationId })).resolves.toEqual({ members: [], nextCursor: null });
});
test("does not call the read after permission denial", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new Error("Denied"));
  await expect(getOrganizationMembers({ organizationId })).rejects.toThrow("Denied");
  expect(rpc).not.toHaveBeenCalled();
});
test("hides transport details", async () => {
  rpc.mockRejectedValue(new Error("private details"));
  await expect(getOrganizationMembers({ organizationId })).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Members could not be loaded" });
});
