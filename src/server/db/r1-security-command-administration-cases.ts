import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asAuthenticated, commandInput, createMembership, createSecurityPrincipal, invalidInput, securitySnapshot,
  type SecurityCommandFixture, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  activateRoleVersion, assignPlatformRole, changeMembershipRole, changeOrganizationStatus,
  changeOrganizationType, grantPortalAccess, prepareRoleVersion, revokePlatformRole, revokePortalAccess,
} from "./r1-security-command-administration-fixtures";
import {
  assertDeniedWithoutWrite, createPermissionActor, delegationRequest, noCeilings, overrideRequest,
  requirePermissionUse, requireReceiptAudit, setDelegation, setOverride, type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function verifyPlatformRoles(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createSecurityPrincipal(sql);
  const input = commandInput();
  const assigned = await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, target.identityId, "admin", input));
  await requireReceiptAudit(sql, fixture.pair[0], assigned, input, "platform_role.assign");
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, target.identityId, "admin", {
    ...input, correlationId: randomUUID(),
  }))).toEqual(assigned);
  await requirePermissionUse(sql, target, "admin.access", null, true);
  await expect(asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, target.identityId, "staff", input)))
    .rejects.toMatchObject(invalidInput);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    assignPlatformRole(probe, target.identityId, "staff")));
  const revokeInput = commandInput();
  const revoked = await asAuthenticated(sql, fixture.pair[0], (probe) => revokePlatformRole(probe, assigned.entity_id, revokeInput));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => revokePlatformRole(probe, assigned.entity_id, revokeInput))).toEqual(revoked);
  await requireReceiptAudit(sql, fixture.pair[0], revoked, revokeInput, "platform_role.revoke");
  await requirePermissionUse(sql, target, "admin.access", null, false);
  const [stored] = await sql<{ state: string; identity_id: string; assigned_by_identity_id: string; revoked_by_identity_id: string }[]>`
    SELECT state, identity_id, assigned_by_identity_id, revoked_by_identity_id FROM public.platform_role_assignments
    WHERE id = ${assigned.entity_id}::uuid
  `;
  expect(stored).toEqual({ state: "revoked", identity_id: target.identityId,
    assigned_by_identity_id: fixture.pair[0].identityId, revoked_by_identity_id: fixture.pair[0].identityId });
}

async function verifyRoleEscalationDenied(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(actor.identityId), permissionKey: "platform_roles.assign",
  }));
  for (const role of ["super_admin", "admin", "staff"]) {
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
      assignPlatformRole(probe, target.identityId, role)));
  }
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    assignPlatformRole(probe, fixture.pair[0].identityId, "staff")));
  const [bound] = await sql<{ id: string }[]>`SELECT id FROM public.platform_role_assignments
    WHERE identity_id = ${fixture.pair[1].identityId}::uuid AND state = 'active'`;
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => revokePlatformRole(probe, bound!.id)));
}

async function verifyRoleActivation(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const version = await prepareRoleVersion(sql, "admin");
  const defaultsBefore = await sql`SELECT role_definition_id, permission_key, effect
    FROM public.role_permission_defaults ORDER BY role_definition_id, permission_key`;
  const input = commandInput();
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, version.id, input));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, version.id, input))).toEqual(receipt);
  await requireReceiptAudit(sql, fixture.pair[0], receipt, input, "role_version.activate");
  const versions = await sql<{ id: string; state: string }[]>`
    SELECT id, state FROM public.role_definitions WHERE stable_key = 'admin' ORDER BY version DESC LIMIT 2
  `;
  expect(versions).toEqual([{ id: version.id, state: "active" }, { id: version.previousId, state: "approved" }]);
  expect(await sql`SELECT role_definition_id, permission_key, effect
    FROM public.role_permission_defaults ORDER BY role_definition_id, permission_key`).toEqual(defaultsBefore);
}

async function verifyOwnRoleAndCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  for (const role of ["super_admin", "viewer"]) {
    const version = await prepareRoleVersion(sql, role);
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, version.id)));
  }
  const unsafe = await prepareRoleVersion(sql, "organization_admin", "member.role.update");
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, unsafe.id)));
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
}

