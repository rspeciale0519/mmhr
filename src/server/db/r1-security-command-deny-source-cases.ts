import { expect } from "vitest";

import { assignPlatformRole } from "./r1-security-command-administration-fixtures";
import {
  asAuthenticated,
  commandInput,
  createMembership,
  createSecurityPrincipal,
  type SecurityCommandFixture,
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
  revokeOverride,
  setDelegation,
  setOverride,
  type PermissionCase,
} from "./r1-security-command-permission-fixtures";
import type { RoleSourceLoss } from "./r1-security-command-role-lifetime-cases";

type DenyRemovalMethod = "revoke" | "replace";

async function createDenyRemovalFixture(
  sql: SecurityTransaction, fixture: SecurityCommandFixture, organizationId: string | null,
  timedDeny = false,
) {
  const root = fixture.pair[0];
  const actor = await createSecurityPrincipal(sql);
  const target = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, root, (probe) => assignPlatformRole(probe, actor.identityId, "admin"));
  for (const permissionKey of ["permissions.grant", "permissions.revoke"]) {
    await asAuthenticated(sql, root, (probe) => setOverride(probe, {
      ...overrideRequest(actor.identityId), permissionKey,
    }));
    await requirePermissionUse(sql, actor, permissionKey, null, true);
  }
  await createMembership(sql, fixture.organizationId, target, "organization_admin");
  await requirePermissionUse(sql, target, "audit.view", fixture.organizationId, true);
  let denyExpiresAt: string | null = null;
  if (timedDeny) {
    const [clock] = await sql<{ expires_at: string }[]>`
      SELECT (clock_timestamp() + interval '8 seconds')::text AS expires_at
    `;
    denyExpiresAt = clock!.expires_at;
  }
  const deny = await asAuthenticated(sql, root, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "audit.view", organizationId, effect: "deny",
    expiresAt: denyExpiresAt,
  }));
  await requirePermissionUse(sql, target, "audit.view", fixture.organizationId, false);
  return { root, actor, target, deny, organizationId, denyExpiresAt };
}

async function removeDeny(
  sql: SecurityTransaction,
  fixture: Awaited<ReturnType<typeof createDenyRemovalFixture>>,
  sourceId: string,
  method: DenyRemovalMethod,
  expiresAt: string | null,
  input = commandInput(),
) {
  return asAuthenticated(sql, fixture.actor, (probe) => method === "revoke"
    ? revokeOverride(probe, fixture.deny.entity_id, "deny", input)
    : setOverride(probe, {
      ...overrideRequest(fixture.target.identityId), permissionKey: "audit.view",
      organizationId: fixture.organizationId, sourceDelegationId: sourceId, expiresAt,
    }, input));
}

async function verifyPlatformDenyRemovalScope(
  sql: SecurityTransaction, fixture: SecurityCommandFixture, method: DenyRemovalMethod,
) {
  const removal = await createDenyRemovalFixture(sql, fixture, null);
  const platformSource = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", canGrant: true, canRevoke: method === "replace",
  }));
  const input = commandInput();
  await assertDeniedWithoutWrite(sql, () => removeDeny(sql, removal, platformSource.entity_id, method, null, input));
  const organizationSource = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  const receipt = await removeDeny(sql, removal, platformSource.entity_id, method, null, input);
  await requireReceiptAudit(sql, removal.actor, receipt, input,
    method === "revoke" ? "permission_override.revoke" : "permission_override.set");
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  await asAuthenticated(sql, removal.root, (probe) => revokeDelegation(probe, organizationSource.entity_id));
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);
}

async function verifyDenyRemovalLifetime(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  method: DenyRemovalMethod,
  loss: RoleSourceLoss,
) {
  const removal = await createDenyRemovalFixture(sql, fixture, fixture.organizationId);
  const [clock] = await sql<{ expires_at: string }[]>`
    SELECT (clock_timestamp() + interval '8 seconds')::text AS expires_at
  `;
  const expiresAt = loss === "expired" ? clock!.expires_at : null;
  const originalSource = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", organizationId: fixture.organizationId,
    canGrant: true, canRevoke: method === "replace", expiresAt,
  }));
  const input = commandInput();
  const receipt = await removeDeny(sql, removal, originalSource.entity_id, method, expiresAt, input);
  const command = method === "revoke" ? "permission_override.revoke" : "permission_override.set";
  await requireReceiptAudit(sql, removal.actor, receipt, input, command);
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  if (loss === "revoked") {
    await asAuthenticated(sql, removal.root, (probe) => revokeDelegation(probe, originalSource.entity_id));
  } else {
    await sql`SELECT pg_sleep(least(10.0, greatest(0,
      extract(epoch FROM (${expiresAt}::timestamptz - clock_timestamp()))) + 0.05)::double precision)`;
  }
  const [source] = await sql<{ state: string; has_expired: boolean; valid: boolean }[]>`
    SELECT state, coalesce(expires_at <= clock_timestamp(), false) AS has_expired,
      mmhr_private.r1_delegation_is_valid(id, 'audit.view', ${fixture.organizationId}::uuid,
        'grant', clock_timestamp(), false) AS valid
    FROM public.admin_delegation_grants WHERE id = ${originalSource.entity_id}::uuid
  `;
  expect(source).toEqual({ state: loss === "revoked" ? "revoked" : "active", has_expired: loss === "expired", valid: false });
  await requirePermissionUse(sql, removal.target, "workspace.access", fixture.organizationId, true);
  const rows = await asAuthenticated(sql, removal.target, (probe) => probe`
    SELECT * FROM public.mmhr_authorize('audit.view', ${fixture.organizationId}::uuid)
  `);
  expect(rows, `The ${method} deny-removal source is ${loss}, so a fallback role must not restore audit.view`).toHaveLength(0);
  const replacementSource = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  expect(replacementSource.entity_id).not.toBe(originalSource.entity_id);
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);
  await requireReceiptAudit(sql, removal.actor, receipt, input, command);
}

