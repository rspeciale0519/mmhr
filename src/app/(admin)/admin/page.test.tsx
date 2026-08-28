import { beforeEach, expect, test, vi } from "vitest";

import { forbidden } from "next/navigation";

import AdminHome from "@/app/(admin)/admin/page";
import { requirePageIdentity } from "@/server/auth/page-guards";

vi.mock("next/navigation", () => ({
  forbidden: vi.fn(),
}));

vi.mock("@/server/auth/page-guards", () => ({
  requirePageIdentity: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requirePageIdentity).mockReset();
  vi.mocked(requirePageIdentity).mockResolvedValue({ id: "user-123" });
  vi.mocked(forbidden).mockReset();
  vi.mocked(forbidden).mockImplementation(() => {
    throw new Error("NEXT_FORBIDDEN");
  });
});

test("verifies identity and then denies all early admin access", async () => {
  await expect(AdminHome()).rejects.toThrow("NEXT_FORBIDDEN");

  expect(requirePageIdentity).toHaveBeenCalledTimes(1);
  expect(forbidden).toHaveBeenCalledTimes(1);
});
