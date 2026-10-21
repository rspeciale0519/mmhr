import "server-only";
import { z } from "zod";

import type { IdentityFailureCode } from "./service";

export const MAX_IDENTITY_INTENT_ATTEMPTS = 5;

export const identityIntentWorkerFunctions = {
  claimForDispatch: "mmhr_claim_identity_intent",
  claimForReconciliation: "mmhr_claim_identity_intent_reconciliation",
  recordResult: "mmhr_record_identity_intent_result",
} as const;

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const claimFields = {
  intentId: uuid,
  correlationId: uuid,
  idempotencyKey: z.union([z.uuid(), z.string().regex(/^[0-9a-f]{64}$/)]),
  leaseToken: z.union([z.uuid(), z.string().regex(/^[A-Za-z0-9_-]{32,128}$/)]),
  leaseExpiresAt: timestamp,
  attemptNumber: z.number().int().min(1).max(MAX_IDENTITY_INTENT_ATTEMPTS),
  maximumAttempts: z.number().int().min(1).max(MAX_IDENTITY_INTENT_ATTEMPTS),
};

export const identityIntentRequestSchema = z.strictObject({ intentId: uuid });
export type IdentityIntentRequest = z.input<typeof identityIntentRequestSchema>;

export const identityIntentClaimSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...claimFields, operation: z.literal("mfa_enrollment_reset"), subjectId: uuid }),
  z.strictObject({
    ...claimFields, operation: z.literal("invitation_delivery"),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  }),
]).refine((claim) => claim.attemptNumber <= claim.maximumAttempts, {
  message: "Identity intent attempt limit exceeded",
});

export type IdentityIntentClaim = z.output<typeof identityIntentClaimSchema>;

export const identityIntentFailureCodes = [
  "invalid_request", "provider_unavailable", "provider_rejected",
  "provider_response_invalid", "reset_limit_exceeded", "factors_remaining",
] as const satisfies readonly IdentityFailureCode[];

export const identityIntentOutcomeSchema = z.union([
  z.strictObject({
    outcome: z.literal("succeeded"), resultCode: z.literal("invitation_provider_accepted"),
  }),
  z.strictObject({
    outcome: z.literal("succeeded"), resultCode: z.literal("mfa_zero_factors"),
    confirmedFactorCount: z.literal(0), observedAt: timestamp,
  }),
  z.strictObject({
    outcome: z.literal("failed"), code: z.enum(identityIntentFailureCodes),
    retry: z.enum(["safe", "never", "manual_review"]),
  }),
  z.strictObject({
    outcome: z.literal("outcome_unknown"),
    code: z.enum(["provider_outcome_unknown", "provider_response_invalid", "factors_remaining", "delivery_unverifiable"]),
    nextAction: z.enum(["reconcile", "manual_review"]),
  }),
]);

export type IdentityIntentOutcome = z.output<typeof identityIntentOutcomeSchema>;

/**
 * Implement these methods with the three fixed worker functions above.
 * Neither a target, an operation, nor an arbitrary state is a method argument.
 *
 * Dispatch claims atomically check current authority, consume dispatch eligibility,
 * persist the original context, and create a unique fenced lease. Expired dispatch
 * and unknown results are reconciliation-only. Only invitation delivery can retry
 * dispatch, after a recorded provider_rejected/safe result, with remaining attempts
 * and its stored retry deadline. An MFA write claim can occur only once; a failed
 * reset stays terminal and cannot cause another write or restore active identity.
 *
 * Reconciliation claims only authorize provider reads. Both claim methods enforce
 * the stored attempt limit. They return null for terminal, unavailable, or busy work.
 * A lease must allow the bounded provider operation to finish before normal expiry.
 *
 * Result recording atomically checks the current token, fixed operation, allowlisted
 * result, audit write, and lifecycle transition. It accepts a late result when its
 * token remains current, even after approval expiry or authority changes. A reset
 * success also requires a current database observation of zero provider factors.
 *
 * An acknowledgement failure is not dispatch eligibility. An expired in-flight
 * attempt must become outcome_unknown before reconciliation, never pending again.
 */
export interface IdentityIntentRepository {
  claimForDispatch(intentId: string): Promise<IdentityIntentClaim | null>;
  claimForReconciliation(intentId: string): Promise<IdentityIntentClaim | null>;
  recordResult(
    intentId: string,
    leaseToken: string,
    outcome: IdentityIntentOutcome,
  ): Promise<"recorded" | "stale_lease">;
}
