import { beforeEach, describe, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { authorizePermission } from "@/server/auth/authorization";
import { signedInDestination } from "./workspace-entry";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/server/auth/authorization", () => ({ authorizePermission: vi.fn() }));

const set = vi.fn();
const rpc = vi.fn();
const supabase = { rpc } as never;
const customerId = "11111111-1111-4111-8111-111111111111";
const vendorId = "22222222-2222-4222-8222-222222222222";
const membership = (organization_id: string, organization_type: "customer" | "vendor" | "internal" = "customer") => ({
  organization_id, organization_name: "Example team", organization_type, organization_status: "active", role_key: "viewer",
});
function grant(...permissions: string[]) {
  vi.mocked(authorizePermission).mockImplementation(async (permission) =>
    permissions.includes(permission) ? { identityId: "application-identity" } as never : null);
}

describe("signedInDestination", () => {
  beforeEach(() => {
    vi.mocked(cookies).mockReset().mockResolvedValue({ set } as never);
    vi.mocked(authorizePermission).mockReset();
    set.mockReset();
    rpc.mockReset().mockResolvedValue({ data: [membership(customerId)], error: null });
    grant("workspace.access", "portal.customer.access");
  });

  test("selects the only workspace with the manual-choice cookie and opens the customer portal", async () => {
    await expect(signedInDestination(supabase)).resolves.toBe("/customer");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_my_memberships");
    expect(authorizePermission).toHaveBeenCalledWith("workspace.access",
      { kind: "organization", organizationId: customerId }, { supabase });
    expect(set).toHaveBeenCalledExactlyOnceWith("mmhr-organization-id", customerId, {
      httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 28800,
    });
    // Every decision uses the signed-in request client.
    for (const call of vi.mocked(authorizePermission).mock.calls) expect(call[2]).toEqual({ supabase });
  });

  test("opens the vendor portal for a single vendor workspace", async () => {
    rpc.mockResolvedValue({ data: [membership(vendorId, "vendor")], error: null });
    grant("workspace.access", "portal.vendor.access");
    await expect(signedInDestination(supabase)).resolves.toBe("/vendor");
    expect(set).toHaveBeenCalledWith("mmhr-organization-id", vendorId, expect.anything());
  });

  test("uses the workspace home when the single workspace has no portal", async () => {
    rpc.mockResolvedValue({ data: [membership(customerId, "internal")], error: null });
    grant("workspace.access");
    await expect(signedInDestination(supabase)).resolves.toBe("/home");
  });

  test("sends staff with administration access to /admin without selecting a workspace", async () => {
    grant("admin.access", "workspace.access", "portal.customer.access");
    await expect(signedInDestination(supabase)).resolves.toBe("/admin");
    expect(rpc).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  test.each([
    [[membership(customerId), membership(vendorId, "vendor")]],
    [[]],
  ])("keeps the chooser for zero or several workspaces %#", async (rows) => {
    rpc.mockResolvedValue({ data: rows, error: null });
    await expect(signedInDestination(supabase)).resolves.toBe("/workspaces");
    expect(set).not.toHaveBeenCalled();
  });

  test("keeps the chooser and sets no cookie when workspace access is denied", async () => {
    grant("portal.customer.access");
    await expect(signedInDestination(supabase)).resolves.toBe("/workspaces");
    expect(set).not.toHaveBeenCalled();
  });

  test.each([
    { data: null, error: new Error("private provider details") },
    { data: [{ ...membership(customerId), organization_status: "suspended" }], error: null },
  ])("falls back to the home access router when the membership read fails %#", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(signedInDestination(supabase)).resolves.toBe("/home");
    expect(set).not.toHaveBeenCalled();
  });

  test("falls back to the home access router when a permission check throws", async () => {
    vi.mocked(authorizePermission).mockRejectedValue(new Error("Permission service unavailable"));
    await expect(signedInDestination(supabase)).resolves.toBe("/home");
    expect(set).not.toHaveBeenCalled();
  });
});
