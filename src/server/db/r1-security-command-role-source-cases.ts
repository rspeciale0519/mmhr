import { expect } from "vitest";

import {
  activateRoleVersion,
  assignPlatformRole,
  prepareRoleVersion,
  revokePlatformRole,
} from "./r1-security-command-administration-fixtures";
import {
  asAuthenticated,
  changeIdentityStatus,
  commandInput,
  createMembership,
  createSecurityPrincipal,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  assertDeniedWithoutWrite,
  delegationRequest,
  noCeilings,
  overrideRequest,
  requirePermissionUse,
  revokeDelegation,
  setDelegation,
  setOverride,
  type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function createSourceActor(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, actor.identityId, "admin"));
  for (const permissionKey of ["platform_roles.assign", "role_versions.activate", "permissions.grant", "permissions.revoke"]) {
    await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
      ...overrideRequest(actor.identityId), permissionKey,
    }));
    await requirePermissionUse(sql, actor, permissionKey, null, true);
  }
  return actor;
}

async function allowOrganizationWorkspace(
  sql: SecurityTransaction, root: SecurityPrincipal, target: SecurityPrincipal, organizationId: string,
) {
  await asAuthenticated(sql, root, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "workspace.access", organizationId,
  }));
}

async function grantCurrentRoleCeilings(
  sql: SecurityTransaction,
  root: SecurityPrincipal,
  actor: SecurityPrincipal,
  stableKey: "staff" | "organization_admin",
  organizationIds: readonly string[],
  expiringPermission: string | null = null,
) {
  const permissions = await sql<{ key: string; platform_scope: boolean; organization_scope: boolean }[]>`
    SELECT permission.key, permission.platform_scope, permission.organization_scope
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    JOIN public.permission_definitions AS permission ON permission.key = defaults.permission_key
    WHERE role.stable_key = ${stableKey} AND role.state = 'active' AND defaults.effect = 'allow'
    ORDER BY permission.key
  `;
  expect(permissions.length).toBeGreaterThan(0);
  const [clock] = await sql<{ expires_at: string }[]>`
    SELECT (clock_timestamp() + interval '1 minute')::text AS expires_at
  `;
  for (const permission of permissions) {
    const scopes = [
      ...(stableKey === "staff" && permission.platform_scope ? [null] : []),
      ...(permission.organization_scope ? organizationIds : []),
    ];
    for (const organizationId of scopes) {
      await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
        ...delegationRequest(actor.identityId), ...noCeilings,
        permissionKey: permission.key, organizationId, canGrant: true, canRevoke: true,
        expiresAt: permission.key === expiringPermission ? clock!.expires_at : null,
      }));
    }
  }
}

async function prepareStaffAllow(sql: SecurityTransaction, permissionKey: string) {
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    SELECT 'staff', (SELECT max(version) + 1 FROM public.role_definitions WHERE stable_key = 'staff'),
      kind, 'Isolated role source boundary' FROM public.role_definitions
    WHERE stable_key = 'staff' AND state = 'active' RETURNING id
  `;
  await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    SELECT ${created!.id}::uuid, defaults.permission_key, defaults.effect
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    WHERE role.stable_key = 'staff' AND role.state = 'active'`;
  await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    VALUES (${created!.id}::uuid, ${permissionKey}, 'allow')`;
  await sql`UPDATE public.role_definitions SET state = 'approved', approved_at = clock_timestamp()
    WHERE id = ${created!.id}::uuid`;
  return created!.id;
}

async function verifyRoleExactOrganization(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const root = fixture.pair[0];
  const actor = await createSourceActor(sql, fixture);
  const target = await createSecurityPrincipal(sql);
  const [organization] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Isolated later membership', 'customer', 'active', now(), false) RETURNING id
  `;
  const laterOrganizationId = organization!.id;
  await createMembership(sql, laterOrganizationId, fixture.organizationAdmin, "organization_admin");
  await createMembership(sql, fixture.organizationId, target);
  for (const organizationId of [fixture.organizationId, laterOrganizationId]) {
    await allowOrganizationWorkspace(sql, root, target, organizationId);
  }
  const versionId = await prepareStaffAllow(sql, "org.members.view");
  await asAuthenticated(sql, root, (probe) => activateRoleVersion(probe, versionId));
  await grantCurrentRoleCeilings(sql, root, actor, "staff", [fixture.organizationId]);
  const assignment = await asAuthenticated(sql, actor, (probe) => assignPlatformRole(probe, target.identityId, "staff"));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  await requirePermissionUse(sql, target, "org.members.view", laterOrganizationId, false);
  await createMembership(sql, laterOrganizationId, target);
  await requirePermissionUse(sql, target, "workspace.access", laterOrganizationId, true);
  await requirePermissionUse(sql, target, "org.members.view", laterOrganizationId, false);
  await grantCurrentRoleCeilings(sql, root, actor, "staff", [fixture.organizationId, laterOrganizationId]);
  await requirePermissionUse(sql, target, "org.members.view", laterOrganizationId, false);
  await asAuthenticated(sql, root, (probe) => revokePlatformRole(probe, assignment.entity_id));
  await asAuthenticated(sql, actor, (probe) => assignPlatformRole(probe, target.identityId, "staff"));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  await requirePermissionUse(sql, target, "org.members.view", laterOrganizationId, true);
}

