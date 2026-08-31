import { expect } from "vitest";

import {
  activateRoleVersion,
  assignPlatformRole,
  prepareRoleVersion,
} from "./r1-security-command-administration-fixtures";
import {
  asAuthenticated,
  commandInput,
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
  requireReceiptAudit,
  revokeDelegation,
  setDelegation,
  setOverride,
} from "./r1-security-command-permission-fixtures";

export type RoleSourceLoss = "revoked" | "expired";

async function requireOriginalRoleDenied(
  sql: SecurityTransaction,
  target: SecurityPrincipal,
  context: string,
) {
  const rows = await asAuthenticated(sql, target, (probe) => probe`
    SELECT * FROM public.mmhr_authorize('admin.access', NULL::uuid)
  `);
  expect(rows, context).toHaveLength(0);
}

export async function verifyRoleSourceLifetime(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  loss: RoleSourceLoss,
) {
  const actor = await createSecurityPrincipal(sql);
  const originalTarget = await createSecurityPrincipal(sql);
  const replacementTarget = await createSecurityPrincipal(sql);
  const root = fixture.pair[0];
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, actor.identityId, "admin"));
  for (const permissionKey of ["platform_roles.assign", "permissions.grant"]) {
    await asAuthenticated(sql, root, (probe) => setOverride(probe, {
      ...overrideRequest(actor.identityId), permissionKey,
    }));
    await requirePermissionUse(sql, actor, permissionKey, null, true);
  }
  await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "workspace.access", canGrant: true,
  }));
  const [clock] = await sql<{ expires_at: string }[]>`
    SELECT (clock_timestamp() + interval '8 seconds')::text AS expires_at
  `;
  const expiresAt = loss === "expired" ? clock!.expires_at : null;
  const originalSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "admin.access", canGrant: true, expiresAt,
  }));
  await requirePermissionUse(sql, originalTarget, "admin.access", null, false);
  const assignmentInput = commandInput();
  const assignment = await asAuthenticated(sql, actor, (probe) =>
    assignPlatformRole(probe, originalTarget.identityId, "staff", assignmentInput));
  await requireReceiptAudit(sql, actor, assignment, assignmentInput, "platform_role.assign");
  await requirePermissionUse(sql, originalTarget, "admin.access", null, true);

  if (loss === "revoked") {
    await asAuthenticated(sql, root, (probe) => revokeDelegation(probe, originalSource.entity_id));
  } else {
    // Use the real database clock. Do not manufacture expiry by rewriting the source.
    await sql`SELECT pg_sleep(least(10.0, greatest(0,
      extract(epoch FROM (${expiresAt}::timestamptz - clock_timestamp()))) + 0.05)::double precision)`;
  }
  const [source] = await sql<{ state: string; has_expired: boolean; valid: boolean }[]>`
    SELECT state, coalesce(expires_at <= clock_timestamp(), false) AS has_expired,
      mmhr_private.r1_delegation_is_valid(id, 'admin.access', NULL::uuid,
        'grant', clock_timestamp(), false) AS valid
    FROM public.admin_delegation_grants WHERE id = ${originalSource.entity_id}::uuid
  `;
  expect(source).toEqual({ state: loss === "revoked" ? "revoked" : "active", has_expired: loss === "expired", valid: false });
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    assignPlatformRole(probe, replacementTarget.identityId, "staff")));
  await requireOriginalRoleDenied(sql, originalTarget,
    `The original role must lose admin.access after its source is ${loss}`);

  const replacementSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "admin.access", canGrant: true,
  }));
  expect(replacementSource.entity_id).not.toBe(originalSource.entity_id);
  await requireOriginalRoleDenied(sql, originalTarget,
    "A replacement ceiling must not revive an assignment bound to an invalid original source");
  await asAuthenticated(sql, actor, (probe) => assignPlatformRole(probe, replacementTarget.identityId, "staff"));
  await requirePermissionUse(sql, replacementTarget, "admin.access", null, true);
  await requireOriginalRoleDenied(sql, originalTarget,
    "A later assignment must not restore the original target's authority");
  const rows = await sql<{ identity_id: string; assigned_by_identity_id: string }[]>`
    SELECT identity_id, assigned_by_identity_id FROM public.platform_role_assignments
    WHERE id = ${assignment.entity_id}::uuid
  `;
  expect(rows).toEqual([{ identity_id: originalTarget.identityId, assigned_by_identity_id: actor.identityId }]);
  await requireReceiptAudit(sql, actor, assignment, assignmentInput, "platform_role.assign");
}

