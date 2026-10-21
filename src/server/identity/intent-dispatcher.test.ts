import { describe, expect, test, vi } from "vitest";

import type { IdentityService } from "./service";
import { dispatchIdentityIntent } from "./intent-dispatcher";
import {
  identityIntentOutcomeSchema, identityIntentWorkerFunctions, MAX_IDENTITY_INTENT_ATTEMPTS,
  type IdentityIntentClaim, type IdentityIntentRepository, type IdentityIntentRequest,
} from "./intent-worker-contract";

vi.mock("server-only", () => ({}));

const intentId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const otherSubjectId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const leaseToken = "55555555-5555-4555-8555-555555555555";
const nextLeaseToken = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "a".repeat(64);
const observedAt = "2026-08-30T20:00:00.000Z";
const nowTime = Date.parse(observedAt);
const shared = {
  intentId, correlationId, idempotencyKey, leaseToken,
  leaseExpiresAt: "2026-08-30T20:01:00.000Z", attemptNumber: 1, maximumAttempts: 5,
};
const resetClaim = { ...shared, operation: "mfa_enrollment_reset", subjectId } as const satisfies IdentityIntentClaim;
const invitationClaim = { ...shared, operation: "invitation_delivery", email: "invited@example.com" } as const satisfies IdentityIntentClaim;
const resetSuccess = { outcome: "succeeded", value: { subjectId, confirmedFactorCount: 0, observedAt } } as const;
const providerAccepted = { outcome: "succeeded", value: { acknowledgement: "provider_accepted" } } as const;

function fixture(claim: IdentityIntentClaim = resetClaim) {
  const repository = {
    claimForDispatch: vi.fn<IdentityIntentRepository["claimForDispatch"]>().mockResolvedValue(claim),
    claimForReconciliation: vi.fn<IdentityIntentRepository["claimForReconciliation"]>().mockResolvedValue(null),
    recordResult: vi.fn<IdentityIntentRepository["recordResult"]>().mockResolvedValue("recorded"),
  } satisfies IdentityIntentRepository;
  const service = {
    providerWriteIdempotency: "unsupported" as const,
    getVerificationFacts: vi.fn<IdentityService["getVerificationFacts"]>(),
    listMfaFactors: vi.fn<IdentityService["listMfaFactors"]>(),
    resetMfaEnrollment: vi.fn<IdentityService["resetMfaEnrollment"]>().mockResolvedValue(resetSuccess),
    reconcileMfaReset: vi.fn<IdentityService["reconcileMfaReset"]>().mockResolvedValue(resetSuccess),
    deliverInvitation: vi.fn<IdentityService["deliverInvitation"]>().mockResolvedValue(providerAccepted),
    reconcileInvitation: vi.fn<IdentityService["reconcileInvitation"]>().mockResolvedValue({
      outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review",
    }),
  } satisfies IdentityService;
  const now = vi.fn(() => nowTime);
  return {
    repository, service, now,
    run: (input: IdentityIntentRequest = { intentId }) => dispatchIdentityIntent(input, { repository, service, now }),
  };
}

function expectNoProviderAccess(service: ReturnType<typeof fixture>["service"]) {
  for (const method of [service.getVerificationFacts, service.listMfaFactors, service.resetMfaEnrollment,
    service.reconcileMfaReset, service.deliverInvitation, service.reconcileInvitation]) {
    expect(method).not.toHaveBeenCalled();
  }
}

