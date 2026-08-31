import { expect } from "vitest";

import {
  activateRoleVersion,
  assignPlatformRole,
  prepareRoleVersion,
  revokePlatformRole,
} from "./r1-security-command-administration-fixtures";
import {
  asAuthenticated,
  commandInput,
  createMembership,
  createSecurityPrincipal,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  delegationRequest,
  noCeilings,
  overrideRequest,
  requirePermissionUse,
  requireReceiptAudit,
  revokeDelegation,
  revokeOverride,
  setDelegation,
  setOverride,
} from "./r1-security-command-permission-fixtures";
import type { RoleSourceLoss } from "./r1-security-command-role-lifetime-cases";

async function grantRoleRevocationCeilings(
  sql: SecurityTransaction,
  root: SecurityPrincipal,
  actor: SecurityPrincipal,
  organizationId: string,
) {
  const permissions = await sql<{ key: string; platform_scope: boolean; organization_scope: boolean }[]>`
    SELECT permission.key, permission.platform_scope, permission.organization_scope
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    JOIN public.permission_definitions AS permission ON permission.key = defaults.permission_key
    WHERE role.stable_key = 'staff' AND role.state = 'active' AND defaults.effect = 'allow'
    ORDER BY permission.key
  `;
  expect(permissions.length).toBeGreaterThan(0);
  for (const permission of permissions) {
    for (const scope of [
      ...(permission.platform_scope ? [null] : []),
      ...(permission.organization_scope ? [organizationId] : []),
    ]) {
      await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
        ...delegationRequest(actor.identityId), ...noCeilings,
        permissionKey: permission.key, organizationId: scope, canRevoke: true,
      }));
    }
  }
}

