import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient,
} from "@/server/auth/authorization";
import type { SecurityCommandReceipt } from "@/server/audit/security-receipt";
import * as commands from "./security";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/authorization", () => ({
  requirePermission: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor() { super("Request is not authorized"); }
  },
}));

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const organizationId = "abcdef01-2345-4678-9abc-def012345678";
const recordId = "33333333-3333-4333-8333-333333333333";
const receiptId = "44444444-4444-4444-8444-444444444444";
const correlationId = "abcdefab-1234-4567-8abc-def012345678";
const idempotencyKey = "abcdefab-2222-4567-8abc-def012345678";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const options = { supabase, correlationId };
const metadata = { reason: "  Approved access review  ", idempotencyKey: idempotencyKey.toUpperCase() };
const platform = { kind: "platform" };
const organization = { kind: "organization", organizationId };
const context: AuthorizationContext = {
  supabase, correlationId, identityId: actorId, scope: { kind: "platform" }, assurance: "aal2",
};

type Case = {
  name: string; invoke: () => Promise<SecurityCommandReceipt>;
  rpc: string; permission: string; scope: object; args: object;
  action: SecurityCommandReceipt["action"]; entityId: string;
};

const cases: Case[] = [
  {
    name: "assign a platform role", invoke: () => commands.assignPlatformRole({ ...metadata, targetIdentityId: targetId, roleKey: "staff" }, options),
    rpc: "mmhr_assign_platform_role", permission: "platform_roles.assign", scope: platform,
    args: { target_identity_id: targetId, role_key: "staff" }, action: "platform_role.assign", entityId: recordId,
  },
  {
    name: "revoke a platform role", invoke: () => commands.revokePlatformRole({ ...metadata, assignmentId: recordId }, options),
    rpc: "mmhr_revoke_platform_role", permission: "platform_roles.revoke", scope: platform,
    args: { assignment_id: recordId }, action: "platform_role.revoke", entityId: recordId,
  },
  {
    name: "activate a role version", invoke: () => commands.activateRoleVersion({ ...metadata, roleDefinitionId: recordId }, options),
    rpc: "mmhr_activate_role_version", permission: "role_versions.activate", scope: platform,
    args: { role_definition_id: recordId }, action: "role_version.activate", entityId: recordId,
  },
  ...(["allow", "deny"] as const).map((effect): Case => ({
    name: `set an ${effect} override`,
    invoke: () => commands.setPermissionOverride({
      ...metadata, targetIdentityId: targetId, permissionKey: "org.name.read", organizationId,
      effect, expiresAt: "2027-08-30T14:00:00-04:00", sourceDelegationId: recordId,
    }, options),
    rpc: "mmhr_set_permission_override", permission: effect === "allow" ? "permissions.grant" : "permissions.revoke",
    scope: platform, args: {
      target_identity_id: targetId, permission_key: "org.name.read", organization_id: organizationId,
      effect, expires_at: "2027-08-30T18:00:00.000Z", source_delegation_id: recordId,
    }, action: "permission_override.set", entityId: recordId,
  })),
  ...(["allow", "deny"] as const).map((expectedEffect): Case => ({
    name: `revoke an ${expectedEffect} override`,
    invoke: () => commands.revokePermissionOverride({ ...metadata, overrideId: recordId, expectedEffect }, options),
    rpc: "mmhr_revoke_permission_override", permission: expectedEffect === "allow" ? "permissions.revoke" : "permissions.grant",
    scope: platform, args: { override_id: recordId, expected_effect: expectedEffect },
    action: "permission_override.revoke", entityId: recordId,
  })),
  {
    name: "set independent delegation capabilities", invoke: () => commands.setDelegation({
      ...metadata, granteeIdentityId: targetId, permissionKey: "org.name.read", organizationId,
      canView: true, canGrant: false, canRevoke: true, canDelegate: false, expiresAt: null, parentGrantId: recordId,
    }, options),
    rpc: "mmhr_set_delegation", permission: "permissions.delegate", scope: platform,
    args: {
      grantee_identity_id: targetId, permission_key: "org.name.read", organization_id: organizationId,
      can_view: true, can_grant: false, can_revoke: true, can_delegate: false, expires_at: null, parent_grant_id: recordId,
    }, action: "delegation.set", entityId: recordId,
  },
  {
    name: "revoke a delegation", invoke: () => commands.revokeDelegation({ ...metadata, grantId: recordId }, options),
    rpc: "mmhr_revoke_delegation", permission: "permissions.revoke", scope: platform,
    args: { grant_id: recordId }, action: "delegation.revoke", entityId: recordId,
  },
  {
    name: "change identity status", invoke: () => commands.changeIdentityStatus({ ...metadata, targetIdentityId: targetId, status: "suspended" }, options),
    rpc: "mmhr_change_identity_status", permission: "identity.status.change", scope: platform,
    args: { target_identity_id: targetId, status: "suspended" }, action: "identity.status.change", entityId: targetId,
  },
  {
    name: "change organization status", invoke: () => commands.changeOrganizationStatus({ ...metadata, organizationId, status: "archived" }, options),
    rpc: "mmhr_change_organization_status", permission: "org.status.change", scope: platform,
    args: { organization_id: organizationId, status: "archived" }, action: "organization.status.change", entityId: organizationId,
  },
  {
    name: "change organization type", invoke: () => commands.changeOrganizationType({ ...metadata, organizationId, type: "vendor" }, options),
    rpc: "mmhr_change_organization_type", permission: "org.type.change", scope: platform,
    args: { organization_id: organizationId, type: "vendor" }, action: "organization.type.change", entityId: organizationId,
  },
  ...(["active", "suspended", "revoked"] as const).map((status): Case => ({
    name: `change membership status to ${status}`,
    invoke: () => commands.changeMembershipStatus({ ...metadata, organizationId, membershipId: recordId, status }, options),
    rpc: "mmhr_change_membership_status", permission: status === "revoked" ? "org.members.revoke" : "org.members.status.change",
    scope: organization, args: { organization_id: organizationId, membership_id: recordId, status },
    action: "membership.status.change", entityId: recordId,
  })),
  {
    name: "change a membership role", invoke: () => commands.changeMembershipRole({ ...metadata, organizationId, membershipId: recordId, roleKey: "viewer" }, options),
    rpc: "mmhr_change_membership_role", permission: "org.members.change_role", scope: organization,
    args: { organization_id: organizationId, membership_id: recordId, role_key: "viewer" },
    action: "membership.role.change", entityId: recordId,
  },
  {
    name: "grant portal access", invoke: () => commands.grantPortalAccess({ ...metadata, organizationId, portal: "customer" }, options),
    rpc: "mmhr_grant_portal_access", permission: "portal.access.grant", scope: organization,
    args: { organization_id: organizationId, portal: "customer" }, action: "portal_access.grant", entityId: recordId,
  },
  {
    name: "revoke portal access", invoke: () => commands.revokePortalAccess({ ...metadata, organizationId, grantId: recordId }, options),
    rpc: "mmhr_revoke_portal_access", permission: "portal.access.revoke", scope: organization,
    args: { organization_id: organizationId, grant_id: recordId }, action: "portal_access.revoke", entityId: recordId,
  },
];

