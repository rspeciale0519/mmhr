import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect } from "vitest";

import { databaseNow, intentSnapshot } from "./r1-identity-intent-fixtures";
import {
  asAuthenticated, denied, securitySnapshot, type SecurityCommandFixture,
  type SecurityPrincipal, type SecuritySql, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import type { SecurityReceipt } from "./r1-security-command-permission-fixtures";

export type RecoveryCommandInput = { correlationId: string; idempotencyKey: string };
export type RecoveryDecision = {
  phoneResult: string | null;
  preexistingContactAttested: boolean | null;
  phoneCheckedAt: string | null;
  evidenceReference: string | null;
};
export type RecoveryCommandCase = {
  name: string;
  preparePolicy?: boolean;
  run(sql: SecurityTransaction, foundation: SecurityCommandFixture): Promise<void>;
};

export function recoveryInput(): RecoveryCommandInput {
  return { correlationId: randomUUID(), idempotencyKey: randomUUID() };
}

export function recoveryReference() {
  const opaqueReference = randomBytes(32).toString("hex");
  return { opaqueReference, hash: createHash("sha256").update(opaqueReference).digest("hex") };
}

export async function confirmedPhoneCheck(sql: SecuritySql): Promise<RecoveryDecision> {
  const [time] = await sql<{ now: string }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
  return { phoneResult: "confirmed", preexistingContactAttested: true,
    phoneCheckedAt: time!.now, evidenceReference: randomUUID() };
}

export async function createPresence(sql: SecuritySql, referenceHash: string | null, input = recoveryInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_create_recovery_presence(
    ${referenceHash}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function requestRecovery(
  sql: SecuritySql, opaqueReference: string | null, input = recoveryInput(), reason: string | null = "lost_factor",
) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_request_identity_recovery(
    ${opaqueReference}, ${reason}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function decideRecovery(
  sql: SecuritySql, requestId: string | null, decision: RecoveryDecision, input = recoveryInput(),
) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_decide_identity_recovery(
    ${requestId}::uuid, ${decision.phoneResult}, ${decision.preexistingContactAttested},
    ${decision.phoneCheckedAt}::timestamptz, ${decision.evidenceReference}::uuid,
    ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function endRecovery(
  sql: SecuritySql, requestId: string | null, endState: string | null, input = recoveryInput(),
) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`SELECT public.mmhr_end_identity_recovery(
    ${requestId}::uuid, ${endState}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt`;
  return row!.receipt;
}

export async function recoverySnapshot(sql: SecuritySql, omitGuard = false) {
  const snapshot = { ...await securitySnapshot(sql), ...await intentSnapshot(sql) };
  if (omitGuard) delete snapshot["mmhr_private.security_authority_guard"];
  return snapshot;
}

export async function assertRecoveryRejected(
  sql: SecurityTransaction, principal: SecurityPrincipal,
  callback: (caller: SecurityTransaction) => Promise<unknown>,
  error: { code: string; message?: string } = denied, assurance: "aal1" | "aal2" = "aal2",
) {
  const before = await recoverySnapshot(sql);
  await expect(asAuthenticated(sql, principal, callback, assurance)).rejects.toMatchObject(error);
  expect(await recoverySnapshot(sql)).toEqual(before);
}

export async function requireRecoveryReceipt(
  sql: SecuritySql, actor: SecurityPrincipal, receipt: SecurityReceipt,
  input: RecoveryCommandInput, command: string, action = command,
) {
  expect(Object.keys(receipt).sort()).toEqual(["action", "entity_id", "receipt_id"]);
  expect(receipt.action).toBe(action);
  const rows = await sql<{ id: string; entity_id: string; correlation_id: string; action: string }[]>`
    SELECT receipt.id, receipt.entity_id, event.correlation_id, receipt.action
    FROM public.security_command_receipts receipt
    JOIN public.audit_events event ON event.id = receipt.audit_event_id
    WHERE receipt.actor_identity_id = ${actor.identityId}::uuid AND receipt.command = ${command}
      AND receipt.idempotency_key = ${input.idempotencyKey}::uuid`;
  expect(rows).toEqual([{
    id: receipt.receipt_id, entity_id: receipt.entity_id,
    correlation_id: input.correlationId, action,
  }]);
  const audit = await sql<{ actor_identity_id: string; correlation_id: string; action: string }[]>`
    SELECT actor_identity_id, correlation_id, action FROM public.audit_events
    WHERE actor_identity_id = ${actor.identityId}::uuid AND command = ${command}
      AND idempotency_key = ${input.idempotencyKey} AND action = ${action}
      AND entity_id = ${receipt.entity_id}`;
  expect(audit).toEqual([{ actor_identity_id: actor.identityId, correlation_id: input.correlationId, action }]);
}

export async function createPublicRecovery(
  sql: SecurityTransaction, foundation: SecurityCommandFixture,
  target = foundation.target, issuer = foundation.pair[0],
) {
  const reference = recoveryReference();
  const presenceInput = recoveryInput();
  const requestInput = recoveryInput();
  const presence = await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash, presenceInput), "aal1");
  const request = await asAuthenticated(sql, issuer,
    (caller) => requestRecovery(caller, reference.opaqueReference, requestInput),
    issuer.identityId === target.identityId ? "aal1" : "aal2");
  return { target, issuer, reference, presence, request, presenceInput, requestInput };
}

export async function createHistoricalPresence(
  sql: SecuritySql, target: SecurityPrincipal,
  options: { createdOffsetMs?: number; expiresOffsetMs?: number; subjectId?: string; sessionId?: string } = {},
) {
  const reference = recoveryReference();
  const id = randomUUID();
  const now = Date.parse(await databaseNow(sql));
  const createdAt = new Date(now + (options.createdOffsetMs ?? -2 * 60_000)).toISOString();
  const expiresAt = new Date(now + (options.expiresOffsetMs ?? 28 * 60_000)).toISOString();
  const boundTarget = options.sessionId ? target
    : await anotherSession(sql, target, new Date(Date.parse(createdAt) - 60_000).toISOString());
  // Historical times enter at INSERT. The immutable binding and deadline
  // triggers remain enabled throughout these synthetic boundary tests.
  await sql`INSERT INTO public.identity_recovery_presence
    (id, target_identity_id, auth_subject_id, auth_session_id, opaque_reference_hash, created_at, expires_at)
    VALUES (${id}::uuid, ${target.identityId}::uuid, ${options.subjectId ?? target.subject}::uuid,
      ${options.sessionId ?? boundTarget.sessionId}, ${reference.hash}, ${createdAt}::timestamptz, ${expiresAt}::timestamptz)`;
  return { id, reference, createdAt, expiresAt, target: boundTarget };
}

export async function createHistoricalRequest(
  sql: SecuritySql, foundation: SecurityCommandFixture,
  options: {
    target?: SecurityPrincipal; issuer?: SecurityPrincipal; presenceCreatedOffsetMs?: number;
    presenceExpiresOffsetMs?: number; createdOffsetMs?: number; expiresOffsetMs?: number;
  } = {},
) {
  const target = options.target ?? foundation.target;
  const issuer = options.issuer ?? foundation.pair[0];
  const presence = await createHistoricalPresence(sql, target, {
    createdOffsetMs: options.presenceCreatedOffsetMs, expiresOffsetMs: options.presenceExpiresOffsetMs,
  });
  const now = Date.parse(await databaseNow(sql));
  const requestId = randomUUID();
  const createdAt = new Date(now + (options.createdOffsetMs ?? -60_000)).toISOString();
  const expiresAt = new Date(now + (options.expiresOffsetMs ?? 29 * 60_000)).toISOString();
  await sql`INSERT INTO public.identity_recovery_requests
    (id, target_identity_id, recovery_presence_id, initiated_by_identity_id, action, reason, created_at, expires_at)
    VALUES (${requestId}::uuid, ${target.identityId}::uuid, ${presence.id}::uuid, ${issuer.identityId}::uuid,
      'mfa_enrollment_reset', 'lost_factor', ${createdAt}::timestamptz, ${expiresAt}::timestamptz)`;
  await sql`UPDATE public.identity_recovery_presence SET state = 'linked', linked_request_id = ${requestId}::uuid,
    linked_at = ${createdAt}::timestamptz WHERE id = ${presence.id}::uuid`;
  return { target: presence.target, issuer, presence, requestId, createdAt, expiresAt };
}

export async function anotherSession(sql: SecuritySql, principal: SecurityPrincipal, createdAt?: string): Promise<SecurityPrincipal> {
  const sessionId = randomUUID();
  await sql`INSERT INTO auth.sessions (id, user_id, factor_id, aal, not_after, created_at, updated_at)
    VALUES (${sessionId}::uuid, ${principal.subject}::uuid, ${principal.factorId}::uuid, 'aal2',
      ${principal.expiresAt.toISOString()}::timestamptz, ${createdAt ?? await databaseNow(sql)}::timestamptz, clock_timestamp())`;
  return { ...principal, sessionId };
}

export async function historicalSession(sql: SecuritySql, principal: SecurityPrincipal) {
  return anotherSession(sql, principal, new Date(Date.parse(await databaseNow(sql)) - 60 * 60_000).toISOString());
}