describe("identity intent worker contract", () => {
  test("uses only three fixed worker functions", () => {
    expect(identityIntentWorkerFunctions).toEqual({
      claimForDispatch: "mmhr_claim_identity_intent",
      claimForReconciliation: "mmhr_claim_identity_intent_reconciliation",
      recordResult: "mmhr_record_identity_intent_result",
    });
    expect(MAX_IDENTITY_INTENT_ATTEMPTS).toBe(5);
  });

  test.each([
    { outcome: "pending" }, { outcome: "cancelled" }, { outcome: "succeeded", resultCode: "unknown" },
    { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 1, observedAt },
    { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt, subjectId },
    { outcome: "failed", code: "private provider text", retry: "safe" },
    { outcome: "failed", code: "provider_rejected", retry: "safe", role: "super_admin" },
  ])("rejects arbitrary states, targets, and raw provider data in result records: %j", (value) => {
    expect(identityIntentOutcomeSchema.safeParse(value).success).toBe(false);
  });
});

describe("identity intent dispatch", () => {
  test("uses only the claimed reset subject and original operation context", async () => {
    const f = fixture();
    const result = await f.run();
    expect(f.repository.claimForDispatch).toHaveBeenCalledExactlyOnceWith(intentId);
    expect(f.repository.claimForReconciliation).not.toHaveBeenCalled();
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledExactlyOnceWith({
      subjectId, context: { operation: "mfa_enrollment_reset", intentId, correlationId, idempotencyKey },
    });
    expect(result).toEqual({ outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt });
    expect(f.repository.recordResult).toHaveBeenCalledExactlyOnceWith(intentId, leaseToken, result);
    expect(f.repository.recordResult.mock.calls[0][2]).not.toHaveProperty("subjectId");
    expect(f.service.listMfaFactors).not.toHaveBeenCalled();
    expect(f.service.getVerificationFacts).not.toHaveBeenCalled();
  });

  test("delivers only the claimed normalized invitation email without a supplied redirect", async () => {
    const f = fixture({ ...invitationClaim, email: "  INVITED@EXAMPLE.COM " });
    await expect(f.run()).resolves.toEqual({ outcome: "succeeded", resultCode: "invitation_provider_accepted" });
    expect(f.service.deliverInvitation).toHaveBeenCalledExactlyOnceWith({
      email: "invited@example.com", context: { operation: "invitation_delivery", intentId, correlationId, idempotencyKey },
    });
    expect(f.repository.recordResult.mock.calls[0][2]).not.toHaveProperty("email");
  });

  test.each([
    null, undefined, {}, [], { intentId: "invalid" }, { intentId, subjectId },
    { intentId, operation: "mfa_enrollment_reset" }, { intentId, actorId: subjectId },
    { intentId, email: "other@example.com" }, { intentId, leaseToken }, { intentId, maximumAttempts: 100 },
  ])("rejects caller-selected targets, operations, and controls: %j", async (input) => {
    const f = fixture();
    await expect(dispatchIdentityIntent(input as IdentityIntentRequest, {
      repository: f.repository, service: f.service, now: f.now,
    })).resolves.toEqual({ outcome: "invalid_input" });
    expect(f.repository.claimForDispatch).not.toHaveBeenCalled();
    expect(f.repository.claimForReconciliation).not.toHaveBeenCalled();
    expectNoProviderAccess(f.service);
  });

  test("does not call the provider when no dispatch or reconciliation claim exists", async () => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValue(null);
    await expect(f.run()).resolves.toEqual({ outcome: "not_claimed" });
    expect(f.repository.claimForReconciliation).toHaveBeenCalledExactlyOnceWith(intentId);
    expectNoProviderAccess(f.service);
    expect(f.repository.recordResult).not.toHaveBeenCalled();
  });

  test.each([
    undefined, [], {}, { ...resetClaim, intentId: otherSubjectId },
    { ...resetClaim, operation: "identity_relink" }, { ...resetClaim, subjectId: "invalid" },
    { ...resetClaim, targetIdentityId: otherSubjectId }, { ...resetClaim, actorId: subjectId },
    { ...resetClaim, leaseToken: "short" }, { ...resetClaim, leaseExpiresAt: "invalid" },
    { ...resetClaim, attemptNumber: 0 }, { ...resetClaim, attemptNumber: 6 },
    { ...resetClaim, maximumAttempts: 100 }, { ...resetClaim, attemptNumber: 3, maximumAttempts: 2 },
    { ...resetClaim, idempotencyKey: "replacement-key" }, { ...resetClaim, correlationId: "invalid" },
  ])("rejects a malformed, mismatched, or over-limit database claim: %j", async (claim) => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValue(claim as IdentityIntentClaim);
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "invalid_claim" });
    expectNoProviderAccess(f.service);
    expect(f.repository.recordResult).not.toHaveBeenCalled();
  });

  test.each(["2026-08-30T19:59:59.999Z", observedAt])("does not start work with an expired lease: %s", async (leaseExpiresAt) => {
    const f = fixture({ ...resetClaim, leaseExpiresAt });
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "lease_expired" });
    expectNoProviderAccess(f.service);
    expect(f.repository.recordResult).not.toHaveBeenCalled();
  });

  test("allows a late result when the original lease token remains current", async () => {
    const f = fixture();
    f.service.resetMfaEnrollment.mockImplementation(async () => {
      const lateTime = Date.parse(shared.leaseExpiresAt) + 1_000;
      f.now.mockReturnValue(lateTime);
      return { ...resetSuccess, value: { ...resetSuccess.value, observedAt: new Date(lateTime).toISOString() } };
    });
    await expect(f.run()).resolves.toMatchObject({ outcome: "succeeded", confirmedFactorCount: 0 });
    expect(f.repository.recordResult.mock.calls[0].slice(0, 2)).toEqual([intentId, leaseToken]);
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
  });

  test("does not update a result after another claimant replaces the lease", async () => {
    const f = fixture();
    f.repository.recordResult.mockResolvedValue("stale_lease");
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "lease_superseded" });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
    expect(f.repository.recordResult).toHaveBeenCalledOnce();
    expect(f.service.reconcileMfaReset).not.toHaveBeenCalled();
  });

  test.each(["dispatch", "reconciliation"] as const)("sanitizes a failed %s claim without provider access", async (mode) => {
    const f = fixture();
    if (mode === "dispatch") f.repository.claimForDispatch.mockRejectedValue(new Error("private database detail"));
    else {
      f.repository.claimForDispatch.mockResolvedValue(null);
      f.repository.claimForReconciliation.mockRejectedValue(new Error("private database detail"));
    }
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "repository_unavailable", nextAction: "reconcile" });
    expectNoProviderAccess(f.service);
  });

  test("records an uncertain reset after an unexpected provider exception without another write", async () => {
    const f = fixture();
    f.service.resetMfaEnrollment.mockRejectedValue(new Error("private provider payload"));
    const result = await f.run();
    expect(result).toEqual({ outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "reconcile" });
    expect(f.repository.recordResult).toHaveBeenCalledExactlyOnceWith(intentId, leaseToken, result);
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
  });

  test("never records partial reset failure as zero-factor success", async () => {
    const f = fixture();
    f.service.resetMfaEnrollment.mockResolvedValue({ outcome: "failed", code: "factors_remaining", retry: "manual_review" });
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "factors_remaining", retry: "manual_review" });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
    expect(f.repository.recordResult.mock.calls[0][2]).not.toHaveProperty("confirmedFactorCount");
  });

  test.each([
    null, {}, { ...resetSuccess, value: { ...resetSuccess.value, confirmedFactorCount: 1 } },
    { ...resetSuccess, value: { ...resetSuccess.value, subjectId: otherSubjectId } },
    { ...resetSuccess, value: { ...resetSuccess.value, observedAt: "2026-08-29T20:00:00.000Z" } },
    { ...resetSuccess, value: { ...resetSuccess.value, observedAt: "2026-08-31T20:00:00.000Z" } },
    { ...resetSuccess, value: { ...resetSuccess.value, factorSecret: "private fixture" } },
    { outcome: "succeeded", value: { subjectId, factors: [], observedAt } },
  ])("requires exact, current zero-factor confirmation for the bound subject: %j", async (result) => {
    const f = fixture();
    f.service.resetMfaEnrollment.mockResolvedValue(result as Awaited<ReturnType<IdentityService["resetMfaEnrollment"]>>);
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "provider_response_invalid", nextAction: "reconcile" });
    expect(f.repository.recordResult.mock.calls[0][2]).not.toHaveProperty("value");
  });

  test("does not use a provider-unavailable retry hint to repeat an external write", async () => {
    const f = fixture();
    f.service.resetMfaEnrollment.mockResolvedValue({ outcome: "failed", code: "provider_unavailable", retry: "safe" });
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "provider_unavailable", retry: "manual_review" });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
  });

  test("does not retry a failed MFA write even when the provider reports a safe rejection", async () => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValueOnce(resetClaim).mockResolvedValue(null);
    f.service.resetMfaEnrollment.mockResolvedValue({ outcome: "failed", code: "provider_rejected", retry: "safe" });
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "provider_rejected", retry: "manual_review" });
    expect(f.repository.recordResult.mock.calls[0][2]).toEqual({ outcome: "failed", code: "provider_rejected", retry: "manual_review" });
    await expect(f.run()).resolves.toEqual({ outcome: "not_claimed" });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
  });

  test("rejects a database claim for a second MFA write attempt", async () => {
    const f = fixture({ ...resetClaim, attemptNumber: 2 });
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "invalid_claim" });
    expectNoProviderAccess(f.service);
    expect(f.repository.recordResult).not.toHaveBeenCalled();
  });

  test("leaves only confirmed safe rejection retryable and stops at the stored attempt limit", async () => {
    const f = fixture(invitationClaim);
    let attemptNumber = 0;
    f.repository.claimForDispatch.mockImplementation(async () => ++attemptNumber <= 2
      ? { ...invitationClaim, attemptNumber, maximumAttempts: 2 }
      : null);
    f.service.deliverInvitation.mockResolvedValue({ outcome: "failed", code: "provider_rejected", retry: "safe" });
    await expect(f.run()).resolves.toMatchObject({ outcome: "failed", retry: "safe" });
    expect(f.service.deliverInvitation).toHaveBeenCalledOnce();
    await expect(f.run()).resolves.toMatchObject({ outcome: "failed", retry: "manual_review" });
    await expect(f.run()).resolves.toEqual({ outcome: "not_claimed" });
    expect(f.service.deliverInvitation).toHaveBeenCalledTimes(2);
    expect(f.service.deliverInvitation.mock.calls[0]).toEqual(f.service.deliverInvitation.mock.calls[1]);
  });
});

