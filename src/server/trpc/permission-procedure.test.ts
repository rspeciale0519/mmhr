import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, PermissionScope } from "@/server/auth/permission-registry";
import {
  createContext,
  permissionProcedure,
  router,
  type Context,
} from "@/server/trpc/trpc";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const authUserId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOrganizationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const appOrigin = "https://mmhr.example";
const getClaims = vi.fn();
const rpc = vi.fn();
const supabase = { auth: { getClaims }, rpc };
const handlerCalled = vi.fn();
const organizationInput = z.strictObject({
  organizationId: z.uuid().transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1),
});
const resolveOrganizationScope = vi.fn(
  (input: z.output<typeof organizationInput>): PermissionScope => ({
    kind: "organization",
    organizationId: input.organizationId,
  }),
);

const permissionRouter = router({
  platform: permissionProcedure({
    permission: "admin.access",
    input: z.void(),
    resolveScope: () => ({ kind: "platform" }),
  }).query(({ ctx }) => {
    handlerCalled();
    return { identityId: ctx.authorization.identityId };
  }),
  organization: permissionProcedure({
    permission: "org.members.view",
    input: organizationInput,
    resolveScope: resolveOrganizationScope,
  }).query(({ ctx, input }) => {
    handlerCalled();
    return { identityId: ctx.authorization.identityId, name: input.name };
  }),
  invite: permissionProcedure({
    permission: "org.members.invite",
    input: organizationInput,
    resolveScope: resolveOrganizationScope,
  }).mutation(({ ctx }) => {
    handlerCalled();
    return { identityId: ctx.authorization.identityId };
  }),
});

