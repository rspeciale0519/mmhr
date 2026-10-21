import "server-only";
import { z } from "zod";

import {
  parseSecurityCommandReceipt, type SecurityCommandReceipt,
} from "@/server/audit/security-receipt";
import {
  AuthorizationError, requirePermission, type AuthorizationOptions,
} from "@/server/auth/authorization";
import { type PermissionKey, type PermissionScope } from "@/server/auth/permission-registry";
import * as inputs from "./security-inputs";

const rpcActions = {
  mmhr_assign_platform_role: "platform_role.assign",
  mmhr_revoke_platform_role: "platform_role.revoke",
  mmhr_activate_role_version: "role_version.activate",
  mmhr_set_permission_override: "permission_override.set",
  mmhr_revoke_permission_override: "permission_override.revoke",
  mmhr_set_delegation: "delegation.set",
  mmhr_revoke_delegation: "delegation.revoke",
  mmhr_change_identity_status: "identity.status.change",
  mmhr_change_organization_status: "organization.status.change",
  mmhr_change_organization_type: "organization.type.change",
  mmhr_change_membership_status: "membership.status.change",
  mmhr_change_membership_role: "membership.role.change",
  mmhr_grant_portal_access: "portal_access.grant",
  mmhr_revoke_portal_access: "portal_access.revoke",
} as const;

type CommandMetadata = { reason: string; idempotencyKey: string };
type CommandCall = {
  rpc: keyof typeof rpcActions;
  permission: PermissionKey;
  scope: PermissionScope;
  args: Record<string, string | boolean | null>;
  entityId?: string;
};

export class SecurityCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Security command input is invalid" : "Security command could not be completed");
    this.name = "SecurityCommandError";
  }
}

const platformScope: PermissionScope = { kind: "platform" };
const organizationScope = (organizationId: string): PermissionScope => ({ kind: "organization", organizationId });

/**
 * Server composition roots supply options, never request payloads. HTTP origin
 * and method guards belong to entry points. SQL rechecks current authority and
 * writes the mutation, audit event, and idempotent receipt in one transaction.
 */
async function execute<T extends CommandMetadata>(
  schema: z.ZodType<T>,
  input: unknown,
  describe: (input: T) => CommandCall,
  options: AuthorizationOptions,
): Promise<SecurityCommandReceipt> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new SecurityCommandError("INVALID_INPUT");
  const command = describe(parsed.data);
  let context;
  try {
    context = await requirePermission(command.permission, command.scope, options);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new SecurityCommandError("UNAVAILABLE");
  }
  let response;
  try {
    response = await context.supabase.rpc(command.rpc, {
      ...command.args,
      reason: parsed.data.reason,
      correlation_id: context.correlationId,
      idempotency_key: parsed.data.idempotencyKey,
    });
  } catch {
    // A transport failure can leave a committed transaction with an unknown
    // response. Do not replay it with a new key or expose provider error text.
    throw new SecurityCommandError("UNAVAILABLE");
  }
  if (!response || response.error) throw new SecurityCommandError("REJECTED");
  const receipt = parseSecurityCommandReceipt(response.data, rpcActions[command.rpc], command.entityId);
  if (!receipt) throw new SecurityCommandError("INVALID_RESPONSE");
  return receipt;
}

export function assignPlatformRole(input: inputs.AssignPlatformRoleInput, options: AuthorizationOptions = {}) {
  return execute(inputs.assignPlatformRoleSchema, input, (value) => ({
    rpc: "mmhr_assign_platform_role", permission: "platform_roles.assign", scope: platformScope,
    args: { target_identity_id: value.targetIdentityId, role_key: value.roleKey },
  }), options);
}

export function revokePlatformRole(input: inputs.RevokePlatformRoleInput, options: AuthorizationOptions = {}) {
  return execute(inputs.revokePlatformRoleSchema, input, (value) => ({
    rpc: "mmhr_revoke_platform_role", permission: "platform_roles.revoke", scope: platformScope,
    args: { assignment_id: value.assignmentId }, entityId: value.assignmentId,
  }), options);
}

export function activateRoleVersion(input: inputs.ActivateRoleVersionInput, options: AuthorizationOptions = {}) {
  return execute(inputs.activateRoleVersionSchema, input, (value) => ({
    rpc: "mmhr_activate_role_version", permission: "role_versions.activate", scope: platformScope,
    args: { role_definition_id: value.roleDefinitionId }, entityId: value.roleDefinitionId,
  }), options);
}

export function setPermissionOverride(input: inputs.SetPermissionOverrideInput, options: AuthorizationOptions = {}) {
  return execute(inputs.setPermissionOverrideSchema, input, (value) => ({
    rpc: "mmhr_set_permission_override",
    permission: value.effect === "allow" ? "permissions.grant" : "permissions.revoke",
    scope: platformScope,
    args: {
      target_identity_id: value.targetIdentityId, permission_key: value.permissionKey,
      organization_id: value.organizationId, effect: value.effect,
      expires_at: value.expiresAt, source_delegation_id: value.sourceDelegationId,
    },
  }), options);
}

