import { beforeEach, expect, test, vi } from "vitest";

import AdminHome from "@/app/(admin)/admin/page";
import { requirePagePermission } from "@/server/auth/page-guards";

vi.mock("@/server/auth/page-guards", () => ({
  requirePagePermission: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset();
  vi.mocked(requirePagePermission).mockResolvedValue({
    identity: { id: "user-123" },
    authorization: {} as never,
  });
});

test("requires the platform admin permission", async () => {
  const result = await AdminHome();

  expect(requirePagePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" });
  expect(result).toMatchObject({
    type: "main",
    props: { children: expect.arrayContaining([expect.anything()]) },
  });
});
