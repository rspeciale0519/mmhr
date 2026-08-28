import { beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  getVerifiedIdentity,
  parseVerifiedIdentity,
} from "@/server/auth/verified-identity";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const getClaims = vi.fn();

describe("verified identity", () => {
  beforeEach(() => {
    getClaims.mockReset();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims },
    } as never);
  });

  test.each([
    undefined,
    null,
    {},
    { sub: "" },
    { sub: "   " },
    { sub: 42 },
  ])("rejects malformed claims: %j", (claims) => {
    expect(parseVerifiedIdentity(claims)).toBeNull();
  });

  test("returns only the stable verified subject", () => {
    expect(
      parseVerifiedIdentity({
        sub: "user-123",
        email: "untrusted@example.com",
        role: "admin",
        user_metadata: { orgId: "forged-org" },
      }),
    ).toEqual({ id: "user-123" });
  });

  test.each(["invalid JWT", "JWT expired"])(
    "treats a claims error as anonymous: %s",
    async (message) => {
      getClaims.mockResolvedValue({
        data: { claims: { sub: "must-not-pass" } },
        error: new Error(message),
      });

      await expect(getVerifiedIdentity()).resolves.toBeNull();
      expect(getClaims).toHaveBeenCalledTimes(1);
    },
  );

  test("returns a valid verified identity", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-456" } },
      error: null,
    });

    await expect(getVerifiedIdentity()).resolves.toEqual({ id: "user-456" });
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  test("does not hide an unexpected verification failure", async () => {
    getClaims.mockRejectedValue(new Error("identity service unavailable"));

    await expect(getVerifiedIdentity()).rejects.toThrow(
      "identity service unavailable",
    );
  });
});