async function prepareVersionWithAuditExport(sql: SecurityTransaction) {
  const [version] = await sql<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    SELECT 'staff', (SELECT max(version) + 1 FROM public.role_definitions WHERE stable_key = 'staff'),
      kind, 'Isolated delegated role version' FROM public.role_definitions
    WHERE stable_key = 'staff' AND state = 'active' RETURNING id
  `;
  await sql`
    INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    SELECT ${version!.id}::uuid, defaults.permission_key, defaults.effect
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    WHERE role.stable_key = 'staff' AND role.state = 'active'
  `;
  await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    VALUES (${version!.id}::uuid, 'audit.export', 'allow')`;
  await sql`UPDATE public.role_definitions SET state = 'approved', approved_at = clock_timestamp()
    WHERE id = ${version!.id}::uuid`;
  return version!.id;
}

export async function verifyRoleVersionSourceLifetime(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  loss: RoleSourceLoss,
) {
  const actor = await createSecurityPrincipal(sql);
  const target = await createSecurityPrincipal(sql);
  const root = fixture.pair[0];
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, actor.identityId, "admin"));
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, target.identityId, "staff"));
  for (const permissionKey of ["role_versions.activate", "permissions.grant", "permissions.revoke"]) {
    await asAuthenticated(sql, root, (probe) => setOverride(probe, {
      ...overrideRequest(actor.identityId), permissionKey,
    }));
    await requirePermissionUse(sql, actor, permissionKey, null, true);
  }
  for (const permissionKey of ["workspace.access", "admin.access"]) {
    await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
      ...delegationRequest(actor.identityId), ...noCeilings,
      permissionKey, canGrant: true, canRevoke: true,
    }));
  }
  const nextVersionId = await prepareVersionWithAuditExport(sql);
  const [clock] = await sql<{ expires_at: string }[]>`
    SELECT (clock_timestamp() + interval '8 seconds')::text AS expires_at
  `;
  const expiresAt = loss === "expired" ? clock!.expires_at : null;
  const originalSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "audit.export", canGrant: true, expiresAt,
  }));
  await requirePermissionUse(sql, target, "audit.export", null, false);
  const activationInput = commandInput();
  const activation = await asAuthenticated(sql, actor, (probe) =>
    activateRoleVersion(probe, nextVersionId, activationInput));
  await requireReceiptAudit(sql, actor, activation, activationInput, "role_version.activate");
  await requirePermissionUse(sql, target, "audit.export", null, true);
  if (loss === "revoked") {
    await asAuthenticated(sql, root, (probe) => revokeDelegation(probe, originalSource.entity_id));
  } else {
    await sql`SELECT pg_sleep(least(10.0, greatest(0,
      extract(epoch FROM (${expiresAt}::timestamptz - clock_timestamp()))) + 0.05)::double precision)`;
  }
  const [source] = await sql<{ state: string; has_expired: boolean; valid: boolean }[]>`
    SELECT state, coalesce(expires_at <= clock_timestamp(), false) AS has_expired,
      mmhr_private.r1_delegation_is_valid(id, 'audit.export', NULL::uuid,
        'grant', clock_timestamp(), false) AS valid
    FROM public.admin_delegation_grants WHERE id = ${originalSource.entity_id}::uuid
  `;
  expect(source).toEqual({ state: loss === "revoked" ? "revoked" : "active", has_expired: loss === "expired", valid: false });
  await requirePermissionUse(sql, target, "admin.access", null, true);
  const currentUse = await asAuthenticated(sql, target, (probe) => probe`
    SELECT * FROM public.mmhr_authorize('audit.export', NULL::uuid)
  `);
  expect(currentUse, `The active role version must lose audit.export after its source is ${loss}`).toHaveLength(0);
  const replacementSource = await asAuthenticated(sql, root, (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings,
    permissionKey: "audit.export", canGrant: true, canRevoke: true,
  }));
  expect(replacementSource.entity_id).not.toBe(originalSource.entity_id);
  await requirePermissionUse(sql, target, "audit.export", null, false);
  const replacementVersion = await prepareRoleVersion(sql, "staff");
  await asAuthenticated(sql, actor, (probe) => activateRoleVersion(probe, replacementVersion.id));
  await requirePermissionUse(sql, target, "audit.export", null, true);
  await requireReceiptAudit(sql, actor, activation, activationInput, "role_version.activate");
}
