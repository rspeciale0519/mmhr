import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asAuthenticated,
  commandInput,
  createMembership,
  invalidInput,
  securitySnapshot,
  type SecurityCommandFixture,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  assertDeniedWithoutWrite,
  createPermissionActor,
  delegationRequest,
  overrideRequest,
  requirePermissionUse,
  requireReceiptAudit,
  revokeDelegation,
  revokeOverride,
  setDelegation,
  setOverride,
  type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function verifyOverrideLifecycle(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createPermissionActor(sql, fixture, false);
  const input = commandInput();
  const request = overrideRequest(target.identityId);
  const first = await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, request, input));
  expect(first.action).toBe("permission_override.set");
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, request, {
    ...input, correlationId: randomUUID(),
  }))).toEqual(first);
  await requireReceiptAudit(sql, fixture.pair[0], first, input, "permission_override.set");
  await requirePermissionUse(sql, target, "audit.export", null, true);
  const [stored] = await sql<{ effect: string; source_delegation_id: string | null; issued_by_identity_id: string }[]>`
    SELECT effect, source_delegation_id, issued_by_identity_id FROM public.user_permission_overrides
    WHERE id = ${first.entity_id}::uuid
  `;
  expect(stored).toEqual({
    effect: "allow", source_delegation_id: null, issued_by_identity_id: fixture.pair[0].identityId,
  });
  const beforeMismatch = await securitySnapshot(sql);
  for (const changed of [
    { ...request, effect: "deny" as const },
    { ...request, permissionKey: "audit.view" },
    { ...request, organizationId: fixture.organizationId },
    { ...request, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    { ...request, sourceDelegationId: randomUUID() },
    { ...request, targetIdentityId: randomUUID() },
  ]) {
    await expect(asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, changed, input)))
      .rejects.toMatchObject(invalidInput);
    expect(await securitySnapshot(sql)).toEqual(beforeMismatch);
  }
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    revokeOverride(probe, first.entity_id, "deny")));
  const revokeInput = commandInput();
  const revoked = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    revokeOverride(probe, first.entity_id, "allow", revokeInput));
  expect(revoked).toMatchObject({ entity_id: first.entity_id, action: "permission_override.revoke" });
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) =>
    revokeOverride(probe, first.entity_id, "allow", revokeInput))).toEqual(revoked);
  await requireReceiptAudit(sql, fixture.pair[0], revoked, revokeInput, "permission_override.revoke");
  await requirePermissionUse(sql, target, "audit.export", null, false);
  await expect(asAuthenticated(sql, fixture.pair[0], (probe) =>
    revokeOverride(probe, first.entity_id, "deny", revokeInput))).rejects.toMatchObject(invalidInput);
}

async function verifyExactOverrideScope(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createPermissionActor(sql, fixture, false);
  await createMembership(sql, fixture.organizationId, target);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "workspace.access", organizationId: fixture.organizationId,
  }));
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "audit.view",
  }));
  await requirePermissionUse(sql, target, "audit.view", null, true);
  await requirePermissionUse(sql, target, "audit.view", fixture.organizationId, false);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "audit.view", organizationId: fixture.organizationId,
  }));
  await requirePermissionUse(sql, target, "audit.view", fixture.organizationId, true);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "audit.view", effect: "deny",
  }));
  await requirePermissionUse(sql, target, "audit.view", null, false);
  await requirePermissionUse(sql, target, "audit.view", fixture.organizationId, false);
  const exactAllow = await sql`SELECT id FROM public.user_permission_overrides
    WHERE identity_id = ${target.identityId}::uuid AND permission_key = 'audit.view'
      AND organization_id = ${fixture.organizationId}::uuid AND effect = 'allow' AND state = 'active'`;
  expect(exactAllow).toHaveLength(1);
}

async function verifyInvalidOverrideScopes(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  for (const request of [
    { ...overrideRequest(fixture.target.identityId), permissionKey: "member.role.update" },
    { ...overrideRequest(fixture.target.identityId), permissionKey: "identity.status.change", organizationId: fixture.organizationId },
    { ...overrideRequest(fixture.target.identityId), permissionKey: "unknown.permission" },
    { ...overrideRequest(fixture.target.identityId), permissionKey: "audit.view", organizationId: randomUUID() },
    { ...overrideRequest(fixture.target.identityId), expiresAt: "infinity" },
    { ...overrideRequest(fixture.target.identityId), expiresAt: "-infinity" },
    { ...overrideRequest(fixture.target.identityId), expiresAt: new Date(Date.now() - 1_000).toISOString() },
  ]) {
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
      setOverride(probe, request)));
  }
}