function caller(overrides: Partial<Context> = {}) {
  return permissionRouter.createCaller({
    user: { id: authUserId },
    supabase: supabase as never,
    transport: { method: "POST", origin: appOrigin },
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  getClaims.mockReset();
  getClaims.mockResolvedValue({
    data: { claims: { sub: authUserId, aal: "aal2" } },
    error: null,
  });
  rpc.mockReset();
  rpc.mockImplementation(async (_name, input) => ({
    data: [{
      identity_id: identityId,
      authorized_organization_id: input.organization_id,
      assurance: "aal2",
    }],
    error: null,
  }));
  handlerCalled.mockReset();
  resolveOrganizationScope.mockClear();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appOrigin);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("permission-aware tRPC procedures", () => {
  test("preserves validated procedure input and output types", () => {
    expectTypeOf<inferProcedureInput<typeof permissionRouter.organization>>()
      .toEqualTypeOf<{ organizationId: string; name: string }>();
    expectTypeOf<inferProcedureOutput<typeof permissionRouter.organization>>()
      .toEqualTypeOf<{ identityId: string; name: string }>();
  });

  test("cannot append input transforms or context middleware after authorization", () => {
    const builder = permissionProcedure({
      permission: "org.members.view",
      input: organizationInput,
      resolveScope: resolveOrganizationScope,
    });

    expectTypeOf(builder).not.toHaveProperty("input");
    expectTypeOf(builder).not.toHaveProperty("use");
    expectTypeOf(builder).not.toHaveProperty("concat");
    expect(Object.keys(builder)).toEqual(["query", "mutation"]);
    expect(Object.isFrozen(builder)).toBe(true);
  });

  test("preserves different raw and parsed input types", async () => {
    const transformedRouter = router({
      count: permissionProcedure({
        permission: "org.members.view",
        input: z.strictObject({
          organizationId: z.uuid(),
          count: z.string().regex(/^\d+$/).transform(Number),
        }),
        resolveScope: (input) => {
          expectTypeOf(input.count).toEqualTypeOf<number>();
          return { kind: "organization", organizationId: input.organizationId };
        },
      }).query(({ input }) => ({ count: input.count })),
    });
    expectTypeOf<inferProcedureInput<typeof transformedRouter.count>>()
      .toEqualTypeOf<{ organizationId: string; count: string }>();
    expectTypeOf<inferProcedureOutput<typeof transformedRouter.count>>()
      .toEqualTypeOf<{ count: number }>();

    await expect(transformedRouter.createCaller({
      user: { id: authUserId },
      supabase: supabase as never,
    }).count({ organizationId, count: "12" })).resolves.toEqual({ count: 12 });
  });

  test("authorizes a declared platform permission through the request client", async () => {
    await expect(caller().platform()).resolves.toEqual({ identityId });
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mmhr_authorize", {
      permission_key: "admin.access",
      organization_id: null,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("resolves organization scope only after parsing and normalization", async () => {
    await expect(caller().organization({
      organizationId: organizationId.toUpperCase(),
      name: "  Validated name  ",
    })).resolves.toEqual({ identityId, name: "Validated name" });
    expect(resolveOrganizationScope).toHaveBeenCalledWith({
      organizationId,
      name: "Validated name",
    });
    expect(rpc).toHaveBeenCalledWith("mmhr_authorize", {
      permission_key: "org.members.view",
      organization_id: organizationId,
    });
  });

  test("rejects anonymous callers before scope and permission checks", async () => {
    await expect(caller({ user: null }).organization({
      organizationId,
      name: "Example",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(resolveOrganizationScope).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test.each([
    { organizationId: "not-a-uuid", name: "Example" },
    { organizationId, name: " " },
    { organizationId, name: "Example", actorId: identityId },
  ])("rejects malformed input before resolving its scope: %j", async (input) => {
    await expect(caller().organization(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(resolveOrganizationScope).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test("rejects a malformed resolver result before the authority call", async () => {
    const malformedRouter = router({
      read: permissionProcedure({
        permission: "org.members.view",
        input: z.void(),
        resolveScope: () => ({ kind: "organization", organizationId: "invalid" }),
      }).query(handlerCalled),
    });
    await expect(malformedRouter.createCaller({ user: { id: authUserId } }).read())
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid authorization scope" });
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test.each([
    "unknown.permission" as PermissionKey,
    "org.members.view" as const,
  ])("denies an unknown or scope-incompatible permission: %s", async (permission) => {
    const invalidRouter = router({
      read: permissionProcedure({
        permission,
        input: z.void(),
        resolveScope: () => ({ kind: "platform" }),
      }).query(handlerCalled),
    });
    await expect(invalidRouter.createCaller({ user: { id: authUserId } }).read())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test("cannot promote AAL1 to privileged access from the tRPC user context", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: authUserId, aal: "aal1" } },
      error: null,
    });
    await expect(caller().platform()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().invite({ organizationId, name: "Example" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test("requires current verification even when the context has a user", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: authUserId, aal: "aal2" } },
      error: new Error("Invalid token"),
    });
    await expect(caller().platform()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test.each([
    { data: [], error: null },
    { data: null, error: null },
    { data: null, error: { message: "Private provider detail" } },
    {
      data: [{ identity_id: identityId, authorized_organization_id: otherOrganizationId, assurance: "aal2" }],
      error: null,
    },
  ])("does not disclose inaccessible organization state: %j", async (result) => {
    rpc.mockResolvedValue(result);
    await expect(caller().organization({ organizationId, name: "Example" }))
      .rejects.toMatchObject({ code: "NOT_FOUND", message: "Resource not found" });
    expect(handlerCalled).not.toHaveBeenCalled();
  });

  test("does not cache permission success across procedure calls", async () => {
    const client = caller();
    await expect(client.platform()).resolves.toEqual({ identityId });
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(client.platform()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(handlerCalled).toHaveBeenCalledTimes(1);
  });

  test("allows only a verified and authorized exact-origin mutation", async () => {
    const context = await createContext({
      req: new Request(`${appOrigin}/api/trpc/invite`, {
        method: "POST",
        headers: { origin: appOrigin },
      }),
    });
    await expect(permissionRouter.createCaller(context).invite({ organizationId, name: "Example" }))
      .resolves.toEqual({ identityId });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(handlerCalled).toHaveBeenCalledTimes(1);
  });

  test.each([
    undefined,
    { method: "GET", origin: appOrigin },
    { method: "POST", origin: null },
    { method: "POST", origin: "https://foreign.example" },
  ])("rejects unsafe transport before calling authorization: %j", async (transport) => {
    await expect(caller({ transport }).invite({ organizationId, name: "Example" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Mutation request rejected" });
    expect(resolveOrganizationScope).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(handlerCalled).not.toHaveBeenCalled();
  });
});
