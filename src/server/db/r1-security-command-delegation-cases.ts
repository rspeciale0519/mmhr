import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asAuthenticated,
  commandInput,
  invalidInput,
  securitySnapshot,
  type SecurityCommandFixture,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  assertDeniedWithoutWrite,
  createPermissionActor,
  delegationRequest,
  noCeilings,
  overrideRequest,
  readAdministration,
  requirePermissionUse,
  requireReceiptAudit,
  revokeDelegation,
  revokeOverride,
  setDelegation,
  setOverride,
  type CeilingFlags,
  type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function verifyIndependentCeiling(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  capability: keyof CeilingFlags,
) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  const child = await createPermissionActor(sql, fixture);
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings, [capability]: true,
  }));
  await requirePermissionUse(sql, actor, "audit.export", null, false);
  const operations = [
    ["canView", () => asAuthenticated(sql, actor, (probe) => readAdministration(probe, "audit.export"))],
    ["canGrant", () => asAuthenticated(sql, actor, (probe) => setOverride(probe, {
      ...overrideRequest(target.identityId), sourceDelegationId: source.entity_id,
    }))],
    ["canRevoke", () => asAuthenticated(sql, actor, (probe) => setOverride(probe, {
      ...overrideRequest(target.identityId), effect: "deny", sourceDelegationId: source.entity_id,
    }))],
    ["canDelegate", () => asAuthenticated(sql, actor, (probe) => setDelegation(probe, {
      ...delegationRequest(child.identityId), ...noCeilings, canDelegate: true, parentGrantId: source.entity_id,
    }))],
  ] as const;
  for (const [required, invoke] of operations) {
    if (required === capability) expect(await invoke()).toBeTypeOf("object");
    else await assertDeniedWithoutWrite(sql, invoke);
  }
}

async function verifyActionAndCeiling(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const withoutAction = await createPermissionActor(sql, fixture, false);
  const withAction = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(withoutAction.identityId)));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, withoutAction, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), sourceDelegationId: source.entity_id,
  })));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, withAction, (probe) =>
    setOverride(probe, overrideRequest(target.identityId))));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, withAction, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), sourceDelegationId: source.entity_id,
  })));
}

async function verifyEffectDirections(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  increase: boolean,
) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings, canGrant: increase, canRevoke: !increase,
  }));
  const removableEffect = increase ? "deny" : "allow";
  const forbiddenEffect = increase ? "allow" : "deny";
  const removable = await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), effect: removableEffect,
  }));
  await asAuthenticated(sql, actor, (probe) => revokeOverride(probe, removable.entity_id, removableEffect));
  const forbidden = await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), effect: forbiddenEffect,
  }));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    revokeOverride(probe, forbidden.entity_id, forbiddenEffect)));
}

async function verifyMixedReplacement(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  increase: boolean,
) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings, canGrant: increase, canRevoke: !increase,
  }));
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), effect: increase ? "deny" : "allow",
  }));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), effect: increase ? "allow" : "deny", sourceDelegationId: source.entity_id,
  })));
}

async function verifyParentBounds(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const child = await createPermissionActor(sql, fixture);
  const expiration = new Date(Date.now() + 10 * 60_000).toISOString();
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), permissionKey: "audit.view", canRevoke: false, expiresAt: expiration,
  }));
  const valid = {
    ...delegationRequest(child.identityId), permissionKey: "audit.view", parentGrantId: source.entity_id,
    canRevoke: false, expiresAt: expiration,
  };
  for (const request of [
    { ...valid, canRevoke: true },
    { ...valid, expiresAt: null },
    { ...valid, expiresAt: new Date(Date.parse(expiration) + 1_000).toISOString() },
    { ...valid, permissionKey: "audit.export" },
    { ...valid, organizationId: fixture.organizationId },
    { ...valid, parentGrantId: randomUUID() },
    { ...valid, parentGrantId: null },
  ]) {
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => setDelegation(probe, request)));
  }
  const input = commandInput();
  const issued = await asAuthenticated(sql, actor, (probe) => setDelegation(probe, valid, input));
  expect(await asAuthenticated(sql, actor, (probe) => setDelegation(probe, valid, {
    ...input, correlationId: randomUUID(),
  }))).toEqual(issued);
  await requireReceiptAudit(sql, actor, issued, input, "delegation.set");
  const [stored] = await sql<{ parent_grant_id: string; issued_by_identity_id: string; same_expiry: boolean }[]>`
    SELECT parent_grant_id, issued_by_identity_id, expires_at = ${expiration}::timestamptz AS same_expiry
    FROM public.admin_delegation_grants WHERE id = ${issued.entity_id}::uuid
  `;
  expect(stored).toEqual({ parent_grant_id: source.entity_id, issued_by_identity_id: actor.identityId, same_expiry: true });
  for (const request of [
    { ...valid, canView: false }, { ...valid, canGrant: false },
    { ...valid, canRevoke: true }, { ...valid, canDelegate: false },
    { ...valid, parentGrantId: randomUUID() }, { ...valid, expiresAt: null },
  ]) {
    await expect(asAuthenticated(sql, actor, (probe) => setDelegation(probe, request, input)))
      .rejects.toMatchObject(invalidInput);
  }
}