export function revokePermissionOverride(input: inputs.RevokePermissionOverrideInput, options: AuthorizationOptions = {}) {
  return execute(inputs.revokePermissionOverrideSchema, input, (value) => ({
    rpc: "mmhr_revoke_permission_override",
    permission: value.expectedEffect === "allow" ? "permissions.revoke" : "permissions.grant",
    scope: platformScope,
    args: { override_id: value.overrideId, expected_effect: value.expectedEffect }, entityId: value.overrideId,
  }), options);
}

export function setDelegation(input: inputs.SetDelegationInput, options: AuthorizationOptions = {}) {
  return execute(inputs.setDelegationSchema, input, (value) => ({
    rpc: "mmhr_set_delegation", permission: "permissions.delegate", scope: platformScope,
    args: {
      grantee_identity_id: value.granteeIdentityId, permission_key: value.permissionKey,
      organization_id: value.organizationId, can_view: value.canView, can_grant: value.canGrant,
      can_revoke: value.canRevoke, can_delegate: value.canDelegate,
      expires_at: value.expiresAt, parent_grant_id: value.parentGrantId,
    },
  }), options);
}

export function revokeDelegation(input: inputs.RevokeDelegationInput, options: AuthorizationOptions = {}) {
  return execute(inputs.revokeDelegationSchema, input, (value) => ({
    rpc: "mmhr_revoke_delegation", permission: "permissions.revoke", scope: platformScope,
    args: { grant_id: value.grantId }, entityId: value.grantId,
  }), options);
}

export function changeIdentityStatus(input: inputs.ChangeIdentityStatusInput, options: AuthorizationOptions = {}) {
  return execute(inputs.changeIdentityStatusSchema, input, (value) => ({
    rpc: "mmhr_change_identity_status", permission: "identity.status.change", scope: platformScope,
    args: { target_identity_id: value.targetIdentityId, status: value.status }, entityId: value.targetIdentityId,
  }), options);
}

export function changeOrganizationStatus(input: inputs.ChangeOrganizationStatusInput, options: AuthorizationOptions = {}) {
  return execute(inputs.changeOrganizationStatusSchema, input, (value) => ({
    rpc: "mmhr_change_organization_status", permission: "org.status.change", scope: platformScope,
    args: { organization_id: value.organizationId, status: value.status }, entityId: value.organizationId,
  }), options);
}

export function changeOrganizationType(input: inputs.ChangeOrganizationTypeInput, options: AuthorizationOptions = {}) {
  return execute(inputs.changeOrganizationTypeSchema, input, (value) => ({
    rpc: "mmhr_change_organization_type", permission: "org.type.change", scope: platformScope,
    args: { organization_id: value.organizationId, type: value.type }, entityId: value.organizationId,
  }), options);
}

export function changeMembershipStatus(input: inputs.ChangeMembershipStatusInput, options: AuthorizationOptions = {}) {
  return execute(inputs.changeMembershipStatusSchema, input, (value) => ({
    rpc: "mmhr_change_membership_status",
    permission: value.status === "revoked" ? "org.members.revoke" : "org.members.status.change",
    scope: organizationScope(value.organizationId),
    args: { organization_id: value.organizationId, membership_id: value.membershipId, status: value.status },
    entityId: value.membershipId,
  }), options);
}

export function changeMembershipRole(input: inputs.ChangeMembershipRoleInput, options: AuthorizationOptions = {}) {
  return execute(inputs.changeMembershipRoleSchema, input, (value) => ({
    rpc: "mmhr_change_membership_role", permission: "org.members.change_role",
    scope: organizationScope(value.organizationId),
    args: { organization_id: value.organizationId, membership_id: value.membershipId, role_key: value.roleKey },
    entityId: value.membershipId,
  }), options);
}

export function grantPortalAccess(input: inputs.GrantPortalAccessInput, options: AuthorizationOptions = {}) {
  return execute(inputs.grantPortalAccessSchema, input, (value) => ({
    rpc: "mmhr_grant_portal_access", permission: "portal.access.grant",
    scope: organizationScope(value.organizationId),
    args: { organization_id: value.organizationId, portal: value.portal },
  }), options);
}

export function revokePortalAccess(input: inputs.RevokePortalAccessInput, options: AuthorizationOptions = {}) {
  return execute(inputs.revokePortalAccessSchema, input, (value) => ({
    rpc: "mmhr_revoke_portal_access", permission: "portal.access.revoke",
    scope: organizationScope(value.organizationId),
    args: { organization_id: value.organizationId, grant_id: value.grantId }, entityId: value.grantId,
  }), options);
}