export const denySourceCases: PermissionCase[] = (["revoke", "replace"] as const).flatMap((method): PermissionCase[] => [
  [
    `requires exact organization ceilings to ${method} a matching platform deny`,
    (sql, fixture) => verifyPlatformDenyRemovalScope(sql, fixture, method),
  ],
  ...(["revoked", "expired"] as const).map((loss): PermissionCase => [
    `keeps ${method} deny-removal authority bound to its ${loss} original source`,
    (sql, fixture) => verifyDenyRemovalLifetime(sql, fixture, method, loss),
  ]),
]);

async function verifyFreshDenyRemoval(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const removal = await createDenyRemovalFixture(sql, fixture, fixture.organizationId);
  const source = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  await removeDeny(sql, removal, source.entity_id, "revoke", null);
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  await asAuthenticated(sql, removal.root, (probe) => revokeDelegation(probe, source.entity_id));
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);

  await asAuthenticated(sql, removal.root, (probe) => setOverride(probe, {
    ...overrideRequest(removal.target.identityId), permissionKey: "audit.view", organizationId: fixture.organizationId,
  }));
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);
  const freshDeny = await asAuthenticated(sql, removal.root, (probe) => setOverride(probe, {
    ...overrideRequest(removal.target.identityId), permissionKey: "audit.view", organizationId: fixture.organizationId,
    effect: "deny",
  }));
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);
  const input = commandInput();
  const receipt = await asAuthenticated(sql, removal.root, (probe) => revokeOverride(probe, freshDeny.entity_id, "deny", input));
  await requireReceiptAudit(sql, removal.root, receipt, input, "permission_override.revoke");
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  const records = await sql<{
    authority_kind: string; original_source_id: string; has_original_parent: boolean; indefinite_guard: boolean;
  }[]>`
    SELECT fresh.authority_kind, source.source_delegation_id AS original_source_id,
      fresh.previous_removal_id = original.id AS has_original_parent,
      fresh.guarded_until IS NULL AND original.guarded_until IS NULL AS indefinite_guard
    FROM public.permission_deny_removals AS fresh
    JOIN public.permission_deny_removals AS original ON original.id = fresh.previous_removal_id
    JOIN public.permission_authority_sources AS source ON source.deny_removal_id = original.id
    WHERE fresh.override_id = ${freshDeny.entity_id}::uuid AND original.override_id = ${removal.deny.entity_id}::uuid
  `;
  expect(records).toEqual([{
    authority_kind: "super_admin", original_source_id: source.entity_id, has_original_parent: true, indefinite_guard: true,
  }]);
}

async function verifyOriginalDenyExpiry(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const removal = await createDenyRemovalFixture(sql, fixture, fixture.organizationId, true);
  expect(removal.denyExpiresAt).not.toBeNull();
  const source = await asAuthenticated(sql, removal.root, (probe) => setDelegation(probe, {
    ...delegationRequest(removal.actor.identityId), ...noCeilings,
    permissionKey: "audit.view", organizationId: fixture.organizationId, canGrant: true,
  }));
  await removeDeny(sql, removal, source.entity_id, "revoke", null);
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  await asAuthenticated(sql, removal.root, (probe) => revokeDelegation(probe, source.entity_id));
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, false);
  const [guard] = await sql<{ same_horizon: boolean }[]>`
    SELECT history.guarded_until = original.expires_at AS same_horizon
    FROM public.permission_deny_removals AS history
    JOIN public.user_permission_overrides AS original ON original.id = history.override_id
    WHERE original.id = ${removal.deny.entity_id}::uuid
  `;
  expect(guard!.same_horizon).toBe(true);
  await sql`SELECT pg_sleep(least(10.0, greatest(0,
    extract(epoch FROM (${removal.denyExpiresAt}::timestamptz - clock_timestamp()))) + 0.05)::double precision)`;
  await requirePermissionUse(sql, removal.target, "audit.view", fixture.organizationId, true);
  const [expired] = await sql<{ original_expired: boolean; source_valid: boolean }[]>`
    SELECT expires_at <= clock_timestamp() AS original_expired,
      mmhr_private.r1_delegation_is_valid(${source.entity_id}::uuid, 'audit.view', ${fixture.organizationId}::uuid,
        'grant', clock_timestamp(), false) AS source_valid
    FROM public.user_permission_overrides WHERE id = ${removal.deny.entity_id}::uuid
  `;
  expect(expired).toEqual({ original_expired: true, source_valid: false });
}

export const denyRecoveryCases: PermissionCase[] = [
  ["requires a fresh actual deny removal to replace invalid override-deny authority", verifyFreshDenyRemoval],
  ["ends a removed-deny guard at the original deny's recorded expiry", verifyOriginalDenyExpiry],
];