async function verifyOverrideExpiryBound(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const target = await createPermissionActor(sql, fixture, false);
  const expiration = new Date(Date.now() + 10 * 60_000).toISOString();
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), expiresAt: expiration,
  }));
  for (const expiresAt of [null, new Date(Date.parse(expiration) + 1_000).toISOString()]) {
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => setOverride(probe, {
      ...overrideRequest(target.identityId), expiresAt, sourceDelegationId: source.entity_id,
    })));
  }
  await asAuthenticated(sql, actor, (probe) => setOverride(probe, {
    ...overrideRequest(target.identityId), expiresAt: expiration, sourceDelegationId: source.entity_id,
  }));
  await requirePermissionUse(sql, target, "audit.export", null, true);
}

async function verifyRevocationAndAudit(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const source = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(actor.identityId)));
  const input = commandInput();
  const revoked = await asAuthenticated(sql, fixture.pair[0], (probe) => revokeDelegation(probe, source.entity_id, input));
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => revokeDelegation(probe, source.entity_id, input))).toEqual(revoked);
  await requireReceiptAudit(sql, fixture.pair[0], revoked, input, "delegation.revoke");
  expect(await sql`SELECT id FROM public.admin_delegation_grants
    WHERE id = ${source.entity_id}::uuid AND state = 'revoked'`).toHaveLength(1);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => readAdministration(probe, "audit.export")));
  const replacement = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(actor.identityId)));
  await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_delegation_audit_failure_fixture CHECK (false) NOT VALID`;
  const before = await securitySnapshot(sql);
  for (const invoke of [
    () => asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, delegationRequest(actor.identityId))),
    () => asAuthenticated(sql, fixture.pair[0], (probe) => revokeDelegation(probe, replacement.entity_id)),
  ]) {
    await expect(invoke()).rejects.toMatchObject({ code: "23514", constraint_name: "r1_delegation_audit_failure_fixture" });
    expect(await securitySnapshot(sql)).toEqual(before);
  }
}

async function verifyGraphCycle(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  acrossScope: boolean,
) {
  const first = await createPermissionActor(sql, fixture);
  const second = await createPermissionActor(sql, fixture);
  const firstSource = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(first.identityId)));
  const secondSource = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(second.identityId), permissionKey: "audit.view",
    organizationId: acrossScope ? fixture.organizationId : null,
  }));
  await asAuthenticated(sql, first, (probe) => setDelegation(probe, {
    ...delegationRequest(second.identityId), ...noCeilings, canView: true, parentGrantId: firstSource.entity_id,
  }));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, second, (probe) => setDelegation(probe, {
    ...delegationRequest(first.identityId), ...noCeilings, canGrant: true,
    permissionKey: "audit.view", organizationId: acrossScope ? fixture.organizationId : null,
    parentGrantId: secondSource.entity_id,
  })));
}

async function verifyPermissionUseCycle(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const first = await createPermissionActor(sql, fixture);
  const second = await createPermissionActor(sql, fixture);
  const actionSource = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(first.identityId), permissionKey: "permissions.delegate",
  }));
  const secondSource = await asAuthenticated(sql, fixture.pair[0], (probe) =>
    setDelegation(probe, delegationRequest(second.identityId)));
  await asAuthenticated(sql, first, (probe) => setOverride(probe, {
    ...overrideRequest(second.identityId), permissionKey: "permissions.delegate", sourceDelegationId: actionSource.entity_id,
  }));
  await requirePermissionUse(sql, second, "permissions.delegate", null, true);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, second, (probe) => setDelegation(probe, {
    ...delegationRequest(first.identityId), parentGrantId: secondSource.entity_id,
  })));
}

export const delegationCases: readonly PermissionCase[] = [
  ...(["canView", "canGrant", "canRevoke", "canDelegate"] as const).map((capability): PermissionCase => [
    `${capability} does not imply any other administration capability or permission use`,
    (sql, fixture) => verifyIndependentCeiling(sql, fixture, capability),
  ]),
  ["permission administration requires both its action and the actor's own ceiling", verifyActionAndCeiling],
  ["removing a deny uses the grant limit and cannot remove an allow", (sql, fixture) => verifyEffectDirections(sql, fixture, true)],
  ["removing an allow uses the revoke limit and cannot remove a deny", (sql, fixture) => verifyEffectDirections(sql, fixture, false)],
  ["grant-only authority cannot replace an existing deny", (sql, fixture) => verifyMixedReplacement(sql, fixture, true)],
  ["revoke-only authority cannot replace an existing allow", (sql, fixture) => verifyMixedReplacement(sql, fixture, false)],
  ["child ceilings bind their parent, scope, flags, expiry, issuer, and immutable retry input", verifyParentBounds],
  ["delegated allows cannot outlive their source ceiling", verifyOverrideExpiryBound],
  ["delegation revocation is audited once and audit failure rolls back replacement", verifyRevocationAndAudit],
  ["delegation denies cycles across permission keys and capabilities", (sql, fixture) => verifyGraphCycle(sql, fixture, false)],
  ["delegation denies cycles across organization and platform scopes", (sql, fixture) => verifyGraphCycle(sql, fixture, true)],
  ["permission-use dependencies cannot create an indirect delegation cycle", verifyPermissionUseCycle],
];
