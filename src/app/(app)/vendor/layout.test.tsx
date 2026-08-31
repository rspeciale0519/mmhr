import { beforeEach, expect, test, vi } from "vitest";

import VendorLayout from "@/app/(app)/vendor/layout";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));

beforeEach(() => vi.mocked(requireSelectedOrganizationPermission).mockReset());

test("requires vendor portal permission before rendering children", async () => {
  const children = "children";
  await expect(VendorLayout({ children })).resolves.toBe(children);
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("portal.vendor.access");
});