async function prepareFreshAdminAllow(sql: SecurityTransaction) {
  const [role] = await sql<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    SELECT 'admin', (SELECT max(version) + 1 FROM public.role_definitions WHERE stable_key = 'admin'),
      kind, 'Isolated fresh role grant' FROM public.role_definitions
    WHERE stable_key = 'admin' AND state = 'active' RETURNING id
  `;
  await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    SELECT ${role!.id}::uuid, defaults.permission_key, defaults.effect
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS active_version ON active_version.id = defaults.role_definition_id
    WHERE active_version.stable_key = 'admin' AND active_version.state = 'active'`;
  await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    VALUES (${role!.id}::uuid, 'org.members.view', 'allow')`;
  await sql`UPDATE public.role_definitions SET state = 'approved', approved_at = clock_timestamp()
    WHERE id = ${role!.id}::uuid`;
  return role!.id;
}

export async function verifyRoleRevocationSourceLifetime(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  loss: RoleSourceLoss,
) {
  const root = fixture.pair[0];
  const actor = await createSecurityPrincipal(sql);
  const target = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, actor.identityId, "admin"));
  for (const permissionKey of ["platform_roles.revoke", "permissions.grant", "permissions.revoke"]) {
    await asAuthenticated(sql, root, (probe) => setOverride(probe, {
      ...overrideRequest(actor.identityId), permissionKey,
    }));
    await requirePermissionUse(sql, actor, permissionKey, null, true);
  }
  const assignment = await asAuthenticated(sql, root, (probe) =>
    assignPlatformRole(probe, target.identityId, "staff"));
  await createMembership(sql, fixture.organizationId, target, "organization_admin");
  await asAuthenticated(sql, root, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "workspace.access", organizationId: fixture.organizationId,
  }));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  const deniedVersion = await prepareRoleVersion(sql, "staff", null, "org.members.view");
  await asAuthenticated(sql, root, (probe) => activateRoleVersion(probe, deniedVersion.id));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  await grantRoleRevocationCeilings(sql, root, actor, fixture.organizationId);
  const [clock] = await sql<{ expires_at: string }[]>`
    SELECT (clock_timestamp() + interval '8 seconds')::text AS expires_at
  `;
  const expiresAt = loss === "expired" ? clock!.expires_at : null;
  const originalSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "org.members.view", organizationId: fixture.organizationId, canGrant: true, expiresAt,
  }));
  const revocationInput = commandInput();
  const revocation = await asAuthenticated(sql, actor, (probe) =>
    revokePlatformRole(probe, assignment.entity_id, revocationInput));
  await requireReceiptAudit(sql, actor, revocation, revocationInput, "platform_role.revoke");
  await requirePermissionUse(sql, target, "admin.access", null, false);
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);

  if (loss === "revoked") {
    await asAuthenticated(sql, root, (probe) => revokeDelegation(probe, originalSource.entity_id));
  } else {
    // Exercise real expiry. Rewriting the source would bypass its immutability.
    await sql`SELECT pg_sleep(least(10.0, greatest(0,
      extract(epoch FROM (${expiresAt}::timestamptz - clock_timestamp()))) + 0.05)::double precision)`;
  }
  const [source] = await sql<{ state: string; has_expired: boolean; valid: boolean }[]>`
    SELECT state, coalesce(expires_at <= clock_timestamp(), false) AS has_expired,
      mmhr_private.r1_delegation_is_valid(id, 'org.members.view', ${fixture.organizationId}::uuid,
        'grant', clock_timestamp(), false) AS valid
    FROM public.admin_delegation_grants WHERE id = ${originalSource.entity_id}::uuid
  `;
  expect(source).toEqual({ state: loss === "revoked" ? "revoked" : "active", has_expired: loss === "expired", valid: false });
  expect(await asAuthenticated(sql, actor, (probe) =>
    revokePlatformRole(probe, assignment.entity_id, revocationInput))).toEqual(revocation);
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, target.identityId, "admin"));
  await requirePermissionUse(sql, target, "admin.access", null, true);
  const fallback = await asAuthenticated(sql, target, (probe) => probe`
    SELECT * FROM public.mmhr_authorize('org.members.view', ${fixture.organizationId}::uuid)
  `);
  expect(fallback, `A later role without this key must not bypass the ${loss} deny-removal source`).toHaveLength(0);

  const replacementSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "org.members.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  expect(replacementSource.entity_id).not.toBe(originalSource.entity_id);
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  const explicitAllow = await asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "org.members.view", organizationId: fixture.organizationId,
    sourceDelegationId: replacementSource.entity_id,
  }));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  await asAuthenticated(sql, root, (probe) => revokeOverride(probe, explicitAllow.entity_id, "allow"));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  const freshRoleId = await prepareFreshAdminAllow(sql);
  await asAuthenticated(sql, root, (probe) => activateRoleVersion(probe, freshRoleId));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  await requireReceiptAudit(sql, actor, revocation, revocationInput, "platform_role.revoke");
  const records = await sql<{
    role_definition_id: string; actor_identity_id: string; source_delegation_id: string;
    permission_key: string; organization_id: string; authority_kind: string;
  }[]>`
    SELECT authority.role_definition_id, authority.actor_identity_id, authority.authority_kind,
      evidence.source_delegation_id, evidence.permission_key, evidence.organization_id
    FROM public.role_revocation_authorities AS authority
    JOIN public.permission_authority_sources AS evidence ON evidence.role_revocation_id = authority.id
      AND evidence.role_authority_id IS NULL AND evidence.deny_removal_id IS NULL AND evidence.purpose = 'deny_removal'
    WHERE authority.platform_assignment_id = ${assignment.entity_id}::uuid
      AND authority.correlation_id = ${revocationInput.correlationId}::uuid
  `;
  expect(records).toEqual([{
    role_definition_id: deniedVersion.id, actor_identity_id: actor.identityId, authority_kind: "delegated",
    source_delegation_id: originalSource.entity_id, permission_key: "org.members.view", organization_id: fixture.organizationId,
  }]);
}
