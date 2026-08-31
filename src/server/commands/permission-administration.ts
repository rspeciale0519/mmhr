import "server-only";
import { z } from "zod";

import { securityUuidSchema } from "@/server/audit/security-values";
import {
  AuthorizationError, requirePermission, type AuthorizationOptions,
} from "@/server/auth/authorization";
import {
  isPermissionScopeAllowed, permissionKeySchema, type RoleKey,
} from "@/server/auth/permission-registry";

const inputSchema = z.strictObject({
  permissionKey: permissionKeySchema,
  organizationId: securityUuidSchema.nullable(),
  limit: z.int().min(1).max(100).default(50),
  afterOverrideId: securityUuidSchema.nullable().default(null),
  afterDelegationId: securityUuidSchema.nullable().default(null),
}).refine((input) => isPermissionScopeAllowed(input.permissionKey, input.organizationId === null
  ? { kind: "platform" }
  : { kind: "organization", organizationId: input.organizationId }), {
  message: "Permission scope is not supported",
});

export type PermissionAdministrationInput = z.input<typeof inputSchema>;

const roleKeys = [
  "super_admin", "admin", "staff", "organization_admin", "contributor", "viewer",
] as const satisfies readonly RoleKey[];
const platformRoleKeys: readonly RoleKey[] = ["super_admin", "admin", "staff"];
const effectSchema = z.enum(["allow", "deny"]);
const recordMetadata = {
  record_id: securityUuidSchema,
  identity_id: securityUuidSchema,
  permission_key: permissionKeySchema,
  organization_id: securityUuidSchema.nullable(),
  state: z.enum(["active", "revoked"]),
  expires_at_epoch: z.number().refine((value) => Number.isFinite(new Date(value * 1000).getTime())).nullable(),
};

const overrideSchema = z.strictObject({
  ...recordMetadata,
  effect: effectSchema,
  source_delegation_id: securityUuidSchema.nullable(),
}).transform((row) => ({
  recordId: row.record_id, identityId: row.identity_id, permissionKey: row.permission_key,
  organizationId: row.organization_id, state: row.state, effect: row.effect,
  sourceDelegationId: row.source_delegation_id, expiresAtEpoch: row.expires_at_epoch,
}));

const delegationSchema = z.strictObject({
  ...recordMetadata,
  parent_grant_id: securityUuidSchema.nullable(),
  can_view: z.boolean(), can_grant: z.boolean(), can_revoke: z.boolean(), can_delegate: z.boolean(),
}).refine((row) => row.parent_grant_id !== row.record_id).transform((row) => ({
  recordId: row.record_id, identityId: row.identity_id, permissionKey: row.permission_key,
  organizationId: row.organization_id, state: row.state, parentGrantId: row.parent_grant_id,
  canView: row.can_view, canGrant: row.can_grant, canRevoke: row.can_revoke, canDelegate: row.can_delegate,
  expiresAtEpoch: row.expires_at_epoch,
}));

const roleSchema = z.strictObject({
  stable_key: z.enum(roleKeys),
  version: z.int().min(1).max(2_147_483_647),
  effect: effectSchema,
}).transform((row) => ({ stableKey: row.stable_key, version: row.version, effect: row.effect }));

const pageSchema = z.strictObject({
  overrides: z.array(overrideSchema).max(100),
  delegations: z.array(delegationSchema).max(100),
  roles: z.array(roleSchema).max(roleKeys.length),
});

export type PermissionOverrideSummary = z.output<typeof overrideSchema>;
export type PermissionDelegationSummary = z.output<typeof delegationSchema>;
export type PermissionRoleSummary = z.output<typeof roleSchema>;
export type PermissionAdministrationPage = z.output<typeof pageSchema> & {
  nextPage: PermissionAdministrationInput | null;
};

export class PermissionAdministrationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Permission read input is invalid" : "Permission information could not be read");
    this.name = "PermissionAdministrationError";
  }
}

type ScopedRecord = Pick<PermissionOverrideSummary, "recordId" | "permissionKey" | "organizationId">;

function matchesPage(rows: ScopedRecord[], input: z.output<typeof inputSchema>, afterId: string | null): boolean {
  if (rows.length > input.limit) return false;
  let previousId = afterId;
  for (const row of rows) {
    if (row.permissionKey !== input.permissionKey || row.organizationId !== input.organizationId) return false;
    // Lowercase canonical UUID text has the same ordering as PostgreSQL UUIDs.
    if (previousId !== null && row.recordId <= previousId) return false;
    previousId = row.recordId;
  }
  return true;
}

/**
 * Options come from server composition roots, not request payloads. The caller's
 * platform permissions.view permits this command, not arbitrary metadata access.
 * SQL rechecks its independent can_view ceiling for the exact key and scope.
 * Stored active states and capability flags do not prove effective authority.
 */
export async function readPermissionAdministration(
  input: PermissionAdministrationInput,
  options: AuthorizationOptions = {},
): Promise<PermissionAdministrationPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PermissionAdministrationError("INVALID_INPUT");
  let context;
  try {
    context = await requirePermission("permissions.view", { kind: "platform" }, options);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new PermissionAdministrationError("UNAVAILABLE");
  }
  let response;
  try {
    response = await context.supabase.rpc("mmhr_read_permission_administration", {
      permission_key: parsed.data.permissionKey,
      organization_id: parsed.data.organizationId,
      limit_count: parsed.data.limit,
      after_override_id: parsed.data.afterOverrideId,
      after_delegation_id: parsed.data.afterDelegationId,
    });
  } catch {
    throw new PermissionAdministrationError("UNAVAILABLE");
  }
  if (!response || response.error) throw new PermissionAdministrationError("REJECTED");
  const result = pageSchema.safeParse(response.data);
  if (!result.success) throw new PermissionAdministrationError("INVALID_RESPONSE");
  const { overrides, delegations, roles } = result.data;
  if (
    !matchesPage(overrides, parsed.data, parsed.data.afterOverrideId) ||
    !matchesPage(delegations, parsed.data, parsed.data.afterDelegationId) ||
    new Set(roles.map((role) => role.stableKey)).size !== roles.length ||
    (parsed.data.organizationId === null && roles.some((role) => !platformRoleKeys.includes(role.stableKey)))
  ) throw new PermissionAdministrationError("INVALID_RESPONSE");

  // SQL has no lookahead. A full collection can need one final empty read.
  // Preserve both high-water cursors while either collection has another page.
  const nextPage = overrides.length === parsed.data.limit || delegations.length === parsed.data.limit
    ? {
        ...parsed.data,
        afterOverrideId: overrides.at(-1)?.recordId ?? parsed.data.afterOverrideId,
        afterDelegationId: delegations.at(-1)?.recordId ?? parsed.data.afterDelegationId,
      }
    : null;
  return { overrides, delegations, roles, nextPage };
}
