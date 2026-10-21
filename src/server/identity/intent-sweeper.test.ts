import { describe, expect, test, vi } from "vitest";

import { dispatchIdentityIntent, type IdentityDispatchResult } from "./intent-dispatcher";
import {
  MAX_IDENTITY_INTENT_BATCH, sweepIdentityIntents,
  type IdentityIntentSweepDependencies, type IdentityIntentSweepStatus,
} from "./intent-sweeper";
import {
  identityIntentFailureCodes, type IdentityIntentClaim, type IdentityIntentRepository,
} from "./intent-worker-contract";
import type { IdentityOperation, IdentityService } from "./service";

vi.mock("server-only", () => ({}));

const ids = ["a", "b", "c", "d", "e", "f"].map((digit) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`);
const observedAt = "2026-08-30T20:00:00.000Z";
const notClaimed = { outcome: "not_claimed" } as const;
const accepted = { outcome: "succeeded", resultCode: "invitation_provider_accepted" } as const;
const safeRejection = { outcome: "failed", code: "provider_rejected", retry: "safe" } as const;
const zeroCounts = { succeeded: 0, not_claimed: 0, retry_pending: 0, reconcile: 0, needs_attention: 0 };
const secret = "private fixture token and provider data";

function fixture(candidates: unknown = [ids[0]]) {
  const source = {
    listCandidateIds: vi.fn<IdentityIntentSweepDependencies["source"]["listCandidateIds"]>()
      .mockResolvedValue(candidates as readonly string[]),
  };
  const dispatch = vi.fn<IdentityIntentSweepDependencies["dispatch"]>()
    .mockResolvedValue(notClaimed);
  return { source, dispatch, run: () => sweepIdentityIntents({ source, dispatch }) };
}

async function expectItem(
  result: unknown, status: IdentityIntentSweepStatus, outcome: string, code?: string,
) {
  const f = fixture();
  f.dispatch.mockResolvedValue(result as IdentityDispatchResult);
  await expect(f.run()).resolves.toEqual({
    outcome: "completed", counts: { ...zeroCounts, [status]: 1 },
    items: [{ intentId: ids[0], status, outcome, ...(code ? { code } : {}) }],
  });
  expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
  expect(f.dispatch).toHaveBeenCalledExactlyOnceWith({ intentId: ids[0] });
}

describe("identity intent sweep candidates", () => {
  test("completes an empty sweep without dispatch or invented success", async () => {
    const f = fixture([]);
    expect(MAX_IDENTITY_INTENT_BATCH).toBe(5);
    await expect(f.run()).resolves.toEqual({ outcome: "completed", items: [], counts: zeroCounts });
    expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, ids[0], {}, 3, [null], [undefined], [3], [{}], new Array(1),
    [""], ["invalid"], [` ${ids[0]}`], [ids[0].replace("-4aaa-", "-0aaa-")],
    [ids[0].replace("-8aaa-", "-7aaa-")], [ids[0].replace("-4aaa-", "-9aaa-")],
    [ids[0], ids[1], "invalid"], ids, [...ids.slice(0, 5), "invalid"],
  ].map((candidates) => ({ candidates })))("rejects the complete invalid or oversized list before dispatch: %j", async ({ candidates }) => {
    const f = fixture();
    f.source.listCandidateIds.mockResolvedValue(candidates as readonly string[]);
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "invalid_candidates", items: [], counts: zeroCounts });
    expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  test.each([[ids[0], ids[0]], [ids[0], ids[0].toUpperCase()], [ids[0].toUpperCase(), ids[0]]]
    .map((candidates) => ({ candidates })))(
    "rejects duplicate IDs after case normalization: %j", async ({ candidates }) => {
      const f = fixture(candidates);
      await expect(f.run()).resolves.toMatchObject({ outcome: "failed", code: "invalid_candidates" });
      expect(f.dispatch).not.toHaveBeenCalled();
    },
  );

  test("dispatches five normalized IDs once without changing the source list", async () => {
    const candidates = Object.freeze(ids.slice(0, 5).map((id, index) => index % 2 ? id : id.toUpperCase()));
    const f = fixture(candidates);
    const result = await f.run();
    expect(result).toEqual({ outcome: "completed", counts: { ...zeroCounts, not_claimed: 5 },
      items: ids.slice(0, 5).map((intentId) => ({ intentId, status: "not_claimed", outcome: "not_claimed" })) });
    expect(f.dispatch.mock.calls).toEqual(ids.slice(0, 5).map((intentId) => [{ intentId }]));
    expect(candidates[0]).toBe(ids[0].toUpperCase());
    expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
  });

  test("keeps the validated snapshot if the source list changes during dispatch", async () => {
    const candidates = ids.slice(0, 2);
    const f = fixture(candidates);
    f.dispatch.mockImplementation(async () => {
      candidates[1] = "invalid";
      candidates.push(ids[2]);
      return notClaimed;
    });
    await expect(f.run()).resolves.toMatchObject({ counts: { ...zeroCounts, not_claimed: 2 } });
    expect(f.dispatch.mock.calls).toEqual(ids.slice(0, 2).map((intentId) => [{ intentId }]));
  });

  test("uses the validated upper bound if the source changes its reported length", async () => {
    let lengthReads = 0;
    const candidates = new Proxy(ids, {
      get(target, key, receiver) {
        if (key === "length") return ++lengthReads === 1 ? 5 : 6;
        return Reflect.get(target, key, receiver);
      },
    });
    const f = fixture(candidates);
    await expect(f.run()).resolves.toMatchObject({ counts: { ...zeroCounts, not_claimed: 5 } });
    expect(f.dispatch.mock.calls).toEqual(ids.slice(0, 5).map((intentId) => [{ intentId }]));
  });

  test.each([NaN, -1, 0.5, "1", null, Infinity])("rejects an invalid reported list length: %j", async (length) => {
    const candidates = new Proxy(ids, {
      get(target, key, receiver) { return key === "length" ? length : Reflect.get(target, key, receiver); },
    });
    const f = fixture(candidates);
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "invalid_candidates", items: [], counts: zeroCounts });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  test.each([new Error(secret), secret, { message: secret, code: secret }, null])(
    "returns an explicit redacted source failure without retry", async (error) => {
      const f = fixture();
      f.source.listCandidateIds.mockRejectedValue(error);
      const result = await f.run();
      expect(result).toEqual({ outcome: "failed", code: "source_unavailable", items: [], counts: zeroCounts });
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
      expect(f.dispatch).not.toHaveBeenCalled();
    },
  );

  test("redacts a source list whose indexed value throws", async () => {
    const candidates = [ids[0]];
    Object.defineProperty(candidates, 0, { get() { throw new Error(secret); } });
    const f = fixture(candidates);
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "invalid_candidates", items: [], counts: zeroCounts });
    expect(f.dispatch).not.toHaveBeenCalled();
  });
});

describe("identity intent sweep outcomes", () => {
  test("keeps only the invitation success code", async () => {
    await expectItem(accepted, "succeeded", "succeeded", "invitation_provider_accepted");
  });

  test("removes factor counts and observation times from a valid reset success", async () => {
    await expectItem({ outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt },
      "succeeded", "succeeded", "mfa_zero_factors");
  });

  test("does not report an unclaimed intent as succeeded", async () => {
    await expectItem(notClaimed, "not_claimed", "not_claimed");
  });

  test("reports a dispatcher input rejection as needing attention", async () => {
    await expectItem({ outcome: "invalid_input" }, "needs_attention", "invalid_input");
  });

  test.each(identityIntentFailureCodes.flatMap((code) =>
    (["safe", "never", "manual_review"] as const).map((retry) => ({ code, retry }))))(
    "maps failed $code/$retry without another dispatch", async ({ code, retry }) => {
      const status = code === "provider_rejected" && retry === "safe" ? "retry_pending" : "needs_attention";
      await expectItem({ outcome: "failed", code, retry }, status, "failed", code);
    },
  );

  test.each([
    "provider_outcome_unknown", "provider_response_invalid", "factors_remaining", "delivery_unverifiable",
    "repository_unavailable", "invalid_claim", "lease_expired", "lease_superseded",
    "result_recording_failed", "service_contract_invalid",
  ].flatMap((code) => (["reconcile", "manual_review"] as const).map((nextAction) => ({ code, nextAction }))))(
    "maps uncertain $code/$nextAction without another dispatch", async ({ code, nextAction }) => {
      await expectItem({ outcome: "outcome_unknown", code, nextAction },
        nextAction === "reconcile" ? "reconcile" : "needs_attention", "outcome_unknown", code);
    },
  );

  test.each([
    null, undefined, [], {}, secret, { outcome: "succeeded" },
    { outcome: "succeeded", resultCode: secret },
    { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 1, observedAt },
    { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt: secret },
    { outcome: "succeeded", resultCode: "mfa_zero_factors", observedAt },
    { ...accepted, subjectId: ids[1] }, { ...notClaimed, error: secret },
    { ...safeRejection, message: secret }, { ...safeRejection, retry: "always" },
    { ...safeRejection, code: secret }, { outcome: "invalid_input", error: secret },
    { outcome: "outcome_unknown", code: secret, nextAction: "reconcile" },
    { outcome: "outcome_unknown", code: "result_recording_failed", nextAction: "retry" },
    { outcome: "outcome_unknown", code: "provider_outcome_unknown", nextAction: "reconcile", payload: secret },
  ].map((result) => ({ result })))("reports unexpected output as redacted attention: %j", async ({ result }) => {
    await expectItem(result, "needs_attention", "outcome_unknown", "invalid_dispatch_result");
  });

  test("redacts a returned outcome property that throws during validation", async () => {
    const result = { get outcome() { throw new Error(secret); } };
    await expectItem(result, "needs_attention", "outcome_unknown", "invalid_dispatch_result");
  });

  test.each(["throw", "reject"] as const)("continues after a dispatcher %s, without raw errors or retries", async (mode) => {
    const f = fixture(ids.slice(0, 2));
    if (mode === "throw") f.dispatch.mockImplementationOnce(() => { throw new Error(secret); });
    else f.dispatch.mockRejectedValueOnce({ code: secret, message: secret });
    const result = await f.run();
    expect(result).toEqual({ outcome: "completed", counts: { ...zeroCounts, needs_attention: 1, not_claimed: 1 }, items: [
      { intentId: ids[0], status: "needs_attention", outcome: "outcome_unknown", code: "dispatch_threw" },
      { intentId: ids[1], status: "not_claimed", outcome: "not_claimed" },
    ] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(f.dispatch.mock.calls).toEqual(ids.slice(0, 2).map((intentId) => [{ intentId }]));
  });

  test("counts every category once and does not retry pending or uncertain work", async () => {
    const f = fixture(ids.slice(0, 5));
    f.dispatch.mockResolvedValueOnce(accepted).mockResolvedValueOnce(notClaimed)
      .mockResolvedValueOnce(safeRejection)
      .mockResolvedValueOnce({ outcome: "outcome_unknown", code: "result_recording_failed", nextAction: "reconcile" })
      .mockRejectedValueOnce(new Error(secret));
    const result = await f.run();
    expect(result.outcome).toBe("completed");
    expect(result.counts).toEqual({ succeeded: 1, not_claimed: 1, retry_pending: 1, reconcile: 1, needs_attention: 1 });
    expect(result.items.map((item) => item.status)).toEqual(Object.keys(zeroCounts));
    expect(f.dispatch.mock.calls).toEqual(ids.slice(0, 5).map((intentId) => [{ intentId }]));
    expect(f.source.listCandidateIds).toHaveBeenCalledOnce();
  });

  test("waits for each dispatch before starting the next ID", async () => {
    const events: string[] = [];
    let release!: () => void;
    let signalStart!: () => void;
    const firstStarted = new Promise<void>((resolve) => { signalStart = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const f = fixture(ids.slice(0, 3));
    f.dispatch.mockImplementation(async ({ intentId }) => {
      events.push(`start:${intentId}`);
      if (intentId === ids[0]) { signalStart(); await gate; }
      events.push(`end:${intentId}`);
      return notClaimed;
    });
    const pending = f.run();
    await firstStarted;
    expect(events).toEqual([`start:${ids[0]}`]);
    expect(f.dispatch).toHaveBeenCalledOnce();
    release();
    await expect(pending).resolves.toMatchObject({ counts: { ...zeroCounts, not_claimed: 3 } });
    expect(events).toEqual(ids.slice(0, 3).flatMap((id) => [`start:${id}`, `end:${id}`]));
  });
});

function dispatcherFixture(operation: IdentityOperation, attemptNumber = 1) {
  const shared = { intentId: ids[0], correlationId: ids[1], idempotencyKey: ids[2], leaseToken: ids[3],
    leaseExpiresAt: "2026-08-30T20:01:00.000Z", attemptNumber, maximumAttempts: 5 };
  const claim: IdentityIntentClaim = operation === "invitation_delivery"
    ? { ...shared, operation, email: "fixture@example.com" }
    : { ...shared, operation, subjectId: ids[4] };
  const repository = {
    claimForDispatch: vi.fn<IdentityIntentRepository["claimForDispatch"]>().mockResolvedValue(claim),
    claimForReconciliation: vi.fn<IdentityIntentRepository["claimForReconciliation"]>().mockResolvedValue(null),
    recordResult: vi.fn<IdentityIntentRepository["recordResult"]>().mockResolvedValue("recorded"),
  } satisfies IdentityIntentRepository;
  const service = {
    providerWriteIdempotency: "unsupported" as const,
    getVerificationFacts: vi.fn<IdentityService["getVerificationFacts"]>(),
    listMfaFactors: vi.fn<IdentityService["listMfaFactors"]>(),
    resetMfaEnrollment: vi.fn<IdentityService["resetMfaEnrollment"]>().mockResolvedValue(safeRejection),
    reconcileMfaReset: vi.fn<IdentityService["reconcileMfaReset"]>(),
    deliverInvitation: vi.fn<IdentityService["deliverInvitation"]>().mockResolvedValue(safeRejection),
    reconcileInvitation: vi.fn<IdentityService["reconcileInvitation"]>(),
  } satisfies IdentityService;
  const dispatch = vi.fn<IdentityIntentSweepDependencies["dispatch"]>((request) => dispatchIdentityIntent(request,
    { repository, service, now: () => Date.parse(observedAt) }));
  return { repository, service, dispatch,
    run: () => sweepIdentityIntents({ source: { listCandidateIds: async () => [ids[0]] }, dispatch }) };
}

describe("identity intent sweep dispatcher proof", () => {
  test.each([
    ["invitation_delivery", 1, "retry_pending"],
    ["invitation_delivery", 5, "needs_attention"],
    ["mfa_enrollment_reset", 1, "needs_attention"],
  ] as const)("maps %s attempt %i from its actual recorded outcome", async (operation, attempt, status) => {
    const f = dispatcherFixture(operation, attempt);
    await expect(f.run()).resolves.toMatchObject({ outcome: "completed", counts: { ...zeroCounts, [status]: 1 },
      items: [{ intentId: ids[0], status, outcome: "failed", code: "provider_rejected" }] });
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.repository.claimForDispatch).toHaveBeenCalledExactlyOnceWith(ids[0]);
    expect(f.repository.claimForReconciliation).not.toHaveBeenCalled();
    expect(f.repository.recordResult).toHaveBeenCalledOnce();
    expect(f.service[operation === "invitation_delivery" ? "deliverInvitation" : "resetMfaEnrollment"])
      .toHaveBeenCalledOnce();
    expect(f.service.reconcileInvitation).not.toHaveBeenCalled();
    expect(f.service.reconcileMfaReset).not.toHaveBeenCalled();
  });

  test("does not call an unrecorded invitation rejection retryable", async () => {
    const f = dispatcherFixture("invitation_delivery");
    f.repository.recordResult.mockRejectedValue(new Error(secret));
    await expect(f.run()).resolves.toEqual({ outcome: "completed", counts: { ...zeroCounts, reconcile: 1 }, items: [
      { intentId: ids[0], status: "reconcile", outcome: "outcome_unknown", code: "result_recording_failed" },
    ] });
    expect(f.service.deliverInvitation).toHaveBeenCalledOnce();
    expect(f.repository.recordResult).toHaveBeenCalledOnce();
    expect(f.dispatch).toHaveBeenCalledOnce();
  });

  test.each(["provider", "result_recording"] as const)(
    "does not repeat an MFA reset after an uncertain %s result", async (phase) => {
      const f = dispatcherFixture("mfa_enrollment_reset");
      if (phase === "provider") f.service.resetMfaEnrollment.mockRejectedValue(new Error(secret));
      else f.repository.recordResult.mockRejectedValue(new Error(secret));
      await expect(f.run()).resolves.toEqual({ outcome: "completed", counts: { ...zeroCounts, reconcile: 1 }, items: [
        { intentId: ids[0], status: "reconcile", outcome: "outcome_unknown",
          code: phase === "provider" ? "provider_outcome_unknown" : "result_recording_failed" },
      ] });
      expect(f.service.resetMfaEnrollment).toHaveBeenCalledOnce();
      expect(f.service.reconcileMfaReset).not.toHaveBeenCalled();
      expect(f.service.deliverInvitation).not.toHaveBeenCalled();
      expect(f.repository.claimForDispatch).toHaveBeenCalledOnce();
      expect(f.repository.claimForReconciliation).not.toHaveBeenCalled();
      expect(f.repository.recordResult).toHaveBeenCalledOnce();
      expect(f.dispatch).toHaveBeenCalledOnce();
    },
  );
});
