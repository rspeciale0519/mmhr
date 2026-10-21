import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asAuthenticated, createMembership, createSecurityPrincipal, invalidInput, securitySnapshot,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  assertDeniedWithoutWrite, createPermissionActor, delegationRequest, noCeilings, overrideRequest,
  readAdministration, requirePermissionUse, revokeOverride, setDelegation, setOverride, type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function verifyMetadataScopeAndPaging(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const actor = await createPermissionActor(sql, fixture);
  const ceiling = await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
    ...delegationRequest(actor.identityId), ...noCeilings, canView: true,
    permissionKey: "org.name.read", organizationId: fixture.organizationId,
  }));
  const targets: SecurityPrincipal[] = [];
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    const target = await createSecurityPrincipal(sql);
    targets.push(target);
    await createMembership(sql, fixture.organizationId, target);
    const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
      ...overrideRequest(target.identityId), permissionKey: "org.name.read",
      organizationId: fixture.organizationId, effect: "deny",
    }));
    ids.push(receipt.entity_id);
  }
  await asAuthenticated(sql, fixture.pair[0], (probe) => revokeOverride(probe, ids[1]!, "deny"));
  await requirePermissionUse(sql, actor, "org.name.read", fixture.organizationId, false);
  const before = await securitySnapshot(sql);
  const full = await asAuthenticated(sql, actor, (probe) => readAdministration(probe, "org.name.read", fixture.organizationId));
  expect(Object.keys(full).sort()).toEqual(["delegations", "overrides", "roles"]);
  expect(full.overrides.map((row) => row.record_id).sort()).toEqual([...ids].sort());
  expect(full.overrides.filter((row) => row.state === "revoked")).toHaveLength(1);
  expect(full.overrides.filter((row) => row.state === "active")).toHaveLength(2);
  expect(full.delegations).toHaveLength(1);
  expect(full.delegations[0]!.record_id).toBe(ceiling.entity_id);
  for (const row of full.overrides) {
    expect(Object.keys(row).sort()).toEqual([
      "effect", "expires_at_epoch", "identity_id", "organization_id", "permission_key",
      "record_id", "source_delegation_id", "state",
    ]);
    expect(row.permission_key).toBe("org.name.read");
    expect(row.organization_id).toBe(fixture.organizationId);
  }
  for (const row of full.delegations) {
    expect(Object.keys(row).sort()).toEqual([
      "can_delegate", "can_grant", "can_revoke", "can_view", "expires_at_epoch", "identity_id",
      "organization_id", "parent_grant_id", "permission_key", "record_id", "state",
    ]);
  }
  for (const row of full.roles) expect(Object.keys(row as object).sort()).toEqual(["effect", "stable_key", "version"]);
  const exposed = JSON.stringify(full);
  expect(exposed).not.toContain("@");
  expect(exposed).not.toContain("Isolated security command test");
  for (const target of targets) expect(exposed).not.toContain(target.subject);

  const pages: string[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < 3; index++) {
    const page = await asAuthenticated(sql, actor, (probe) =>
      readAdministration(probe, "org.name.read", fixture.organizationId, 1, cursor));
    expect(page.overrides).toHaveLength(1);
    expect(page.delegations.length).toBeLessThanOrEqual(1);
    cursor = page.overrides[0]!.record_id as string;
    pages.push(cursor);
  }
  expect(pages).toEqual([...ids].sort());
  const exhausted = await asAuthenticated(sql, actor, (probe) =>
    readAdministration(probe, "org.name.read", fixture.organizationId, 1, cursor, ceiling.entity_id));
  expect(exhausted.overrides).toEqual([]);
  expect(exhausted.delegations).toEqual([]);
  expect(await securitySnapshot(sql)).toEqual(before);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => readAdministration(probe, "audit.export")));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    readAdministration(probe, "org.name.read", randomUUID())));
}

async function verifyMetadataInputAndSession(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  for (const limit of [0, 101, -1]) {
    const before = await securitySnapshot(sql);
    await expect(asAuthenticated(sql, fixture.pair[0], (probe) => readAdministration(probe, "audit.export", null, limit)))
      .rejects.toMatchObject(invalidInput);
    expect(await securitySnapshot(sql)).toEqual(before);
  }
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    readAdministration(probe, "audit.export"), "aal1"));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, {
    ...fixture.pair[0], expiresAt: new Date(Date.now() - 1_000),
  }, (probe) => readAdministration(probe, "audit.export")));
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.organizationAdmin, (probe) =>
    readAdministration(probe, "org.name.read", fixture.organizationId)));
  for (const sessionState of ["expired", "deleted"]) {
    const actor = await createPermissionActor(sql, fixture);
    await asAuthenticated(sql, fixture.pair[0], (probe) => setDelegation(probe, {
      ...delegationRequest(actor.identityId), ...noCeilings, canView: true,
    }));
    expect(await asAuthenticated(sql, actor, (probe) => probe`SELECT id FROM public.mmhr_get_my_identity()`))
      .toEqual([{ id: actor.identityId }]);
    await requirePermissionUse(sql, actor, "admin.access", null, true);
    if (sessionState === "expired") {
      await sql`UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 second'
        WHERE id = ${actor.sessionId}::uuid`;
    } else {
      await sql`DELETE FROM auth.sessions WHERE id = ${actor.sessionId}::uuid`;
    }
    await requirePermissionUse(sql, actor, "admin.access", null, false);
    expect(await asAuthenticated(sql, actor, (probe) => probe`SELECT id FROM public.mmhr_get_my_identity()`)).toEqual([]);
    await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) => readAdministration(probe, "audit.export")));
  }
}

export const administrationReadCases: readonly PermissionCase[] = [
  ["permission metadata reads use exact ceilings, bounded pages, and safe history without tenant-data access", verifyMetadataScopeAndPaging],
  ["permission metadata reads reject invalid limits and stale or insufficient session evidence", verifyMetadataInputAndSession],
];