const input = { ...metadata, targetIdentityId: targetId, roleKey: "staff" as const };
const receipt = { receipt_id: receiptId, entity_id: recordId, action: "platform_role.assign" };

describe("typed security commands", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset().mockResolvedValue({ data: receipt, error: null });
  });

  test.each(cases)("uses fixed permission, scope, and arguments to $name", async (entry) => {
    rpc.mockResolvedValue({ data: { receipt_id: receiptId, entity_id: entry.entityId, action: entry.action }, error: null });
    await expect(entry.invoke()).resolves.toEqual({ receiptId, entityId: entry.entityId, action: entry.action });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(entry.permission, entry.scope, options);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(entry.rpc, {
      ...entry.args, reason: "Approved access review", correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("actor_id");
  });

  test.each(cases)("does not invoke $name without current permission", async (entry) => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(entry.invoke()).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, [], {}, { ...input, actorId }, { ...input, actor_id: actorId },
    { ...input, supabase }, { ...input, correlationId }, { ...input, idempotencyKey: "invalid" },
    { ...input, reason: "" }, { ...input, reason: "password=not-for-storage" },
    { ...input, targetIdentityId: "invalid" }, { ...input, roleKey: "organization_admin" },
  ])("rejects malformed or extra input fields before authorization: %j", async (value) => {
    await expect(commands.assignPlatformRole(value as typeof input, options)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("uses only the authorized request client", async () => {
    const requestRpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
    vi.mocked(requirePermission).mockResolvedValue({ ...context, supabase: { rpc: requestRpc } as unknown as RequestSupabaseClient });
    await commands.assignPlatformRole(input, options);
    expect(requestRpc).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns the same durable receipt for a repeated successful request without a client retry", async () => {
    const first = await commands.assignPlatformRole(input, options);
    const second = await commands.assignPlatformRole(input, options);
    expect(first).toEqual(second);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  test("passes a timestamp boundary to SQL without using the application clock", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Expired permission" } });
    await expect(commands.setPermissionOverride({
      ...metadata, targetIdentityId: targetId, permissionKey: "workspace.access", organizationId: null,
      effect: "allow", expiresAt: "2000-01-01T00:00:00Z", sourceDelegationId: null,
    }, options)).rejects.toMatchObject({ code: "REJECTED" });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1].expires_at).toBe("2000-01-01T00:00:00.000Z");
  });

  test("sanitizes unexpected authorization errors", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("private provider detail"));
    const request = commands.assignPlatformRole(input, options);
    await expect(request).rejects.toMatchObject({
      code: "UNAVAILABLE", message: "Security command could not be completed",
    });
    await expect(request).rejects.not.toHaveProperty("cause");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("sanitizes transport errors and does not retry an uncertain mutation", async () => {
    rpc.mockRejectedValue(new Error("private connection detail"));
    const request = commands.assignPlatformRole(input, options);
    await expect(request).rejects.toMatchObject({
      code: "UNAVAILABLE", message: "Security command could not be completed",
    });
    await expect(request).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("does not trust data returned alongside a database error", async () => {
    rpc.mockResolvedValue({ data: receipt, error: { message: "private SQL detail", code: "23505" } });
    const request = commands.assignPlatformRole(input, options);
    await expect(request).rejects.toMatchObject({
      code: "REJECTED", message: "Security command could not be completed",
    });
    await expect(request).rejects.not.toHaveProperty("cause");
    expect(rpc).toHaveBeenCalledOnce();
  });

  test.each([
    null, undefined, [], [receipt], {}, { ...receipt, receipt_id: "invalid" },
    { ...receipt, entity_id: "invalid" }, { ...receipt, action: "platform_role.revoke" },
    { ...receipt, reason: "private text" }, { ...receipt, actor_identity_id: actorId },
  ])("rejects malformed or mismatched receipts: %j", async (value) => {
    rpc.mockResolvedValue({ data: value, error: null });
    await expect(commands.assignPlatformRole(input, options)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("rejects a receipt for another known target", async () => {
    rpc.mockResolvedValue({ data: { ...receipt, action: "identity.status.change" }, error: null });
    await expect(commands.changeIdentityStatus({ ...metadata, targetIdentityId: targetId, status: "active" }, options))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
