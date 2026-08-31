import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  portalPermissions,
  requirePortalPageAccess,
} from "@/server/auth/portal/portal-guards";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({
  requireSelectedOrganizationPermission: vi.fn(),
}));

describe("portal page guard contract", () => {
  beforeEach(() => vi.mocked(requireSelectedOrganizationPermission).mockReset());

  test("keeps customer and vendor permissions separate", () => {
    expect(portalPermissions).toEqual({
      customer: "portal.customer.access",
      vendor: "portal.vendor.access",
    });
  });

  test.each([
    ["customer", "portal.customer.access"],
    ["vendor", "portal.vendor.access"],
  ] as const)("evaluates only the fixed %s portal permission", async (portal, permission) => {
    const authorization = { identity: { id: "identity" }, authorization: {} } as never;
    vi.mocked(requireSelectedOrganizationPermission).mockResolvedValue(authorization);

    await expect(requirePortalPageAccess(portal)).resolves.toBe(authorization);
    expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith(permission);
  });

});
