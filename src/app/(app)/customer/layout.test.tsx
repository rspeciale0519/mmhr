import { beforeEach, expect, test, vi } from "vitest";

import CustomerLayout from "@/app/(app)/customer/layout";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));

beforeEach(() => vi.mocked(requirePortalPageAccess).mockReset());

test("requires customer portal permission before rendering children", async () => {
  const children = "children";
  await expect(CustomerLayout({ children })).resolves.toBe(children);
  expect(requirePortalPageAccess).toHaveBeenCalledWith("customer");
});
