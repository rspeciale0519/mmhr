import { expect, test } from "vitest";

import { appRouter } from "@/server/trpc/root";

test("health.ping is callable without a session", async () => {
  const caller = appRouter.createCaller({ user: null });
  await expect(caller.health.ping()).resolves.toEqual({ ok: true });
});

test("health.whoami rejects an anonymous caller", async () => {
  const anon = appRouter.createCaller({ user: null });
  await expect(anon.health.whoami()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test("health.whoami returns only the verified caller identifier", async () => {
  const signedIn = appRouter.createCaller({
    user: { id: "user-123" },
  });
  await expect(signedIn.health.whoami()).resolves.toEqual({
    userId: "user-123",
  });
});
