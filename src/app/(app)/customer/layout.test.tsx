import { beforeEach, expect, test, vi } from "vitest";

import CustomerLayout from "@/app/(app)/customer/layout";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({ requireSelectedOrganizationPermission: vi.fn() }));

beforeEach(() => vi.mocked(requireSelectedOrganizationPermission).mockReset());

test("requires customer portal permission before rendering children", async () => {
  const children = "children";
  await expect(CustomerLayout({ children })).resolves.toBe(children);
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("portal.customer.access");
});
