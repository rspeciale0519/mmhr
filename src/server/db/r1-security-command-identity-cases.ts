import { expect } from "vitest";

import {
  asAuthenticated, changeIdentityStatus, commandInput, createSecurityPrincipal, denied, restrictAuthSubject,
  type ProviderRestriction, type SecurityCommandFixture, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  assertDeniedWithoutWrite, createPermissionActor, overrideRequest, requirePermissionUse,
  setOverride, type PermissionCase,
} from "./r1-security-command-permission-fixtures";

async function verifyProviderRestriction(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  restriction: ProviderRestriction,
) {
  const actor = await createPermissionActor(sql, fixture, false);
  await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
    ...overrideRequest(actor.identityId), permissionKey: "identity.status.change",
  }));
  await requirePermissionUse(sql, actor, "identity.status.change", null, true);
  expect(await asAuthenticated(sql, actor, (probe) => probe`SELECT id FROM public.mmhr_get_my_identity()`))
    .toEqual([{ id: actor.identityId }]);
  await restrictAuthSubject(sql, actor, restriction);
  const [session] = await sql<{ aal: string; factor_status: string; live: boolean }[]>`
    SELECT session.aal, factor.status AS factor_status,
      session.not_after > clock_timestamp() AS live FROM auth.sessions AS session
    JOIN auth.mfa_factors AS factor ON factor.id = session.factor_id
    WHERE session.id = ${actor.sessionId}::uuid AND session.user_id = ${actor.subject}::uuid
  `;
  expect(session).toEqual({ aal: "aal2", factor_status: "verified", live: true });
  await requirePermissionUse(sql, actor, "identity.status.change", null, false);
  expect(await asAuthenticated(sql, actor, (probe) => probe`SELECT id FROM public.mmhr_get_my_identity()`)).toEqual([]);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, actor, (probe) =>
    changeIdentityStatus(probe, fixture.target.identityId, "suspended", commandInput())));
  const activationTarget = await createSecurityPrincipal(sql);
  await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
    WHERE id = ${activationTarget.identityId}::uuid`;
  await restrictAuthSubject(sql, activationTarget, restriction);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeIdentityStatus(probe, activationTarget.identityId, "active", commandInput())));
  await restrictAuthSubject(sql, fixture.pair[1], restriction);
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
  await assertDeniedWithoutWrite(sql, () => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeIdentityStatus(probe, fixture.target.identityId, "suspended", commandInput())));
}

async function verifyExpiredProviderBan(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  await sql`UPDATE auth.users SET banned_until = clock_timestamp() - interval '1 second'
    WHERE id = ${fixture.pair[0].subject}::uuid`;
  await requirePermissionUse(sql, fixture.pair[0], "identity.status.change", null, true);
  expect(await asAuthenticated(sql, fixture.pair[0], (probe) => probe`SELECT id FROM public.mmhr_get_my_identity()`))
    .toEqual([{ id: fixture.pair[0].identityId }]);
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  await asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeIdentityStatus(probe, fixture.target.identityId, "suspended", commandInput()));
}

export const identityRestrictionCases: readonly PermissionCase[] = [
  ...(["banned", "deleted", "anonymous"] as const).map((restriction): PermissionCase => [
    `${restriction} Auth subjects cannot retain command access or durable capacity through a prior AAL2 session`,
    (sql, fixture) => verifyProviderRestriction(sql, fixture, restriction),
  ]),
  ["an expired provider ban does not deny an otherwise active verified administrator", verifyExpiredProviderBan],
];
