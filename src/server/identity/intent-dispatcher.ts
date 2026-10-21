import "server-only";
import { z } from "zod";

import type { IdentityService } from "./service";
import {
  identityIntentClaimSchema, identityIntentFailureCodes, identityIntentRequestSchema,
  type IdentityIntentClaim, type IdentityIntentOutcome, type IdentityIntentRepository,
  type IdentityIntentRequest,
} from "./intent-worker-contract";

type WorkerFailureCode =
  | "repository_unavailable" | "invalid_claim" | "lease_expired"
  | "lease_superseded" | "result_recording_failed" | "service_contract_invalid";

export type IdentityDispatchResult =
  | IdentityIntentOutcome
  | Readonly<{ outcome: "invalid_input" | "not_claimed" }>
  | Readonly<{
    outcome: "outcome_unknown"; code: WorkerFailureCode;
    nextAction: "reconcile" | "manual_review";
  }>;

export type IdentityIntentDispatcherDependencies = Readonly<{
  repository: IdentityIntentRepository;
  service: IdentityService;
  now?: () => number;
}>;

type WorkMode = "dispatch" | "reconciliation";

const providerFailureSchema = z.strictObject({
  outcome: z.literal("failed"), code: z.enum(identityIntentFailureCodes),
  retry: z.enum(["safe", "never", "manual_review"]),
});
const providerUnknownSchema = z.strictObject({
  outcome: z.literal("outcome_unknown"),
  code: z.enum(["provider_outcome_unknown", "factors_remaining", "delivery_unverifiable"]),
  nextAction: z.enum(["reconcile", "manual_review"]),
});
const resetSuccessSchema = z.strictObject({
  outcome: z.literal("succeeded"), value: z.strictObject({
    subjectId: z.uuid(), confirmedFactorCount: z.literal(0),
    observedAt: z.iso.datetime({ offset: true }),
  }),
});
const invitationSuccessSchema = z.strictObject({
  outcome: z.literal("succeeded"), value: z.strictObject({ acknowledgement: z.literal("provider_accepted") }),
});

function unknownProviderResult(claim: IdentityIntentClaim, invalid = false): IdentityIntentOutcome {
  return {
    outcome: "outcome_unknown",
    code: invalid ? "provider_response_invalid" : "provider_outcome_unknown",
    nextAction: claim.operation === "invitation_delivery" ? "manual_review" : "reconcile",
  };
}

function workerFailure(code: WorkerFailureCode, manual = false): IdentityDispatchResult {
  return { outcome: "outcome_unknown", code, nextAction: manual ? "manual_review" : "reconcile" };
}

function providerOutcome(
  value: unknown, claim: IdentityIntentClaim, mode: WorkMode, startedAt: number, finishedAt: number,
): IdentityIntentOutcome {
  const failure = providerFailureSchema.safeParse(value);
  if (failure.success) {
    if (mode === "reconciliation") {
      return failure.data.code === "factors_remaining"
        ? { outcome: "outcome_unknown", code: "factors_remaining", nextAction: "manual_review" }
        : unknownProviderResult(claim);
    }
    const safeRetry = claim.operation === "invitation_delivery"
      && failure.data.code === "provider_rejected" && failure.data.retry === "safe"
      && claim.attemptNumber < claim.maximumAttempts;
    return {
      ...failure.data,
      retry: safeRetry ? "safe" : failure.data.retry === "safe" ? "manual_review" : failure.data.retry,
    };
  }
  const unknown = providerUnknownSchema.safeParse(value);
  if (unknown.success) return {
    ...unknown.data,
    nextAction: claim.operation === "invitation_delivery" ? "manual_review" : unknown.data.nextAction,
  };
  if (claim.operation === "invitation_delivery") {
    // The current service cannot prove delivery during reconciliation. Account
    // existence or another provider acceptance is not evidence for this attempt.
    if (mode === "reconciliation") return {
      outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review",
    };
    return invitationSuccessSchema.safeParse(value).success
      ? { outcome: "succeeded", resultCode: "invitation_provider_accepted" }
      : unknownProviderResult(claim, true);
  }
  const reset = resetSuccessSchema.safeParse(value);
  if (!reset.success || reset.data.value.subjectId.toLowerCase() !== claim.subjectId) {
    return unknownProviderResult(claim, true);
  }
  const observedAt = Date.parse(reset.data.value.observedAt);
  if (!Number.isFinite(finishedAt) || observedAt < startedAt || observedAt > finishedAt) {
    return unknownProviderResult(claim, true);
  }
  return {
    outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0,
    observedAt: reset.data.value.observedAt,
  };
}

async function callIdentityService(service: IdentityService, claim: IdentityIntentClaim, mode: WorkMode) {
  const context = {
    intentId: claim.intentId, correlationId: claim.correlationId, idempotencyKey: claim.idempotencyKey,
  };
  if (claim.operation === "mfa_enrollment_reset") {
    const request = { subjectId: claim.subjectId, context: { ...context, operation: claim.operation } };
    return mode === "dispatch" ? service.resetMfaEnrollment(request) : service.reconcileMfaReset(request);
  }
  const request = { email: claim.email, context: { ...context, operation: claim.operation } };
  return mode === "dispatch" ? service.deliverInvitation(request) : service.reconcileInvitation(request);
}

/** At most one successful claim and one provider operation per run. No write retry loop. */
export async function dispatchIdentityIntent(
  input: IdentityIntentRequest,
  { repository, service, now = Date.now }: IdentityIntentDispatcherDependencies,
): Promise<IdentityDispatchResult> {
  const request = identityIntentRequestSchema.safeParse(input);
  if (!request.success) return { outcome: "invalid_input" };
  if (service.providerWriteIdempotency !== "unsupported") return workerFailure("service_contract_invalid", true);

  let rawClaim: unknown;
  let mode: WorkMode = "dispatch";
  try {
    rawClaim = await repository.claimForDispatch(request.data.intentId);
    if (rawClaim === null) {
      mode = "reconciliation";
      rawClaim = await repository.claimForReconciliation(request.data.intentId);
    }
  } catch {
    return workerFailure("repository_unavailable");
  }
  if (rawClaim === null) return { outcome: "not_claimed" };
  const parsed = identityIntentClaimSchema.safeParse(rawClaim);
  if (!parsed.success || parsed.data.intentId !== request.data.intentId) return workerFailure("invalid_claim", true);
  const claim = parsed.data;
  if (mode === "dispatch" && claim.operation === "mfa_enrollment_reset" && claim.attemptNumber !== 1) {
    return workerFailure("invalid_claim", true);
  }
  const startedAt = now();
  if (!Number.isFinite(startedAt)) return workerFailure("invalid_claim", true);
  if (Date.parse(claim.leaseExpiresAt) <= startedAt) return workerFailure("lease_expired");

  let outcome: IdentityIntentOutcome;
  try {
    const response = await callIdentityService(service, claim, mode);
    outcome = providerOutcome(response, claim, mode, startedAt, now());
  } catch {
    outcome = unknownProviderResult(claim);
  }

  try {
    const recorded = await repository.recordResult(claim.intentId, claim.leaseToken, outcome);
    if (recorded === "stale_lease") return workerFailure("lease_superseded");
    if (recorded !== "recorded") return workerFailure("result_recording_failed");
  } catch {
    // The write can commit before its acknowledgement is lost. The repository
    // must reconcile the same intent, never restore dispatch eligibility here.
    return workerFailure("result_recording_failed");
  }
  return outcome;
}
