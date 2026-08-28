import { beforeEach, describe, expect, test, vi } from "vitest";

import { getVerifiedIdentity } from "@/server/auth/verified-identity";
import {
  createContext,
  identityProcedure,
  router,
} from "@/server/trpc/trpc";

vi.mock("@/server/auth/verified-identity", () => ({
  getVerifiedIdentity: vi.fn(),
}));

const testRouter = router({
  identity: identityProcedure.query(({ ctx }) => ({ userId: ctx.user.id })),
});

describe("tRPC identity boundary", () => {
  beforeEach(() => {
    vi.mocked(getVerifiedIdentity).mockReset();
  });

  test.each(["missing", "invalid", "expired"])(
    "creates an anonymous context for a %s identity",
    async () => {
      vi.mocked(getVerifiedIdentity).mockResolvedValue(null);

      await expect(createContext()).resolves.toEqual({ user: null });
    },
  );

  test("creates a context from the shared verified identity guard", async () => {
    vi.mocked(getVerifiedIdentity).mockResolvedValue({ id: "user-123" });

    await expect(createContext()).resolves.toEqual({
      user: { id: "user-123" },
    });
    expect(getVerifiedIdentity).toHaveBeenCalledTimes(1);
  });

  test("denies a direct anonymous procedure call", async () => {
    const caller = testRouter.createCaller({ user: null });

    await expect(caller.identity()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("allows a direct verified identity procedure call", async () => {
    const caller = testRouter.createCaller({ user: { id: "user-456" } });

    await expect(caller.identity()).resolves.toEqual({ userId: "user-456" });
  });
});
