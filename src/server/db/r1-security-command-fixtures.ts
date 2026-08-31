import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { expect } from "vitest";

import type { RehearsalContext } from "./r1-migration-rehearsal";

export type SecuritySql = postgres.Sql | postgres.TransactionSql;
export type SecurityTransaction = postgres.TransactionSql;
export type SecurityPrincipal = {
  identityId: string;
  subject: string;
  sessionId: string;
  factorId: string;
  expiresAt: Date;
};
export type BootstrapPair = readonly [SecurityPrincipal, SecurityPrincipal];
export type ProviderRestriction = "banned" | "deleted" | "anonymous";
export type SecurityCommandInput = {
  reason: string;
  correlationId: string;
  idempotencyKey: string;
};

export const denied = { code: "42501", message: "Security command denied" };
export const invalidInput = { code: "22023", message: "Invalid security command input" };

export function commandInput(): SecurityCommandInput {
  return {
    reason: "Isolated security command test",
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
  };
}

// These Auth rows model database inputs only. No fixture proves a real person's
// identity, token signature, enrollment, or production bootstrap approval.
export async function createSecurityPrincipal(
  sql: SecuritySql,
  status: "pending" | "active" = "active",
): Promise<SecurityPrincipal> {
  const identityId = randomUUID();
  const subject = randomUUID();
  const sessionId = randomUUID();
  const factorId = randomUUID();
  const email = `security-${subject}@example.invalid`;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await sql`
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      ${subject}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', ${email}, '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    )
  `;
  await sql`
    INSERT INTO public.identities (
      id, auth_user_id, normalized_email, email_verified_at, status,
      activated_at, synchronized_at, migration_review_required
    ) VALUES (
      ${identityId}::uuid, ${subject}::uuid, ${email}, now(),
      ${status}::public.identity_status,
      CASE WHEN ${status} = 'active' THEN now() ELSE NULL END, now(), false
    )
  `;
  await sql`
    INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    VALUES (${factorId}::uuid, ${subject}::uuid, 'totp', 'verified', now(), now())
  `;
  await sql`
    INSERT INTO auth.sessions (id, user_id, factor_id, aal, not_after, created_at, updated_at)
    VALUES (${sessionId}::uuid, ${subject}::uuid, ${factorId}::uuid, 'aal2',
      ${expiresAt.toISOString()}::timestamptz, now(), now())
  `;
  return { identityId, subject, sessionId, factorId, expiresAt };
}

export async function createBootstrapPair(sql: SecuritySql): Promise<BootstrapPair> {
  return [await createSecurityPrincipal(sql, "pending"), await createSecurityPrincipal(sql, "pending")];
}

export async function restrictAuthSubject(sql: SecuritySql, principal: SecurityPrincipal, restriction: ProviderRestriction) {
  if (restriction === "banned") {
    await sql`UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 hour'
      WHERE id = ${principal.subject}::uuid`;
  } else if (restriction === "deleted") {
    await sql`UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = ${principal.subject}::uuid`;
  } else {
    await sql`UPDATE auth.users SET is_anonymous = true WHERE id = ${principal.subject}::uuid`;
  }
}

export async function prepareBootstrap(
  sql: SecuritySql,
  pair: BootstrapPair,
  references = { product: `product:${randomUUID()}`, security: `security:${randomUUID()}` },
) {
  await sql`
    SELECT mmhr_private.r1_prepare_super_admin_bootstrap(
      ${pair[0].identityId}::uuid, ${pair[1].identityId}::uuid,
      ${references.product}, ${references.security}, ${randomUUID()}::uuid
    )
  `;
  return references;
}

export async function completeBootstrap(sql: SecuritySql, pair: BootstrapPair) {
  await sql`
    SELECT mmhr_private.r1_complete_super_admin_bootstrap(
      ${pair[0].subject}::uuid, ${pair[0].sessionId}::uuid, ${pair[0].expiresAt.toISOString()}::timestamptz,
      ${pair[1].subject}::uuid, ${pair[1].sessionId}::uuid, ${pair[1].expiresAt.toISOString()}::timestamptz,
      ${randomUUID()}::uuid
    )
  `;
}

