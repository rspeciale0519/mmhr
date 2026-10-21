import "server-only";
import { z } from "zod";

import {
  securityReasonSchema, securityTimestampSchema, securityUuidSchema,
} from "@/server/audit/security-values";
import {
  isPermissionScopeAllowed, permissionKeySchema,
  type PermissionKey,
} from "@/server/auth/permission-registry";

const metadata = {
  reason: securityReasonSchema,
  idempotencyKey: securityUuidSchema,
};
const status = z.enum(["active", "suspended", "archived"]);
const effect = z.enum(["allow", "deny"]);
const organizationId = securityUuidSchema;

function hasSupportedTargetScope(input: { permissionKey: PermissionKey; organizationId: string | null }) {
  return isPermissionScopeAllowed(input.permissionKey, input.organizationId === null
    ? { kind: "platform" }
    : { kind: "organization", organizationId: input.organizationId });
}

export const assignPlatformRoleSchema = z.strictObject({
  ...metadata, targetIdentityId: securityUuidSchema,
  roleKey: z.enum(["super_admin", "admin", "staff"]),
});
export type AssignPlatformRoleInput = z.input<typeof assignPlatformRoleSchema>;

export const revokePlatformRoleSchema = z.strictObject({ ...metadata, assignmentId: securityUuidSchema });
export type RevokePlatformRoleInput = z.input<typeof revokePlatformRoleSchema>;

export const activateRoleVersionSchema = z.strictObject({ ...metadata, roleDefinitionId: securityUuidSchema });
export type ActivateRoleVersionInput = z.input<typeof activateRoleVersionSchema>;

export const setPermissionOverrideSchema = z.strictObject({
  ...metadata, targetIdentityId: securityUuidSchema, permissionKey: permissionKeySchema,
  organizationId: organizationId.nullable(), effect,
  expiresAt: securityTimestampSchema.nullable(), sourceDelegationId: securityUuidSchema.nullable(),
}).refine(hasSupportedTargetScope, { message: "Permission scope is not supported" });
export type SetPermissionOverrideInput = z.input<typeof setPermissionOverrideSchema>;

export const revokePermissionOverrideSchema = z.strictObject({
  ...metadata, overrideId: securityUuidSchema, expectedEffect: effect,
});
export type RevokePermissionOverrideInput = z.input<typeof revokePermissionOverrideSchema>;

export const setDelegationSchema = z.strictObject({
  ...metadata, granteeIdentityId: securityUuidSchema, permissionKey: permissionKeySchema,
  organizationId: organizationId.nullable(), canView: z.boolean(), canGrant: z.boolean(),
  canRevoke: z.boolean(), canDelegate: z.boolean(), expiresAt: securityTimestampSchema.nullable(),
  parentGrantId: securityUuidSchema.nullable(),
}).refine(hasSupportedTargetScope, { message: "Permission scope is not supported" });
export type SetDelegationInput = z.input<typeof setDelegationSchema>;

export const revokeDelegationSchema = z.strictObject({ ...metadata, grantId: securityUuidSchema });
export type RevokeDelegationInput = z.input<typeof revokeDelegationSchema>;

export const changeIdentityStatusSchema = z.strictObject({ ...metadata, targetIdentityId: securityUuidSchema, status });
export type ChangeIdentityStatusInput = z.input<typeof changeIdentityStatusSchema>;

export const changeOrganizationStatusSchema = z.strictObject({ ...metadata, organizationId, status });
export type ChangeOrganizationStatusInput = z.input<typeof changeOrganizationStatusSchema>;

export const changeOrganizationTypeSchema = z.strictObject({
  ...metadata, organizationId, type: z.enum(["internal", "customer", "vendor"]),
});
export type ChangeOrganizationTypeInput = z.input<typeof changeOrganizationTypeSchema>;

export const changeMembershipStatusSchema = z.strictObject({
  ...metadata, organizationId, membershipId: securityUuidSchema,
  status: z.enum(["active", "suspended", "revoked"]),
});
export type ChangeMembershipStatusInput = z.input<typeof changeMembershipStatusSchema>;

export const changeMembershipRoleSchema = z.strictObject({
  ...metadata, organizationId, membershipId: securityUuidSchema,
  roleKey: z.enum(["organization_admin", "contributor", "viewer"]),
});
export type ChangeMembershipRoleInput = z.input<typeof changeMembershipRoleSchema>;

export const grantPortalAccessSchema = z.strictObject({
  ...metadata, organizationId, portal: z.enum(["customer", "vendor"]),
});
export type GrantPortalAccessInput = z.input<typeof grantPortalAccessSchema>;

export const revokePortalAccessSchema = z.strictObject({ ...metadata, organizationId, grantId: securityUuidSchema });
export type RevokePortalAccessInput = z.input<typeof revokePortalAccessSchema>;
