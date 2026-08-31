import { randomUUID } from "node:crypto";

import type { IdentityIntentOutcome } from "@/server/identity/intent-worker-contract";
import { databaseNow, type IntentFixture } from "./r1-identity-intent-fixtures";
import type { SecuritySql } from "./r1-security-command-fixtures";

type HistoricalState = "expired_dispatch" | "expired_reconciliation" | "unknown" | "rejected";
type HistoryOptions = {
  state: HistoricalState;
  attempts?: number;
  futureRetry?: boolean;
  errorCode?: string;
  intentErrorCode?: string | null;
  nextAction?: string;
  manual?: boolean;
  skipHistory?: boolean;
};

// Insert a historical state directly as the scratch owner. Never edit an
// existing immutable lease or disable a trigger to fast-forward a real attempt.
export async function insertHistoricalIntent(sql: SecuritySql, fixture: IntentFixture, options: HistoryOptions) {
  const attempts = options.attempts ?? (options.state === "expired_reconciliation" ? 2 : 1);
  const token = randomUUID();
  const open = options.state.startsWith("expired_");
  const state = options.state === "expired_dispatch" ? "in_flight"
    : options.state === "rejected" ? "failed" : "outcome_unknown";
  const mode = options.state === "expired_reconciliation" ? "reconciliation" : "dispatch";
  const recovery = fixture.operation === "mfa_enrollment_reset" ? fixture : null;
  const errorCode = options.errorCode ?? (options.state === "rejected" ? "provider_rejected" : "provider_outcome_unknown");
  const anchor = Date.parse(await databaseNow(sql));
  const starts = Array.from({ length: Math.max(1, attempts) }, () => anchor - 20 * 60_000);
  for (let index = starts.length - 2; index >= 0; index--) {
    starts[index] = starts[index + 1]! - 30_000 - 30_000 * 2 ** index;
  }
  const iso = (time: number) => new Date(time).toISOString();
  const firstStart = starts[0]!;
  const lastStart = starts[starts.length - 1]!;
  const historicalMode = (number: number) => number > 1 && (recovery || options.state === "expired_reconciliation")
    ? "reconciliation" : "dispatch";
  const dispatchCount = Array.from({ length: attempts }, (_, index) => historicalMode(index + 1))
    .filter((attemptMode) => attemptMode === "dispatch").length;
  const lastDispatchIndex = Math.max(0, dispatchCount - 1);
  const completedIndex = open ? mode === "reconciliation" ? attempts - 2 : -1 : attempts - 1;
  const completedAt = completedIndex >= 0 ? iso(starts[completedIndex]! + 30_000)
    : !open ? iso(lastStart + 30_000) : null;
  const nextAttemptAt = open || options.manual ? null : options.futureRetry
    ? iso(anchor + 60 * 60_000) : iso(lastStart + 30_000 + 30_000 * 2 ** Math.max(0, attempts - 1));
  await sql`INSERT INTO public.identity_admin_intents
    (id, operation, target_identity_id, invitation_id, recovery_request_id, idempotency_key, correlation_id,
      initiated_by_identity_id, auth_subject_id, maximum_attempts, state, attempt_count, dispatch_count,
      created_at, claimed_at, lease_expires_at, lease_token, work_mode, completed_at, next_attempt_at,
      safe_error_code, manual_review_required)
    VALUES (${fixture.intentId}::uuid, ${fixture.operation}::public.identity_intent_operation,
      ${recovery?.target.identityId ?? null}::uuid,
      ${fixture.operation === "invitation_delivery" ? fixture.invitationId : null}::uuid,
      ${recovery?.requestId ?? null}::uuid, ${fixture.idempotencyKey}, ${fixture.correlationId}::uuid,
      ${fixture.issuerId}::uuid, ${recovery?.subjectId ?? null}::uuid, ${fixture.maximumAttempts},
      ${state}::public.identity_intent_state, ${attempts}, ${dispatchCount},
      ${iso(firstStart - 1_000)}::timestamptz, ${iso(starts[lastDispatchIndex]!)}::timestamptz,
      ${iso(lastStart + 15 * 60_000)}::timestamptz,
      ${open ? token : null}::uuid, ${open ? mode : null}::public.identity_intent_work_mode,
      ${completedAt}::timestamptz, ${nextAttemptAt}::timestamptz,
      ${state === "in_flight" ? null : options.intentErrorCode === undefined ? errorCode : options.intentErrorCode},
      ${options.manual ?? false})`;
  for (let number = 1; !options.skipHistory && number <= attempts; number++) {
    const last = number === attempts;
    const complete = !open || !last;
    const historicalOutcome = options.state === "rejected" ? "failed" : "outcome_unknown";
    const nextAction = options.nextAction ?? (options.manual && last ? "manual_review"
      : options.state === "rejected" ? "retry" : "reconcile");
    const startedAt = starts[number - 1]!;
    await sql`INSERT INTO public.identity_intent_attempts
      (intent_id, attempt_number, mode, lease_token, correlation_id, started_at, lease_expires_at,
        completed_at, outcome, safe_error_code, next_action)
      VALUES (${fixture.intentId}::uuid, ${number}, ${historicalMode(number)}::public.identity_intent_work_mode,
        ${last ? token : randomUUID()}::uuid, ${fixture.correlationId}::uuid,
        ${iso(startedAt)}::timestamptz, ${iso(startedAt + 15 * 60_000)}::timestamptz,
        ${complete ? iso(startedAt + 30_000) : null}::timestamptz,
        ${complete ? historicalOutcome : null}, ${complete ? errorCode : null}, ${complete ? nextAction : null})`;
  }
  if (recovery) {
    await sql`UPDATE public.identities SET status = 'recovery_pending',
      authorization_not_before = ${iso(firstStart)}::timestamptz
      WHERE id = ${recovery.target.identityId}::uuid`;
  }
  return token;
}

export const acceptedInvitation = { outcome: "succeeded", resultCode: "invitation_provider_accepted" } as const;
export const rejectedInvitation = { outcome: "failed", code: "provider_rejected", retry: "safe" } as const;
export const unknownReset = { outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "reconcile" } as const;
export const terminalReset = { outcome: "failed", code: "factors_remaining", retry: "manual_review" } as const;

export const malformedOutcomes: readonly unknown[] = [
  null, [], {}, { outcome: "success" },
  { outcome: "succeeded", resultCode: "invitation_provider_accepted", providerPayload: "must-not-be-stored" },
  { outcome: "failed", code: "raw-secret-error", retry: "safe" },
  { outcome: "failed", code: "provider_unavailable", retry: "safe" },
  { outcome: "failed", code: "provider_response_invalid", retry: "safe" },
  { outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "retry" },
];

export const nonRetryableInvitationOutcomes = [
  { outcome: "failed", code: "provider_unavailable", retry: "never" },
  { outcome: "failed", code: "provider_rejected", retry: "never" },
  { outcome: "failed", code: "provider_response_invalid", retry: "manual_review" },
  { outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "reconcile" },
] as const satisfies readonly IdentityIntentOutcome[];