async function createDelegatedRoleVersionFixture(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, fixture.pair[0], (probe) =>
    assignPlatformRole(probe, target.identityId, "staff"));
  await createMembership(sql, fixture.organizationId, target, "organization_admin");
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "workspace.access", organizationId: fixture.organizationId,
  }));
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(actor.identityId), permissionKey: "role_versions.activate",
  }));
  const defaults = await sql<{ key: string; platform_scope: boolean; organization_scope: boolean }[]>`
    SELECT permission.key, permission.platform_scope, permission.organization_scope
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    JOIN public.permission_definitions AS permission ON permission.key = defaults.permission_key
    WHERE role.stable_key = 'staff' AND role.state = 'active' AND defaults.effect = 'allow'
    ORDER BY permission.key
  `;
  expect(defaults.length).toBeGreaterThan(0);
  expect(defaults.some((permission) => permission.key === "org.members.view")).toBe(false);
  for (const permission of defaults) {
    const scopes = [
      ...(permission.platform_scope ? [null] : []),
      ...(permission.organization_scope ? [fixture.organizationId] : []),
    ];
    for (const organizationId of scopes) {
      await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
        ...delegationRequest(actor.identityId), permissionKey: permission.key, organizationId,
      }));
    }
  }
  await requirePermissionUse(sql, actor, "role_versions.activate", null, true);
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, true);
  return { actor, target };
}

async function verifyRoleDenyDirection(sql: SecurityTransaction, fixture: SecurityCommandFixture, removingDeny: boolean) {
  const { actor, target } = await createDelegatedRoleVersionFixture(sql, fixture);
  if (removingDeny) {
    const denied = await prepareRoleVersion(sql, "staff", null, "org.members.view");
    await asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, denied.id));
    await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, false);
  }
  const next = await prepareRoleVersion(sql, "staff",
    removingDeny ? "org.members.view" : null,
    removingDeny ? null : "org.members.view");
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  const input = commandInput();
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    activateRoleVersion(probe, next.id, input)));
  await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings, permissionKey: "org.members.view",
    organizationId: fixture.organizationId, canGrant: removingDeny, canRevoke: !removingDeny,
  }));
  const receipt = await asAuthenticated(sql, actor, (probe) => activateRoleVersion(probe, next.id, input));
  await requireReceiptAudit(sql, actor, receipt, input, "role_version.activate");
  await requirePermissionUse(sql, target, "org.members.view", fixture.organizationId, removingDeny);
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
}

async function verifySuperAdminAncestorRole(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const ancestor = await createSecurityPrincipal(sql);
  const descendant = await createSecurityPrincipal(sql);
  const assignment = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    assignPlatformRole(probe, ancestor.identityId, "super_admin"));
  await asAuthenticated(sql, ancestor, (probe) => assignPlatformRole(probe, descendant.identityId, "super_admin"));
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokePlatformRole(probe, assignment.entity_id));
  await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, ancestor.identityId, "staff"));
  const version = await prepareRoleVersion(sql, "staff");
  const [dependency] = await sql<{ is_ancestor: boolean }[]>`
    SELECT mmhr_private.r1_target_is_authority_ancestor(
      ${descendant.identityId}::uuid, ${ancestor.identityId}::uuid, clock_timestamp()
    ) AS is_ancestor
  `;
  expect(dependency!.is_ancestor).toBe(true);
  await requirePermissionUse(sql, descendant, "role_versions.activate", null, true);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, descendant, (probe) =>
    activateRoleVersion(probe, version.id)));
  const input = commandInput();
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, version.id, input));
  await requireReceiptAudit(sql, fixture.pair[0], receipt, input, "role_version.activate");
}

async function verifyMembershipRole(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const input = commandInput();
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeMembershipRole(probe, fixture.organizationId, fixture.targetMembershipId, "contributor", input));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeMembershipRole(probe, fixture.organizationId, fixture.targetMembershipId, "contributor", input))).toEqual(receipt);
  await requireReceiptAudit(sql, fixture.pair[0], receipt, input, "membership.role.change");
  const [member] = await sql<{ role: string; role_key: string }[]>`
    SELECT role, role_key FROM public.org_members WHERE id = ${fixture.targetMembershipId}::uuid
  `;
  expect(member).toEqual({ role: "contributor", role_key: "contributor" });
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeMembershipRole(probe, fixture.organizationId, fixture.adminMembershipId, "viewer")));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeMembershipRole(probe, fixture.organizationId, fixture.actorMembershipId, "organization_admin")));
}

