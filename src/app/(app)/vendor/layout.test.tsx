import { beforeEach, expect, test, vi } from "vitest";

import VendorLayout from "@/app/(app)/vendor/layout";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";

vi.mock("@/server/auth/portal/portal-guards", () => ({ requirePortalPageAccess: vi.fn() }));

beforeEach(() => vi.mocked(requirePortalPageAccess).mockReset());

test("requires vendor portal permission before rendering children", async () => {
  const children = "children";
  await expect(VendorLayout({ children })).resolves.toBe(children);
  expect(requirePortalPageAccess).toHaveBeenCalledWith("vendor");
});
