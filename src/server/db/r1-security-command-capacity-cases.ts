import { expect } from "vitest";

import {
  asAuthenticated,
  changeIdentityStatus,
  changeMembershipStatus,
  commandInput,
  createMembership,
  createSecurityPrincipal,
  denied,
  securitySnapshot,
  type SecurityCommandFixture,
  type SecuritySql,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

export async function verifyNamedPairCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const replacement = await createSecurityPrincipal(sql);
  await sql`
    INSERT INTO public.platform_role_assignments (identity_id, role_key, assigned_by_identity_id, assignment_reason)
    VALUES (${replacement.identityId}::uuid, 'super_admin', ${fixture.pair[0].identityId}::uuid,
      'Extra administrator does not replace the approved binding')
  `;
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  const before = await securitySnapshot(sql);
  await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
    probe, fixture.pair[1].identityId, "suspended", commandInput(),
  ))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
  await sql`SELECT mmhr_private.r1_lock_security()`;
  await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
    WHERE id = ${fixture.pair[1].identityId}::uuid`;
  const [remaining] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM public.platform_role_assignments AS assignment
    JOIN public.identities AS identity ON identity.id = assignment.identity_id
    WHERE assignment.role_key = 'super_admin' AND assignment.state = 'active' AND identity.status = 'active'
  `;
  expect(remaining!.count).toBe(2);
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
}

export async function verifyEnrollmentCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  await sql`UPDATE auth.mfa_factors SET status = 'unverified'
    WHERE id = ${fixture.pair[1].factorId}::uuid`;
  const [session] = await sql<{ aal: string }[]>`
    SELECT aal FROM auth.sessions WHERE id = ${fixture.pair[1].sessionId}::uuid
  `;
  expect(session!.aal).toBe("aal2");
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
  const before = await securitySnapshot(sql);
  await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
    probe, fixture.target.identityId, "suspended", commandInput(),
  ))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
}

export async function verifyLastOrganizationAdministrator(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const input = commandInput();
  const before = await securitySnapshot(sql);
  await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeMembershipStatus(
    probe, fixture.organizationId, fixture.adminMembershipId, "suspended", input,
  ))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
  const replacement = await createSecurityPrincipal(sql);
  await createMembership(sql, fixture.organizationId, replacement, "organization_admin");
  const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => changeMembershipStatus(
    probe, fixture.organizationId, fixture.adminMembershipId, "suspended", input,
  ));
  expect(receipt).toBeTypeOf("object");
  const [member] = await sql<{ status: string }[]>`
    SELECT status FROM public.org_members WHERE id = ${fixture.adminMembershipId}::uuid
  `;
  expect(member!.status).toBe("suspended");
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
}

export async function verifyOrganizationFieldCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  await sql`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, organization_id, scope_key,
      effect, issued_by_identity_id, issue_reason, expires_at
    ) VALUES (
      ${fixture.organizationAdmin.identityId}::uuid, 'member.role.update', 'organization',
      ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`}, 'deny',
      ${fixture.pair[0].identityId}::uuid, 'Future-expiring deny must affect capacity now',
      clock_timestamp() + interval '30 minutes'
    )
  `;
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
}

export async function verifyReviewedMembershipCapacity(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  await sql`UPDATE public.org_members SET migration_review_required = true
    WHERE id = ${fixture.adminMembershipId}::uuid`;
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
}

async function removeOnePlatformDefault(sql: SecuritySql, permission: "audit.export" | "workspace.access") {
  await sql`SELECT mmhr_private.r1_lock_security()`;
  const [replacement] = await sql<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    VALUES ('super_admin', 3, 'platform', 'Isolated durable-capacity fixture') RETURNING id
  `;
  await sql`
    INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    SELECT ${replacement!.id}::uuid, defaults.permission_key, defaults.effect
    FROM public.role_permission_defaults AS defaults
    JOIN public.role_definitions AS role ON role.id = defaults.role_definition_id
    WHERE role.stable_key = 'super_admin' AND role.state = 'active'
      AND defaults.permission_key <> ${permission}
  `;
  await sql`UPDATE public.role_definitions SET state = 'approved', approved_at = clock_timestamp()
    WHERE id = ${replacement!.id}::uuid`;
  await sql`UPDATE public.role_definitions SET state = 'approved', activated_at = NULL
    WHERE stable_key = 'super_admin' AND state = 'active'`;
  await sql`UPDATE public.role_definitions SET state = 'active', activated_at = clock_timestamp()
    WHERE id = ${replacement!.id}::uuid`;
}

export async function verifyExpiringPlatformCapacity(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  permission: "audit.export" | "workspace.access",
) {
  await removeOnePlatformDefault(sql, permission);
  for (const [index, principal] of fixture.pair.entries()) {
    await sql`
      INSERT INTO public.user_permission_overrides (
        identity_id, permission_key, scope_kind, scope_key, effect,
        issued_by_identity_id, issue_reason, expires_at
      ) VALUES (
        ${principal.identityId}::uuid, ${permission}, 'platform', 'platform', 'allow',
        ${fixture.pair[index === 0 ? 1 : 0].identityId}::uuid,
        'Temporary positive authority cannot provide durable capacity',
        clock_timestamp() + interval '30 minutes'
      )
    `;
  }
  for (const principal of fixture.pair) {
    const rows = await asAuthenticated(sql, principal, async (probe) => probe`
      SELECT * FROM public.mmhr_authorize('audit.export', NULL)
    `);
    expect(rows).toHaveLength(1);
  }
  await expect(sql.savepoint((probe) => probe`
    SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())
  `)).rejects.toMatchObject(denied);
}