async function verifyRoleVersionAncestor(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const root = fixture.pair[0];
  const ancestor = await createSourceActor(sql, fixture);
  const descendant = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, descendant.identityId, "staff"));
  await asAuthenticated(sql, root, (probe) => setOverride(probe, {
    ...overrideRequest(descendant.identityId), permissionKey: "identity.status.change",
  }));
  await grantCurrentRoleCeilings(sql, root, ancestor, "staff", []);
  await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(ancestor.identityId), ...noCeilings,
    permissionKey: "audit.export", canGrant: true,
  }));
  const versionId = await prepareStaffAllow(sql, "audit.export");
  await asAuthenticated(sql, ancestor, (probe) => activateRoleVersion(probe, versionId));
  await requirePermissionUse(sql, descendant, "audit.export", null, true);
  await requirePermissionUse(sql, descendant, "identity.status.change", null, true);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, descendant, (probe) =>
    changeIdentityStatus(probe, ancestor.identityId, "suspended", commandInput())));
  const [relationship] = await sql<{ is_ancestor: boolean }[]>`
    SELECT mmhr_private.r1_target_is_authority_ancestor(
      ${descendant.identityId}::uuid, ${ancestor.identityId}::uuid, clock_timestamp()
    ) AS is_ancestor
  `;
  expect(relationship!.is_ancestor).toBe(true);
}

async function verifyRemovedRoleDenyGuard(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const root = fixture.pair[0];
  const actor = await createSourceActor(sql, fixture);
  const target = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, target.identityId, "staff"));
  await createMembership(sql, fixture.organizationId, target, "organization_admin");
  await allowOrganizationWorkspace(sql, root, target, fixture.organizationId);
  await grantCurrentRoleCeilings(sql, root, actor, "staff", [fixture.organizationId]);
  const deniedVersion = await prepareRoleVersion(sql, "staff", null, "org.members.view");
  await asAuthenticated(sql, root, (probe) => activateRoleVersion(probe, deniedVersion.id));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  const source = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "org.members.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  const absentVersion = await prepareRoleVersion(sql, "staff", "org.members.view");
  await asAuthenticated(sql, actor, (probe) => activateRoleVersion(probe, absentVersion.id));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  await asAuthenticated(sql, root, (probe) => revokeDelegation(probe, source.entity_id));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  const laterAbsentVersion = await prepareRoleVersion(sql, "staff");
  await asAuthenticated(sql, actor, (probe) => activateRoleVersion(probe, laterAbsentVersion.id));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "org.members.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  const rows = await sql`SELECT permission_key FROM public.role_permission_defaults
    WHERE role_definition_id IN (${absentVersion.id}::uuid, ${laterAbsentVersion.id}::uuid)
      AND permission_key = 'org.members.view'`;
  expect(rows).toHaveLength(0);
}

async function verifyExpiringRoleVersionCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createSourceActor(sql, fixture);
  await grantCurrentRoleCeilings(sql, fixture.pair[0], actor, "organization_admin",
    [fixture.organizationId], "workspace.access");
  const version = await prepareRoleVersion(sql, "organization_admin");
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => activateRoleVersion(probe, version.id)));
}

export const roleSourceCases: PermissionCase[] = [
  ["delegated platform roles do not expand to later organization memberships", verifyRoleExactOrganization],
  ["shared-version sources prevent changes to an authority ancestor", verifyRoleVersionAncestor],
  ["removed role denies retain their source guard through later absence-only versions", verifyRemovedRoleDenyGuard],
  ["an expiring shared-version source cannot supply durable organization capacity", verifyExpiringRoleVersionCapacity],
];
