import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  createContext,
  identityProcedure,
  publicProcedure,
  router,
  type RequestTransport,
} from "@/server/trpc/trpc";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc };
const mutationCalled = vi.fn();
const appOrigin = "https://mmhr.example";

const testRouter = router({
  identity: identityProcedure.query(({ ctx }) => ({ userId: ctx.user.id })),
  rawMutation: publicProcedure.mutation(() => {
    mutationCalled();
    return { ok: true };
  }),
  identityMutation: identityProcedure.mutation(() => {
    mutationCalled();
    return { ok: true };
  }),
});

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  getClaims.mockReset();
  rpc.mockReset();
  mutationCalled.mockReset();
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-123" } }, error: null });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appOrigin);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tRPC identity boundary", () => {
  test.each([null, {}, { sub: "" }])(
    "creates an anonymous context for invalid claims: %j",
    async (claims) => {
      getClaims.mockResolvedValue({ data: { claims }, error: null });

      await expect(createContext()).resolves.toEqual({ user: null, supabase });
    },
  );

  test("rejects failed verification even when the result has an identity", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: new Error("Token verification failed"),
    });

    await expect(createContext()).resolves.toEqual({ user: null, supabase });
  });

  test("creates one verified request client for identity and authorization", async () => {
    await expect(createContext()).resolves.toEqual({
      user: { id: "user-123" },
      supabase,
    });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  test("captures immutable transport facts from the fetch adapter request", async () => {
    const req = new Request(`${appOrigin}/api/trpc/identityMutation`, {
      method: "POST",
      headers: { origin: appOrigin },
    });
    const context = await createContext({ req });
    req.headers.set("origin", "https://other.example");

    expect(context.transport).toEqual({ method: "POST", origin: appOrigin });
    expect(Object.isFrozen(context.transport)).toBe(true);
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

describe("tRPC mutation transport boundary", () => {
  const unsafeTransports: (RequestTransport | undefined)[] = [
    undefined,
    { method: "GET", origin: appOrigin },
    { method: "PUT", origin: appOrigin },
    { method: "PATCH", origin: appOrigin },
    { method: "DELETE", origin: appOrigin },
    { method: "POST", origin: null },
    { method: "POST", origin: "null" },
    { method: "POST", origin: "https://foreign.example" },
    { method: "POST", origin: `${appOrigin}.foreign.example` },
    { method: "POST", origin: `${appOrigin}/path` },
  ];

  test.each(unsafeTransports)(
    "cannot bypass the guard through a base mutation: %j",
    async (transport) => {
      const caller = testRouter.createCaller({
        user: { id: "user-123" },
        transport,
      });

      for (const procedure of ["rawMutation", "identityMutation"] as const) {
        await expect(caller[procedure]()).rejects.toMatchObject({
          code: "FORBIDDEN",
          message: "Mutation request rejected",
        });
      }
      expect(mutationCalled).not.toHaveBeenCalled();
    },
  );

  test("allows an exact-origin POST mutation", async () => {
    const caller = testRouter.createCaller({
      user: { id: "user-123" },
      transport: { method: "POST", origin: appOrigin },
    });

    await expect(caller.identityMutation()).resolves.toEqual({ ok: true });
    expect(mutationCalled).toHaveBeenCalledTimes(1);
  });

  test("an anonymous exact-origin request cannot use an identity mutation", async () => {
    const caller = testRouter.createCaller({
      user: null,
      transport: { method: "POST", origin: appOrigin },
    });

    await expect(caller.identityMutation()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mutationCalled).not.toHaveBeenCalled();
  });

  test("fails closed when the canonical app origin is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    const caller = testRouter.createCaller({
      user: { id: "user-123" },
      transport: { method: "POST", origin: appOrigin },
    });

    await expect(caller.rawMutation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mutationCalled).not.toHaveBeenCalled();
  });

  test.each([appOrigin, "https://foreign.example", null])(
    "uses fetch-adapter transport facts for the origin %s",
    async (origin) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (origin) headers.set("origin", origin);
      const req = new Request(`${appOrigin}/api/trpc/identityMutation`, {
        method: "POST",
        headers,
        body: JSON.stringify({ json: null }),
      });
      const response = await fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: testRouter,
        createContext,
      });

      expect(response.status).toBe(origin === appOrigin ? 200 : 403);
      expect(mutationCalled).toHaveBeenCalledTimes(origin === appOrigin ? 1 : 0);
    },
  );
});
