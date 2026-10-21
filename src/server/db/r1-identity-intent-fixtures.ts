import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";

import { identityIntentClaimSchema, type IdentityIntentClaim } from "@/server/identity/intent-worker-contract";
import type { RehearsalContext } from "./r1-migration-rehearsal";
import {
  createSecurityPrincipal, type SecurityCommandFixture, type SecurityPrincipal,
  type SecuritySql, type SecurityTransaction,
} from "./r1-security-command-fixtures";

export type IntentContext = {
  intentId: string;
  correlationId: string;
  idempotencyKey: string;
  issuerId: string;
  maximumAttempts: number;
};
export type RecoveryFixture = IntentContext & {
  operation: "mfa_enrollment_reset";
  target: SecurityPrincipal;
  subjectId: string;
  presenceId: string;
  requestId: string;
  approvalId: string;
};
export type InvitationFixture = IntentContext & {
  operation: "invitation_delivery";
  invitationId: string;
  email: string;
};
export type IntentFixture = RecoveryFixture | InvitationFixture;
export type IntentCase = {
  name: string;
  run(sql: SecurityTransaction, foundation: SecurityCommandFixture): Promise<void>;
};

export function intentContext(issuerId: string, maximumAttempts = 5): IntentContext {
  return { intentId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID(), issuerId, maximumAttempts };
}

