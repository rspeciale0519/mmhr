import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";

import { databaseNow, prepareRecoveryPolicy } from "./r1-identity-intent-fixtures";
import { recoveryInput, recoverySnapshot, type RecoveryCommandInput } from "./r1-recovery-command-fixtures";
import {
  asAuthenticated, createSecurityPrincipal, denied, type SecurityCommandFixture, type SecurityPrincipal,
  type SecuritySql, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import type { SecurityReceipt } from "./r1-security-command-permission-fixtures";

export type RecoveryMfaContext = {
  recovery_request_id: string; recovery_presence_id: string; expected_factor_id: string | null;
  state: "enrollment_required" | "verification_required" | "needs_review" | "completed";
};
export type RecoveryMfaCase = { name: string; run(sql: SecurityTransaction, foundation: SecurityCommandFixture): Promise<void> };
export type RecoveryMfaOptions = {
  target?: SecurityPrincipal; issuer?: SecurityPrincipal; approver?: SecurityPrincipal;
  expectedFactorId?: string | null; correlationId?: string; attemptCorrelationId?: string; idempotencyKey?: string;
  maximumAttempts?: number; skipAttempt?: boolean; skipApproval?: boolean;
  decision?: "approved" | "denied"; evidence?: string; phoneOffset?: number;
  sessionOffset?: number; presenceOffset?: number; requestOffset?: number; approvalOffset?: number;
  intentOffset?: number; dispatchOffset?: number; completionOffset?: number; expiryOffset?: number;
  state?: "succeeded" | "failed" | "outcome_unknown"; factorCount?: number; presenceSubject?: string;
};
export type RecoveryMfaFixture = {
  target: SecurityPrincipal; issuer: SecurityPrincipal; approver: SecurityPrincipal;
  presenceId: string; requestId: string; intentId: string; resetAt: string; dispatchAt: string;
};

// Historical fixtures model database inputs only. They do not prove token
// signatures, a phone call, a person's identity, or a provider MFA ceremony.
export async function createRecoveryMfaFixture(
  sql: SecuritySql, foundation: SecurityCommandFixture, options: RecoveryMfaOptions = {},
): Promise<RecoveryMfaFixture> {
  if (!(await sql`SELECT singleton_key FROM mmhr_private.recovery_policy_state`).length) {
    await prepareRecoveryPolicy(sql, foundation);
  }
  const target = options.target ?? await createSecurityPrincipal(sql);
  const issuer = options.issuer ?? foundation.pair[0];
  const approver = options.approver ?? foundation.pair[1];
  const anchor = Date.parse(await databaseNow(sql));
  const at = (minutes: number) => new Date(anchor + minutes * 60_000).toISOString();
  const presenceAt = at(options.presenceOffset ?? -25);
  const requestAt = at(options.requestOffset ?? -24);
  const approvedAt = at(options.approvalOffset ?? -23);
  const intentAt = at(options.intentOffset ?? -22);
  const dispatchAt = at(options.dispatchOffset ?? -21);
  const resetAt = at(options.completionOffset ?? -20);
  const presenceId = randomUUID();
  const requestId = randomUUID();
  const intentId = randomUUID();
  const correlationId = options.correlationId ?? randomUUID();
  const state = options.state ?? "succeeded";
  const errorCode = state === "succeeded" ? null : state === "failed" ? "factors_remaining" : "provider_outcome_unknown";
  const resultCode = state === "succeeded" ? "mfa_zero_factors" : null;

  await sql`UPDATE auth.sessions SET factor_id = NULL, aal = 'aal1', created_at = ${at(options.sessionOffset ?? -26)}::timestamptz
    WHERE id = ${target.sessionId}::uuid AND user_id = ${target.subject}::uuid`;
  await sql`DELETE FROM auth.mfa_factors WHERE user_id = ${target.subject}::uuid`;
  await sql`UPDATE public.identities SET status = 'recovery_pending', authorization_not_before = ${dispatchAt}::timestamptz
    WHERE id = ${target.identityId}::uuid`;
  await sql`INSERT INTO public.identity_recovery_presence
    (id, target_identity_id, auth_subject_id, auth_session_id, opaque_reference_hash,
      expected_replacement_factor_id, created_at, expires_at)
    VALUES (${presenceId}::uuid, ${target.identityId}::uuid, ${options.presenceSubject ?? target.subject}::uuid,
      ${target.sessionId}, ${createHash("sha256").update(randomUUID()).digest("hex")},
      ${options.expectedFactorId ?? null}, ${presenceAt}::timestamptz,
      ${new Date(Date.parse(presenceAt) + 30 * 60_000).toISOString()}::timestamptz)`;
  await sql`INSERT INTO public.identity_recovery_requests
    (id, target_identity_id, recovery_presence_id, initiated_by_identity_id, action, reason,
      state, created_at, approved_at, completed_at, expires_at)
    VALUES (${requestId}::uuid, ${target.identityId}::uuid, ${presenceId}::uuid, ${issuer.identityId}::uuid,
      'mfa_enrollment_reset', 'lost_factor', ${state === "succeeded" ? "completed" : "approved"}::public.recovery_request_state,
      ${requestAt}::timestamptz, ${approvedAt}::timestamptz, ${state === "succeeded" ? resetAt : null}::timestamptz,
      ${options.expiryOffset === undefined ? new Date(Date.parse(requestAt) + 30 * 60_000).toISOString() : at(options.expiryOffset)}::timestamptz)`;
  await sql`UPDATE public.identity_recovery_presence SET state = 'linked', linked_request_id = ${requestId}::uuid,
    linked_at = ${requestAt}::timestamptz WHERE id = ${presenceId}::uuid`;
  if (!options.skipApproval) {
    await sql`INSERT INTO public.identity_recovery_approvals
      (request_id, approver_identity_id, decision, assurance, pre_existing_contact_attested,
        phone_check_result, checked_at, evidence_reference, decision_reason, created_at)
      VALUES (${requestId}::uuid, ${approver.identityId}::uuid, ${options.decision ?? "approved"}::public.recovery_decision,
        'aal2', true, 'confirmed', ${at(options.phoneOffset ?? -23.5)}::timestamptz,
        ${options.evidence ?? randomUUID()}, 'Synthetic phone evidence, not a human check', ${approvedAt}::timestamptz)`;
  }
  await sql`INSERT INTO public.identity_admin_intents
    (id, operation, target_identity_id, recovery_request_id, idempotency_key, state,
      correlation_id, initiated_by_identity_id, auth_subject_id, attempt_count, dispatch_count, maximum_attempts,
      claimed_at, completed_at, safe_error_code, result_code, confirmed_factor_count, created_at)
    VALUES (${intentId}::uuid, 'mfa_enrollment_reset', ${target.identityId}::uuid, ${requestId}::uuid,
      ${options.idempotencyKey ?? randomUUID()}, ${state}::public.identity_intent_state,
      ${correlationId}::uuid, ${issuer.identityId}::uuid, ${target.subject}::uuid, 1, 1, ${options.maximumAttempts ?? 5},
      ${dispatchAt}::timestamptz, ${resetAt}::timestamptz, ${errorCode}, ${resultCode},
      ${state === "succeeded" ? options.factorCount ?? 0 : null}, ${intentAt}::timestamptz)`;
  if (!options.skipAttempt) await sql`INSERT INTO public.identity_intent_attempts
    (intent_id, attempt_number, mode, lease_token, correlation_id, started_at, lease_expires_at,
      completed_at, outcome, safe_error_code, result_code, next_action)
    VALUES (${intentId}::uuid, 1, 'dispatch', ${randomUUID()}::uuid, ${options.attemptCorrelationId ?? correlationId}::uuid,
      ${dispatchAt}::timestamptz, ${new Date(Date.parse(dispatchAt) + 15 * 60_000).toISOString()}::timestamptz,
      ${resetAt}::timestamptz, ${state}, ${errorCode}, ${resultCode}, ${state === "outcome_unknown" ? "reconcile" : "none"})`;
  return { target, issuer, approver, presenceId, requestId, intentId, resetAt, dispatchAt };
}

export function recoveryMfaContext(sql: SecuritySql) {
  return sql<RecoveryMfaContext[]>`SELECT * FROM public.mmhr_get_recovery_mfa_context()`;
}

export async function registerRecoveryFactor(sql: SecuritySql, factorId: string | null, input: RecoveryCommandInput = recoveryInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_register_recovery_factor(
    ${factorId}::uuid, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function reactivateRecovery(sql: SecuritySql, input: RecoveryCommandInput = recoveryInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_reactivate_recovered_identity(
    ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function enrollSyntheticRecoveryFactor(
  sql: SecuritySql, fixture: RecoveryMfaFixture,
  options: { id?: string; subject?: string; status?: "unverified" | "verified"; type?: "totp" | "phone"; createdAt?: string } = {},
) {
  const factorId = options.id ?? randomUUID();
  await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, phone, created_at, updated_at)
    VALUES (${factorId}::uuid, ${options.subject ?? fixture.target.subject}::uuid,
      ${options.type ?? "totp"}::auth.factor_type, ${options.status ?? "unverified"}::auth.factor_status,
      ${options.type === "phone" ? "+12025550100" : null},
      ${options.createdAt ?? await databaseNow(sql)}::timestamptz, clock_timestamp())`;
  return factorId;
}

export async function verifySyntheticRecoveryFactor(sql: SecuritySql, fixture: RecoveryMfaFixture, factorId: string) {
  await sql`UPDATE auth.mfa_factors SET status = 'verified', updated_at = clock_timestamp()
    WHERE id = ${factorId}::uuid AND user_id = ${fixture.target.subject}::uuid`;
  await sql`UPDATE auth.sessions SET factor_id = ${factorId}::uuid, aal = 'aal2', updated_at = clock_timestamp()
    WHERE id = ${fixture.target.sessionId}::uuid AND user_id = ${fixture.target.subject}::uuid`;
}

export async function readySyntheticRecovery(sql: SecurityTransaction, foundation: SecurityCommandFixture, options: RecoveryMfaOptions = {}) {
  const fixture = await createRecoveryMfaFixture(sql, foundation, options);
  const factorId = await enrollSyntheticRecoveryFactor(sql, fixture);
  await asAuthenticated(sql, fixture.target, (caller) => registerRecoveryFactor(caller, factorId), "aal1");
  await verifySyntheticRecoveryFactor(sql, fixture, factorId);
  return { ...fixture, factorId };
}

export async function assertMfaWriteRejected(
  sql: SecurityTransaction, fixture: RecoveryMfaFixture, callback: (caller: SecurityTransaction) => Promise<unknown>,
  assurance: "aal1" | "aal2" = "aal1", error: { code: string; message?: string } = denied,
) {
  const before = await recoverySnapshot(sql);
  await expect(asAuthenticated(sql, fixture.target, callback, assurance)).rejects.toMatchObject(error);
  expect(await recoverySnapshot(sql)).toEqual(before);
}

export async function assertMfaContextDenied(sql: SecurityTransaction, fixture: RecoveryMfaFixture) {
  const before = await recoverySnapshot(sql);
  expect(await asAuthenticated(sql, fixture.target, recoveryMfaContext, "aal1")).toEqual([]);
  expect(await recoverySnapshot(sql)).toEqual(before);
  await assertMfaWriteRejected(sql, fixture, (caller) => registerRecoveryFactor(caller, randomUUID()));
  await assertMfaWriteRejected(sql, fixture, reactivateRecovery);
}

export function asMfaClaims<T>(
  sql: SecurityTransaction, fixture: RecoveryMfaFixture, overrides: Record<string, unknown>,
  callback: (caller: SecurityTransaction) => Promise<T>,
) {
  return asAuthenticated(sql, fixture.target, async (caller) => {
    await caller`SELECT set_config('request.jwt.claims',
      (current_setting('request.jwt.claims')::jsonb || ${JSON.stringify(overrides)}::jsonb)::text,true)`;
    return callback(caller);
  }, "aal1");
}