async function verifyOrganizationStatus(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const input = commandInput();
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeOrganizationStatus(probe, fixture.organizationId, "suspended", input));
  await requireReceiptAudit(sql, fixture.pair[0], receipt, input, "organization.status.change");
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeOrganizationStatus(probe, fixture.organizationId, "suspended", input))).toEqual(receipt);
  await requirePermissionUse(sql, fixture.target, "workspace.access", fixture.organizationId, false);
  await asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationStatus(probe, fixture.organizationId, "active"));
  await requirePermissionUse(sql, fixture.target, "workspace.access", fixture.organizationId, true);
  const [pending] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, migration_review_required)
    VALUES ('Explicit initialization required', 'customer', 'pending', false) RETURNING id
  `;
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationStatus(probe, pending!.id, "active")));
  await asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationStatus(probe, fixture.organizationId, "archived"));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationStatus(probe, fixture.organizationId, "active")));
}

async function verifyOrganizationType(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const grant = await asAuthenticated(sql, fixture.pair[0], (probe) => grantPortalAccess(probe, fixture.organizationId, "customer"));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeOrganizationType(probe, fixture.organizationId, "vendor")));
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokePortalAccess(probe, fixture.organizationId, grant.entity_id));
  const input = commandInput();
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationType(probe, fixture.organizationId, "vendor", input));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationType(probe, fixture.organizationId, "vendor", input))).toEqual(receipt);
  await requireReceiptAudit(sql, fixture.pair[0], receipt, input, "organization.type.change");
  const [organization] = await sql<{ type: string }[]>`SELECT type FROM public.orgs WHERE id = ${fixture.organizationId}::uuid`;
  expect(organization!.type).toBe("vendor");
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeOrganizationType(probe, fixture.organizationId, "internal")));
}

async function verifyPortalAccess(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  await requirePermissionUse(sql, fixture.target, "portal.customer.access", fixture.organizationId, false);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => grantPortalAccess(probe, fixture.organizationId, "vendor")));
  const input = commandInput();
  const grant = await asAuthenticated(sql, fixture.pair[0], (probe) => grantPortalAccess(probe, fixture.organizationId, "customer", input));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => grantPortalAccess(probe, fixture.organizationId, "customer", input))).toEqual(grant);
  await requireReceiptAudit(sql, fixture.pair[0], grant, input, "portal_access.grant");
  await requirePermissionUse(sql, fixture.target, "portal.customer.access", fixture.organizationId, true);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) => revokePortalAccess(probe, randomUUID(), grant.entity_id)));
  const revokeInput = commandInput();
  const revoke = await asAuthenticated(sql, fixture.pair[0], (probe) => revokePortalAccess(probe, fixture.organizationId, grant.entity_id, revokeInput));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => revokePortalAccess(probe, fixture.organizationId, grant.entity_id, revokeInput))).toEqual(revoke);
  await requireReceiptAudit(sql, fixture.pair[0], revoke, revokeInput, "portal_access.revoke");
  await requirePermissionUse(sql, fixture.target, "portal.customer.access", fixture.organizationId, false);
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
}

async function verifyAdministrationAuditRollback(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createSecurityPrincipal(sql);
  const assigned = await createSecurityPrincipal(sql);
  const assignment = await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, assigned.identityId, "staff"));
  const role = await prepareRoleVersion(sql, "admin");
  await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_administration_audit_failure_fixture CHECK (false) NOT VALID`;
  const before = await securitySnapshot(sql);
  const mutations = [
    () => asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, target.identityId, "admin")),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => revokePlatformRole(probe, assignment.entity_id)),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => activateRoleVersion(probe, role.id)),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationStatus(probe, fixture.organizationId, "suspended")),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => changeOrganizationType(probe, fixture.organizationId, "vendor")),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => changeMembershipRole(probe, fixture.organizationId, fixture.targetMembershipId, "contributor")),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => grantPortalAccess(probe, fixture.organizationId, "customer")),
  ];
  for (const invoke of mutations) {
    await expect(invoke()).rejects.toMatchObject({ code: "23514", constraint_name: "r1_administration_audit_failure_fixture" });
    expect(await securitySnapshot(sql)).toEqual(before);
  }
}

export const administrationCases: readonly PermissionCase[] = [
  ["platform role assignment and revocation preserve identity, history, and one receipt", verifyPlatformRoles],
  ["action permissions alone cannot issue platform bundles or bypass the approved pair", verifyRoleEscalationDenied],
  ["role activation preserves earlier approved versions and immutable defaults", verifyRoleActivation],
  ["role activation denies the actor's own stable role and loss of effective administration", verifyOwnRoleAndCapacity],
  ["removing a platform-role deny requires the exact grant ceiling for uncovered organization authority",
    (sql, fixture) => verifyRoleDenyDirection(sql, fixture, true)],
  ["adding a platform-role deny requires the exact revoke ceiling for reduced organization authority",
    (sql, fixture) => verifyRoleDenyDirection(sql, fixture, false)],
  ["a Super Admin cannot activate a shared role that affects its active role-assignment ancestor", verifySuperAdminAncestorRole],
  ["membership role changes preserve the last administrator and deny direct self-changes", verifyMembershipRole],
  ["organization status changes require explicit initialization and preserve terminal archive state", verifyOrganizationStatus],
  ["organization type changes respect active portal grants and administrator capacity", verifyOrganizationType],
  ["portal grants and revocations use exact organization scope and immutable receipts", verifyPortalAccess],
  ["audit failures roll back all role and organization command effects", verifyAdministrationAuditRollback],
];
