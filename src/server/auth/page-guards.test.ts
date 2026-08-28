import { beforeEach, describe, expect, test, vi } from "vitest";

import { redirect } from "next/navigation";

import { requirePageIdentity } from "@/server/auth/page-guards";
import { getVerifiedIdentity } from "@/server/auth/verified-identity";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/server/auth/verified-identity", () => ({
  getVerifiedIdentity: vi.fn(),
}));

describe("page identity guard", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockReset();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    vi.mocked(getVerifiedIdentity).mockReset();
  });

  test("redirects when identity verification returns no identity", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue(null);

    await expect(requirePageIdentity()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  test("returns a verified identity", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });

    await expect(requirePageIdentity()).resolves.toEqual({ id: "user-123" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
