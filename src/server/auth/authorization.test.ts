import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  AuthorizationError,
  authorizePermission,
  requirePermission,
  type AuthorizationOptions,
  type RequestSupabaseClient,
} from "./authorization";
import { type PermissionKey, type PermissionScope } from "./permission-registry";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const authUserId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "abcdef01-2345-4678-9abc-def012345678";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const correlationId = "abcdefab-1234-4567-8abc-def012345678";
const scope: PermissionScope = { kind: "organization", organizationId };
const claims = { sub: authUserId, aal: "aal2" };
const row = { identity_id: identityId, authorized_organization_id: organizationId, assurance: "aal2" };
const getClaims = vi.fn();
const rpc = vi.fn();
const cookieClient = { auth: { getClaims }, rpc } as unknown as RequestSupabaseClient;

describe("request permission authorization", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset().mockResolvedValue(cookieClient);
    getClaims.mockReset().mockResolvedValue({ data: { claims }, error: null });
    rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  });

  test("returns a narrow actor-bound context with a distinct stable identity", async () => {
    const context = await authorizePermission("org.members.view", scope, { correlationId });
    expect(identityId).not.toBe(authUserId);
    expect(context).toEqual({
      supabase: cookieClient,
      identityId,
      scope,
      assurance: "aal2",
      correlationId,
    });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_authorize", {
      permission_key: "org.members.view",
      organization_id: organizationId,
    });
  });

  test("generates a fresh server correlation ID when none is supplied", async () => {
    const first = await authorizePermission("org.members.view", scope);
    const second = await authorizePermission("org.members.view", scope);
    expect(z.uuid().safeParse(first?.correlationId).success).toBe(true);
    expect(z.uuid().safeParse(second?.correlationId).success).toBe(true);
    expect(first?.correlationId).not.toBe(second?.correlationId);
  });

  test("normalizes valid organization and correlation UUIDs", async () => {
    rpc.mockResolvedValue({ data: [{ ...row, authorized_organization_id: organizationId.toUpperCase() }], error: null });
    const context = await authorizePermission("org.members.view", {
      kind: "organization", organizationId: organizationId.toUpperCase(),
    }, { correlationId: correlationId.toUpperCase() });
    expect(context?.scope).toEqual(scope);
    expect(context?.correlationId).toBe(correlationId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_authorize", {
      permission_key: "org.members.view", organization_id: organizationId,
    });
  });

  test.each(["unknown.permission", "*", "constructor", "__proto__", "", null, undefined, 1])(
    "denies an unknown permission before identity or database access: %s",
    async (permission) => {
      await expect(authorizePermission(permission as PermissionKey, scope)).resolves.toBeNull();
      expect(createClient).not.toHaveBeenCalled();
      expect(getClaims).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test.each([
    { value: null }, { value: undefined }, { value: [] }, { value: {} },
    { value: { kind: "organization", organizationId: "invalid" } },
    { value: { kind: "organization", organizationId, actorId: identityId } },
    { value: { kind: "organization", organizationId, supabase: {} } },
    { value: { kind: "resource", organizationId } },
    { value: { kind: "platform", organizationId } },
  ])("denies invalid scope input before client creation: $value", async ({ value }) => {
    await expect(authorizePermission("workspace.access", value as PermissionScope)).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not let organization scope grant a platform permission", async () => {
    await expect(authorizePermission("admin.access", scope)).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  test("does not omit required organization scope", async () => {
    await expect(authorizePermission("org.members.view", { kind: "platform" })).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  test.each(["", "invalid", "correlation-secret", null, 123])(
    "denies an invalid supplied correlation ID: %s",
    async (value) => {
      await expect(authorizePermission("org.members.view", scope, {
        correlationId: value,
      } as AuthorizationOptions)).resolves.toBeNull();
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  test.each([
    { value: null }, { value: undefined }, { value: [] }, { value: {} },
    { value: { sub: authUserId } },
    { value: { sub: "not-a-uuid", aal: "aal2" } },
    { value: { sub: "", aal: "aal2" } },
    { value: { sub: 123, aal: "aal2" } },
    { value: { sub: authUserId, aal: "aal3" } },
    { value: { sub: authUserId, aal: null } },
    { value: { sub: authUserId, aal: ["aal2"] } },
  ])("denies missing or malformed verified claims: $value", async ({ value }) => {
    getClaims.mockResolvedValue({ data: { claims: value }, error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("denies an absent verified-claims response", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not trust claims returned with a verification error", async () => {
    getClaims.mockResolvedValue({ data: { claims }, error: { message: "Verification failed" } });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects AAL1 before a privileged RPC call", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal: "aal1" } }, error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    await expect(authorizePermission("identity.recovery.request", { kind: "platform" })).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accepts an AAL1 permission only after the database confirms it", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal: "aal1" } }, error: null });
    rpc.mockResolvedValue({ data: [{ ...row, assurance: "aal1" }], error: null });
    const context = await authorizePermission("workspace.access", scope);
    expect(context?.assurance).toBe("aal1");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("does not lower a verified AAL2 context for an AAL1 permission", async () => {
    await expect(authorizePermission("workspace.access", scope)).resolves.toMatchObject({ assurance: "aal2" });
  });

  test("passes null organization scope for platform authorization", async () => {
    rpc.mockResolvedValue({ data: [{ ...row, authorized_organization_id: null }], error: null });
    await expect(authorizePermission("admin.access", { kind: "platform" })).resolves.toMatchObject({
      identityId, scope: { kind: "platform" }, assurance: "aal2",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_authorize", {
      permission_key: "admin.access", organization_id: null,
    });
  });

  test("denies a database error even when an authorization row is present", async () => {
    rpc.mockResolvedValue({ data: [row], error: { message: "Authorization lookup failed" } });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
  });

  test.each([
    { value: null }, { value: undefined }, { value: [] }, { value: {} }, { value: row },
    { value: [row, row] }, { value: [null] }, { value: [{}] },
    { value: [{ ...row, identity_id: "invalid" }] },
    { value: [{ ...row, identity_id: null }] },
    { value: [{ ...row, authorized_organization_id: "invalid" }] },
    { value: [{ identity_id: identityId, assurance: "aal2" }] },
    { value: [{ identity_id: identityId, organization_id: organizationId, assurance: "aal2" }] },
    { value: [{ ...row, assurance: "aal3" }] },
    { value: [{ ...row, assurance: null }] },
  ])("denies absent or malformed database authority: $value", async ({ value }) => {
    rpc.mockResolvedValue({ data: value, error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
  });

  test.each([otherOrganizationId, null])("rejects an unexpected organization result: %s", async (value) => {
    rpc.mockResolvedValue({ data: [{ ...row, authorized_organization_id: value }], error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
  });

  test("rejects organization data in a platform result", async () => {
    await expect(authorizePermission("admin.access", { kind: "platform" })).resolves.toBeNull();
  });

  test("rejects an assurance downgrade in the database result", async () => {
    rpc.mockResolvedValue({ data: [{ ...row, assurance: "aal1" }], error: null });
    await expect(authorizePermission("workspace.access", scope)).resolves.toBeNull();
  });

  test("rejects an assurance upgrade in the database result", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims, aal: "aal1" } }, error: null });
    await expect(authorizePermission("workspace.access", scope)).resolves.toBeNull();
  });

  test("strips unrequested fields from claims and database responses", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { ...claims, user_metadata: { role: "super_admin" } } }, error: null,
    });
    rpc.mockResolvedValue({
      data: [{ ...row, auth_user_id: authUserId, email: "private@example.com", debug: "not for callers" }],
      error: null,
    });
    const context = await authorizePermission("org.members.view", scope, { correlationId });
    expect(Object.keys(context!).sort()).toEqual([
      "assurance", "correlationId", "identityId", "scope", "supabase",
    ]);
    expect(context).not.toHaveProperty("email");
    expect(context).not.toHaveProperty("auth_user_id");
    expect(context).not.toHaveProperty("user_metadata");
    expect(context).not.toHaveProperty("debug");
  });

  test("does not retain a previous permission result", async () => {
    rpc
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.not.toBeNull();
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test("does not retain previous verified claims", async () => {
    getClaims
      .mockResolvedValueOnce({ data: { claims }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(authorizePermission("org.members.view", scope)).resolves.not.toBeNull();
    await expect(authorizePermission("org.members.view", scope)).resolves.toBeNull();
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("reuses an injected server request client and still verifies its caller", async () => {
    const requestGetClaims = vi.fn().mockResolvedValue({ data: { claims }, error: null });
    const requestRpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const requestClient = {
      auth: { getClaims: requestGetClaims }, rpc: requestRpc,
    } as unknown as RequestSupabaseClient;
    const context = await authorizePermission("org.members.view", scope, {
      supabase: requestClient, correlationId,
    });
    expect(context?.supabase).toBe(requestClient);
    expect(createClient).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(requestGetClaims).toHaveBeenCalledOnce();
    expect(requestRpc).toHaveBeenCalledExactlyOnceWith("mmhr_authorize", {
      permission_key: "org.members.view", organization_id: organizationId,
    });
  });

  test("does not hide unexpected provider exceptions", async () => {
    const error = new Error("Provider unavailable");
    getClaims.mockRejectedValueOnce(error);
    await expect(authorizePermission("org.members.view", scope)).rejects.toBe(error);
    rpc.mockRejectedValueOnce(error);
    await expect(authorizePermission("org.members.view", scope)).rejects.toBe(error);
  });

  test("requires authority without exposing denial details", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(requirePermission("org.members.view", scope)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requirePermission("org.members.view", scope)).rejects.toThrow("Request is not authorized");
  });

  test("returns the same narrow context through the required-permission API", async () => {
    await expect(requirePermission("org.members.view", scope, { correlationId })).resolves.toEqual({
      supabase: cookieClient, identityId, scope, assurance: "aal2", correlationId,
    });
  });
});