describe("identity intent reconciliation", () => {
  test("uses a separate read-only claim after expired or uncertain dispatch", async () => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValue(null);
    f.repository.claimForReconciliation.mockResolvedValue({ ...resetClaim, leaseToken: nextLeaseToken, attemptNumber: 2 });
    await expect(f.run()).resolves.toMatchObject({ outcome: "succeeded", confirmedFactorCount: 0 });
    expect(f.service.resetMfaEnrollment).not.toHaveBeenCalled();
    expect(f.service.reconcileMfaReset).toHaveBeenCalledExactlyOnceWith({
      subjectId, context: { operation: "mfa_enrollment_reset", intentId, correlationId, idempotencyKey },
    });
    expect(f.repository.recordResult.mock.calls[0].slice(0, 2)).toEqual([intentId, nextLeaseToken]);
  });

  test("keeps result-write failure uncertain until read-only reconciliation succeeds", async () => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValueOnce(resetClaim).mockResolvedValue(null);
    f.repository.recordResult.mockRejectedValueOnce(new Error("private storage failure")).mockResolvedValue("recorded");
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "result_recording_failed", nextAction: "reconcile" });
    f.repository.claimForReconciliation.mockResolvedValue({ ...resetClaim, leaseToken: nextLeaseToken, attemptNumber: 2 });
    await expect(f.run()).resolves.toMatchObject({ outcome: "succeeded", confirmedFactorCount: 0 });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
    expect(f.service.reconcileMfaReset).toHaveBeenCalledOnce();
    expect(f.repository.recordResult).toHaveBeenCalledTimes(2);
  });

  test("does not repeat a write when the result committed but its acknowledgement was lost", async () => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValueOnce(resetClaim).mockResolvedValue(null);
    f.repository.recordResult.mockRejectedValue(new Error("lost acknowledgement"));
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "result_recording_failed" });
    await expect(f.run()).resolves.toEqual({ outcome: "not_claimed" });
    expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
  });

  test("keeps an invalid result acknowledgement uncertain without a repeated record call", async () => {
    const f = fixture();
    f.repository.recordResult.mockResolvedValue("unexpected" as "recorded");
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "result_recording_failed" });
    expect(f.repository.recordResult).toHaveBeenCalledOnce();
  });

  test("never repeats ambiguous invitation delivery during reconciliation", async () => {
    const f = fixture(invitationClaim);
    f.repository.claimForDispatch.mockResolvedValueOnce(invitationClaim).mockResolvedValue(null);
    f.service.deliverInvitation.mockRejectedValue(new Error("delivery acknowledgement lost"));
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "manual_review" });
    f.repository.claimForReconciliation.mockResolvedValue({ ...invitationClaim, leaseToken: nextLeaseToken, attemptNumber: 2 });
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review" });
    expect(f.service.deliverInvitation).toHaveBeenCalledOnce();
    expect(f.service.reconcileInvitation).toHaveBeenCalledOnce();
  });

  test("does not repeat an accepted invitation after result recording fails", async () => {
    const f = fixture(invitationClaim);
    f.repository.claimForDispatch.mockResolvedValueOnce(invitationClaim).mockResolvedValue(null);
    f.repository.recordResult.mockRejectedValueOnce(new Error("receipt storage unavailable")).mockResolvedValue("recorded");
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "result_recording_failed" });
    f.repository.claimForReconciliation.mockResolvedValue({ ...invitationClaim, leaseToken: nextLeaseToken, attemptNumber: 2 });
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review" });
    expect(f.service.deliverInvitation).toHaveBeenCalledOnce();
    expect(f.service.reconcileInvitation).toHaveBeenCalledOnce();
  });

  test.each([
    { outcome: "failed", code: "provider_rejected", retry: "safe" },
    { outcome: "failed", code: "provider_unavailable", retry: "safe" },
    { outcome: "failed", code: "factors_remaining", retry: "manual_review" },
  ] as const)("does not restore write eligibility from a reconciliation failure: %j", async (response) => {
    const f = fixture();
    f.repository.claimForDispatch.mockResolvedValue(null);
    f.repository.claimForReconciliation.mockResolvedValue({ ...resetClaim, attemptNumber: 2 });
    f.service.reconcileMfaReset.mockResolvedValue(response);
    await expect(f.run()).resolves.toMatchObject({ outcome: "outcome_unknown" });
    expect(f.repository.recordResult.mock.calls[0][2]).not.toHaveProperty("retry");
    expect(f.service.resetMfaEnrollment).not.toHaveBeenCalled();
  });

  test("does not accept an invitation acknowledgement as reconciliation evidence", async () => {
    const f = fixture(invitationClaim);
    f.repository.claimForDispatch.mockResolvedValue(null);
    f.repository.claimForReconciliation.mockResolvedValue(invitationClaim);
    f.service.reconcileInvitation.mockResolvedValue(providerAccepted as never);
    await expect(f.run()).resolves.toEqual({ outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review" });
    expect(f.service.deliverInvitation).not.toHaveBeenCalled();
  });
});