export async function prepareWorkerFixtureRole(context: RehearsalContext) {
  const address = new URL(context.databaseUrl);
  if (!/^mmhr-r1-intent[a-z]*-[0-9a-f]{8}$/.test(context.projectId)
    || address.hostname !== "127.0.0.1" || Number(address.port) !== context.ports.database
    || address.pathname !== "/postgres" || address.username !== "postgres") {
    throw new Error("Worker role setup requires the exact disposable identity intent database");
  }
  await context.client.begin(async (sql) => {
    const [owner] = await sql<{ role: string; session: string }[]>`SELECT current_user AS role, session_user AS session`;
    expect(owner).toEqual({ role: "postgres", session: "postgres" });
    const factorKeys = await sql<{ name: string; definition: string }[]>`SELECT conname AS name,
      pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'auth.mfa_factors'::regclass AND confrelid = 'auth.users'::regclass AND contype = 'f'`;
    expect(factorKeys).toEqual([{
      name: "mfa_factors_user_id_fkey",
      definition: "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
    }]);
    console.info("Scratch factor foreign key DDL:", factorKeys[0]!.definition);
    await sql`GRANT mmhr_worker TO postgres WITH INHERIT FALSE`;
    await sql`GRANT mmhr_worker TO postgres WITH SET TRUE`;
    const [membership] = await sql<{ inherit: boolean; set: boolean }[]>`SELECT inherit_option AS inherit, set_option AS set
      FROM pg_auth_members WHERE roleid = 'mmhr_worker'::regrole AND member = 'postgres'::regrole
        AND grantor = 'postgres'::regrole`;
    expect(membership).toEqual({ inherit: false, set: true });
    await asWorker(sql, async (worker) => {
      const [role] = await worker<{ role: string; superuser: boolean; bypass: boolean }[]>`SELECT current_user AS role,
        rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
      expect(role).toEqual({ role: "mmhr_worker", superuser: false, bypass: false });
    });
  });
}

export async function prepareRecoveryPolicy(sql: SecuritySql, foundation: SecurityCommandFixture) {
  await sql`SELECT mmhr_private.r1_prepare_recovery_policy(
    ${foundation.pair[0].identityId}::uuid, ${foundation.pair[1].identityId}::uuid,
    ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
    ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
}

export type RecoveryOptions = {
  target?: SecurityPrincipal;
  issuer?: SecurityPrincipal;
  approver?: SecurityPrincipal;
  approval?: "approved" | "denied" | "missing";
  evidenceReference?: string;
  approvalOffsetMs?: number;
  approvedOffsetMs?: number;
  presenceCreatedOffsetMs?: number;
  presenceExpiresOffsetMs?: number;
  requestCreatedOffsetMs?: number;
  requestExpiresOffsetMs?: number;
  presenceSubjectId?: string;
  presenceSessionId?: string;
  maximumAttempts?: number;
  seedIntent?: boolean;
  preparePolicy?: boolean;
};

// These are synthetic database inputs. They do not prove a caller's identity,
// a token signature, an MFA ceremony, a phone check, or a human approval.
export async function createRecoveryFixture(
  sql: SecuritySql, foundation: SecurityCommandFixture, options: RecoveryOptions = {},
): Promise<RecoveryFixture> {
  if (options.preparePolicy !== false) {
    const rows = await sql`SELECT singleton_key FROM mmhr_private.recovery_policy_state`;
    if (!rows.length) await prepareRecoveryPolicy(sql, foundation);
  }
  const target = options.target ?? await createSecurityPrincipal(sql);
  const issuer = options.issuer ?? foundation.pair[0];
  const approver = options.approver ?? foundation.pair[1];
  const fixture: RecoveryFixture = {
    ...intentContext(issuer.identityId, options.maximumAttempts), operation: "mfa_enrollment_reset",
    target, subjectId: target.subject, presenceId: randomUUID(), requestId: randomUUID(), approvalId: randomUUID(),
  };
  const opaqueHash = createHash("sha256").update(randomUUID()).digest("hex");
  const fixtureTime = Date.parse(await databaseNow(sql));
  const time = (offset: number) => new Date(fixtureTime + offset).toISOString();
  const requestCreatedAt = time(options.requestCreatedOffsetMs ?? -60_000);
  await sql`INSERT INTO public.identity_recovery_presence
    (id, target_identity_id, auth_subject_id, auth_session_id, opaque_reference_hash, created_at, expires_at)
    VALUES (${fixture.presenceId}::uuid, ${target.identityId}::uuid, ${options.presenceSubjectId ?? target.subject}::uuid,
      ${options.presenceSessionId ?? target.sessionId}, ${opaqueHash},
      ${time(options.presenceCreatedOffsetMs ?? -120_000)}::timestamptz,
      ${time(options.presenceExpiresOffsetMs ?? 20 * 60_000)}::timestamptz)`;
  await sql`INSERT INTO public.identity_recovery_requests
    (id, target_identity_id, recovery_presence_id, initiated_by_identity_id, action, reason,
      state, created_at, approved_at, expires_at)
    VALUES (${fixture.requestId}::uuid, ${target.identityId}::uuid, ${fixture.presenceId}::uuid,
      ${issuer.identityId}::uuid, 'mfa_enrollment_reset', 'Synthetic approved recovery fixture', 'approved',
      ${requestCreatedAt}::timestamptz, ${time(options.approvedOffsetMs ?? -1_000)}::timestamptz,
      ${time(options.requestExpiresOffsetMs ?? 15 * 60_000)}::timestamptz)`;
  await sql`UPDATE public.identity_recovery_presence SET state = 'linked', linked_request_id = ${fixture.requestId}::uuid,
    linked_at = (SELECT created_at FROM public.identity_recovery_requests WHERE id = ${fixture.requestId}::uuid)
    WHERE id = ${fixture.presenceId}::uuid`;
  if (options.approval !== "missing") {
    const approvalTime = time(options.approvalOffsetMs ?? -2_000);
    await sql`INSERT INTO public.identity_recovery_approvals
      (id, request_id, approver_identity_id, decision, assurance, pre_existing_contact_attested,
        phone_check_result, checked_at, evidence_reference, decision_reason)
      VALUES (${fixture.approvalId}::uuid, ${fixture.requestId}::uuid, ${approver.identityId}::uuid,
        ${options.approval ?? "approved"}::public.recovery_decision, 'aal2', true, 'confirmed',
        ${approvalTime}::timestamptz, ${options.evidenceReference ?? randomUUID()}, 'Synthetic evidence, not a human check')`;
  }
  if (options.seedIntent !== false) await insertPendingIntent(sql, fixture);
  return fixture;
}

export async function createInvitationFixture(
  sql: SecuritySql, foundation: SecurityCommandFixture,
  options: { maximumAttempts?: number; seedIntent?: boolean; email?: string; issuer?: SecurityPrincipal; expiresOffsetMs?: number } = {},
): Promise<InvitationFixture> {
  const issuer = options.issuer ?? foundation.organizationAdmin;
  const email = options.email ?? `intent-${randomUUID()}@example.invalid`;
  const fixture: InvitationFixture = {
    ...intentContext(issuer.identityId, options.maximumAttempts),
    operation: "invitation_delivery", invitationId: randomUUID(), email,
  };
  const expiresAt = new Date(Date.now() + (options.expiresOffsetMs ?? 60 * 60_000)).toISOString();
  await sql`INSERT INTO public.invitations
    (id, org_id, email, normalized_email, role, role_key, created_by_identity_id, expires_at)
    VALUES (${fixture.invitationId}::uuid, ${foundation.organizationId}::uuid, ${email}, ${email},
      'viewer', 'viewer', ${issuer.identityId}::uuid, ${expiresAt}::timestamptz)`;
  if (options.seedIntent !== false) await insertPendingIntent(sql, fixture);
  return fixture;
}

export async function insertPendingIntent(
  sql: SecuritySql, fixture: IntentFixture,
  overrides: { correlationId?: string | null; issuerId?: string | null; idempotencyKey?: string; maximumAttempts?: number } = {},
) {
  const recovery = fixture.operation === "mfa_enrollment_reset" ? fixture : null;
  await sql`INSERT INTO public.identity_admin_intents
    (id, operation, target_identity_id, invitation_id, recovery_request_id, idempotency_key,
      correlation_id, initiated_by_identity_id, auth_subject_id, maximum_attempts)
    VALUES (${fixture.intentId}::uuid, ${fixture.operation}::public.identity_intent_operation,
      ${recovery?.target.identityId ?? null}::uuid,
      ${fixture.operation === "invitation_delivery" ? fixture.invitationId : null}::uuid,
      ${recovery?.requestId ?? null}::uuid, ${overrides.idempotencyKey ?? fixture.idempotencyKey},
      ${overrides.correlationId === undefined ? fixture.correlationId : overrides.correlationId}::uuid,
      ${overrides.issuerId === undefined ? fixture.issuerId : overrides.issuerId}::uuid,
      ${recovery?.subjectId ?? null}::uuid, ${overrides.maximumAttempts ?? fixture.maximumAttempts})`;
}

export async function asRuntimeRole<T>(
  transaction: SecurityTransaction, role: "mmhr_worker" | "anon" | "authenticated" | "service_role",
  callback: (sql: SecurityTransaction) => Promise<T>,
): Promise<T> {
  const completed = await transaction.savepoint(async (sql) => {
    // The identifier is restricted to this closed role union, never provider input.
    await sql.unsafe(`SET LOCAL ROLE ${role}`);
    const [current] = await sql<{ role: string }[]>`SELECT current_user AS role`;
    expect(current!.role).toBe(role);
    const value = await callback(sql);
    await sql`RESET ROLE`;
    return { value };
  });
  return completed.value;
}

export function asWorker<T>(sql: SecurityTransaction, callback: (sql: SecurityTransaction) => Promise<T>) {
  return asRuntimeRole(sql, "mmhr_worker", callback);
}

export async function claimIntent(sql: SecuritySql, intentId: string, reconciliation = false): Promise<IdentityIntentClaim | null> {
  const [row] = reconciliation
    ? await sql<{ claim: unknown }[]>`SELECT mmhr_private.mmhr_claim_identity_intent_reconciliation(${intentId}::uuid) AS claim`
    : await sql<{ claim: unknown }[]>`SELECT mmhr_private.mmhr_claim_identity_intent(${intentId}::uuid) AS claim`;
  return row!.claim === null ? null : identityIntentClaimSchema.parse(row!.claim);
}

export async function recordIntentResult(sql: SecuritySql, intentId: string, token: string, outcome: unknown) {
  const [row] = await sql<{ result: string }[]>`SELECT mmhr_private.mmhr_record_identity_intent_result(
    ${intentId}::uuid, ${token}::text, ${JSON.stringify(outcome)}::jsonb) AS result`;
  return row!.result;
}

export async function databaseNow(sql: SecuritySql) {
  const [row] = await sql<{ now: string }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`;
  return row!.now;
}

export async function zeroFactorOutcome(sql: SecuritySql) {
  return { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt: await databaseNow(sql) } as const;
}

export async function intentSnapshot(sql: SecuritySql) {
  const tables = [
    "public.identities", "public.identity_admin_intents", "public.identity_intent_attempts",
    "public.identity_recovery_presence", "public.identity_recovery_requests", "public.identity_recovery_approvals",
    "public.invitations", "public.audit_events", "mmhr_private.recovery_policy_state",
    "auth.sessions", "auth.mfa_factors",
  ] as const;
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await sql.unsafe<{ row: unknown }[]>(`SELECT to_jsonb(record) AS row FROM ${table} AS record ORDER BY to_jsonb(record)::text`);
    result[table] = rows.map((row) => row.row);
  }
  return result;
}

export async function intentState(sql: SecuritySql, intentId: string) {
  const [row] = await sql<{
    state: string; attempt_count: number; dispatch_count: number; lease_token: string | null;
    work_mode: string | null; manual_review_required: boolean; next_attempt_at: string | null;
    safe_error_code: string | null; result_code: string | null; confirmed_factor_count: number | null;
  }[]>`SELECT state, attempt_count, dispatch_count, lease_token, work_mode, manual_review_required,
    next_attempt_at::text, safe_error_code, result_code, confirmed_factor_count
    FROM public.identity_admin_intents WHERE id = ${intentId}::uuid`;
  return row!;
}

export async function deleteSyntheticFactors(sql: SecuritySql, fixture: RecoveryFixture) {
  await sql`DELETE FROM auth.mfa_factors WHERE user_id = ${fixture.subjectId}::uuid`;
}

export async function assertContained(sql: SecuritySql, fixture: RecoveryFixture) {
  const [row] = await sql<{ status: string; fenced: boolean }[]>`SELECT status,
    authorization_not_before IS NOT NULL AS fenced FROM public.identities WHERE id = ${fixture.target.identityId}::uuid`;
  expect(row).toEqual({ status: "recovery_pending", fenced: true });
}