async function verifyLegacyDenyQuarantine(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createPermissionActor(sql, fixture, false);
  const [scope] = await sql<{ platform_scope: boolean; organization_scope: boolean }[]>`
    SELECT platform_scope, organization_scope FROM public.permission_definitions WHERE key = 'identity.status.change'
  `;
  expect(scope).toEqual({ platform_scope: true, organization_scope: false });
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), permissionKey: "identity.status.change",
  }));
  await requirePermissionUse(sql, target, "identity.status.change", null, true);
  const [legacy] = await sql<{ id: string }[]>`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason
    ) VALUES (
      ${target.identityId}::uuid, 'identity.status.change', 'organization', ${fixture.organizationId}::uuid,
      ${`organization:${fixture.organizationId}`}, 'deny', ${fixture.pair[0].identityId}::uuid,
      'Unsupported legacy deny remains in review'
    ) RETURNING id
  `;
  await requirePermissionUse(sql, target, "identity.status.change", null, false);
  expect(await sql`SELECT id FROM public.user_permission_overrides
    WHERE id = ${legacy!.id}::uuid AND state = 'active' AND effect = 'deny'`).toHaveLength(1);
}

async function verifySourceInvalidation(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  const ceiling = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(actor.identityId)));
  const original = await asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), sourceDelegationId: ceiling.entity_id,
  }));
  await requirePermissionUse(sql, target, "audit.export", null, true);
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokeDelegation(probe, ceiling.entity_id));
  await requirePermissionUse(sql, target, "audit.export", null, false);
  const replacement = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(actor.identityId)));
  expect(replacement.entity_id).not.toBe(ceiling.entity_id);
  await requirePermissionUse(sql, target, "audit.export", null, false);
  const [stored] = await sql<{ source_delegation_id: string; state: string }[]>`
    SELECT source_delegation_id, state FROM public.user_permission_overrides
    WHERE id = ${original.entity_id}::uuid
  `;
  expect(stored).toEqual({ source_delegation_id: ceiling.entity_id, state: "active" });
  await asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), sourceDelegationId: replacement.entity_id,
  }));
  await requirePermissionUse(sql, target, "audit.export", null, true);
}

async function verifyDenySurvivesLostIssuer(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const ceiling = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), permissionKey: "org.name.read", organizationId: fixture.organizationId,
  }));
  await requirePermissionUse(sql, fixture.target, "org.name.read", fixture.organizationId, true);
  const override = await asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(fixture.target.identityId), permissionKey: "org.name.read", organizationId: fixture.organizationId,
    effect: "deny", sourceDelegationId: ceiling.entity_id,
  }));
  await requirePermissionUse(sql, fixture.target, "org.name.read", fixture.organizationId, false);
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokeDelegation(probe, ceiling.entity_id));
  await requirePermissionUse(sql, fixture.target, "org.name.read", fixture.organizationId, false);
  const [stored] = await sql<{ effect: string; state: string; source_delegation_id: string | null }[]>`
    SELECT effect, state, source_delegation_id FROM public.user_permission_overrides WHERE id = ${override.entity_id}::uuid
  `;
  expect(stored).toEqual({ effect: "deny", state: "active", source_delegation_id: null });
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    revokeOverride(probe, override.entity_id, "deny")));
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokeOverride(probe, override.entity_id, "deny"));
  await requirePermissionUse(sql, fixture.target, "org.name.read", fixture.organizationId, true);
}

async function verifyOverrideAuditRollback(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const target = await createPermissionActor(sql, fixture, false);
  const original = await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, overrideRequest(target.identityId)));
  await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_override_audit_failure_fixture CHECK (false) NOT VALID`;
  const before = await securitySnapshot(sql);
  for (const invoke of [
    () => asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
      ...overrideRequest(target.identityId), effect: "deny",
    })),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => revokeOverride(probe, original.entity_id, "allow")),
  ]) {
    await expect(invoke()).rejects.toMatchObject({ code: "23514", constraint_name: "r1_override_audit_failure_fixture" });
    expect(await securitySnapshot(sql)).toEqual(before);
  }
}

export const overrideCases: readonly PermissionCase[] = [
  ["override issuance and revocation bind all request inputs to immutable audit receipts", verifyOverrideLifecycle],
  ["platform allows remain exact-scope and platform denies still apply to organizations", verifyExactOverrideScope],
  ["override commands deny unsupported keys, scopes, and unavailable organizations", verifyInvalidOverrideScopes],
  ["unsupported legacy denies remain effective quarantine records", verifyLegacyDenyQuarantine],
  ["source revocation invalidates an allow and a new grant ID cannot revive it", verifySourceInvalidation],
  ["issued denies survive loss of the issuer ceiling until explicit revocation", verifyDenySurvivesLostIssuer],
  ["audit failure rolls back override replacement and revocation", verifyOverrideAuditRollback],
];