export async function asAuthenticated<T>(
  transaction: SecurityTransaction,
  principal: SecurityPrincipal,
  callback: (sql: SecurityTransaction) => Promise<T>,
  assurance: "aal1" | "aal2" = "aal2",
): Promise<T> {
  const completed = await transaction.savepoint(async (sql) => {
    const [previous] = await sql<{ claims: string | null }[]>`
      SELECT current_setting('request.jwt.claims', true) AS claims
    `;
    await sql`SET LOCAL ROLE authenticated`;
    await sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      sub: principal.subject,
      session_id: principal.sessionId,
      role: "authenticated",
      aud: "authenticated",
      aal: assurance,
      exp: Math.floor(principal.expiresAt.getTime() / 1000),
      iat: Math.floor(Date.now() / 1000),
    })}, true)`;
    const [role] = await sql<{ role: string }[]>`SELECT current_user AS role`;
    expect(role!.role).toBe("authenticated");
    const result = await callback(sql);
    await sql`RESET ROLE`;
    await sql`SELECT set_config('request.jwt.claims', ${previous!.claims ?? ""}, true)`;
    return { value: result };
  });
  return completed.value;
}

export async function changeIdentityStatus(
  sql: SecuritySql,
  targetIdentityId: string,
  status: string,
  input: SecurityCommandInput,
) {
  const [result] = await sql<{ receipt: Record<string, unknown> }[]>`
    SELECT public.mmhr_change_identity_status(
      ${targetIdentityId}::uuid, ${status}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function changeMembershipStatus(
  sql: SecuritySql,
  organizationId: string,
  membershipId: string,
  status: string,
  input: SecurityCommandInput,
) {
  const [result] = await sql<{ receipt: Record<string, unknown> }[]>`
    SELECT public.mmhr_change_membership_status(
      ${organizationId}::uuid, ${membershipId}::uuid, ${status}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function createMembership(
  sql: SecuritySql,
  organizationId: string,
  principal: SecurityPrincipal,
  role: "organization_admin" | "viewer" = "viewer",
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.org_members (
      org_id, identity_id, user_id, role, role_key, migration_review_required
    ) VALUES (
      ${organizationId}::uuid, ${principal.identityId}::uuid, ${principal.subject}::uuid,
      ${role === "organization_admin" ? "admin" : "viewer"}::public.org_role, ${role}, false
    ) RETURNING id
  `;
  return row!.id;
}

export async function createCommandFixture(sql: SecuritySql) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  await completeBootstrap(sql, pair);
  const organizationAdmin = await createSecurityPrincipal(sql);
  const target = await createSecurityPrincipal(sql);
  const [organization] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Isolated security fixture', 'customer', 'active', now(), false) RETURNING id
  `;
  const organizationId = organization!.id;
  const adminMembershipId = await createMembership(sql, organizationId, organizationAdmin, "organization_admin");
  const actorMembershipId = await createMembership(sql, organizationId, pair[0]);
  const targetMembershipId = await createMembership(sql, organizationId, target);
  await sql`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, organization_id, scope_key,
      effect, issued_by_identity_id, issue_reason
    ) VALUES (
      ${pair[0].identityId}::uuid, 'workspace.access', 'organization',
      ${organizationId}::uuid, ${`organization:${organizationId}`},
      'allow', ${pair[1].identityId}::uuid, 'Isolated workspace fixture'
    )
  `;
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  return { pair, organizationAdmin, target, organizationId,
    adminMembershipId, actorMembershipId, targetMembershipId };
}

export type SecurityCommandFixture = Awaited<ReturnType<typeof createCommandFixture>>;

export async function securitySnapshot(sql: SecuritySql) {
  const tables = [
    "mmhr_private.security_authority_guard", "public.security_bootstrap_state",
    "public.identities", "public.org_members", "public.platform_role_assignments",
    "public.user_permission_overrides", "public.admin_delegation_grants",
    "public.security_command_receipts", "public.audit_events", "public.orgs",
    "public.role_definitions", "public.role_permission_defaults", "public.portal_access_grants",
  ] as const;
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await sql.unsafe<{ row: unknown }[]>(
      `SELECT to_jsonb(record) AS row FROM ${table} AS record ORDER BY to_jsonb(record)::text`,
    );
    result[table] = rows.map((row) => row.row);
  }
  return result;
}

export async function rollbackCase(
  context: RehearsalContext,
  callback: (sql: SecurityTransaction) => Promise<void>,
) {
  const rollback = Symbol("discard isolated command fixture changes");
  try {
    await context.client.begin(async (sql) => {
      await callback(sql);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export async function waitForGuardWait(sql: SecuritySql, backendId: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await sql<{ waiting: boolean }[]>`
      SELECT pg_backend_pid() = ANY(pg_blocking_pids(${backendId})) AS waiting
    `;
    if (row!.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The second security writer never waited on the first writer");
}
