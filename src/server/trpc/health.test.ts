import { expect, test } from "vitest";

import { appRouter } from "@/server/trpc/root";

test("health.ping is callable without a session", async () => {
  const caller = appRouter.createCaller({ user: null });
  await expect(caller.health.ping()).resolves.toEqual({ ok: true });
});

test("health.ping reports the caller's auth state", async () => {
  const anon = appRouter.createCaller({ user: null });
  await expect(anon.health.whoami()).resolves.toEqual({ userId: null });

  const signedIn = appRouter.createCaller({
    user: { id: "user-123", email: "buyer@acme.com" },
  });
  await expect(signedIn.health.whoami()).resolves.toEqual({
    userId: "user-123",
  });
});
