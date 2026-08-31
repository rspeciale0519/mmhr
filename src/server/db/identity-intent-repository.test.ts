import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { dispatchIdentityIntent } from "@/server/identity/intent-dispatcher";
import {
  identityIntentFailureCodes, identityIntentWorkerFunctions,
  type IdentityIntentClaim, type IdentityIntentOutcome,
} from "@/server/identity/intent-worker-contract";
import type { IdentityService } from "@/server/identity/service";
import {
  createIdentityIntentRepository, IdentityIntentRepositoryError, type IdentityIntentSqlExecutor,
} from "./identity-intent-repository";

const intentId = "abcdefab-1111-4111-8111-111111111111";
const subjectId = "abcdefab-2222-4222-8222-222222222222";
const correlationId = "abcdefab-3333-4333-8333-333333333333";
const idempotencyKey = "abcdefab-4444-4444-8444-444444444444".toUpperCase();
const leaseToken = "Test_Lease_Upper_and_lower_Case_1234567890";
const observedAt = "2026-08-30T22:00:00.000Z";
const common = {
  intentId, correlationId, idempotencyKey, leaseToken,
  leaseExpiresAt: "2026-08-30T22:01:00.000Z", attemptNumber: 1, maximumAttempts: 5,
};
const resetClaim = { ...common, operation: "mfa_enrollment_reset", subjectId } as const satisfies IdentityIntentClaim;
const invitationClaim = { ...common, operation: "invitation_delivery", email: "invited@example.test" } as const satisfies IdentityIntentClaim;
const invitationOutcome = { outcome: "succeeded", resultCode: "invitation_provider_accepted" } as const;
const resetOutcome = { outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt } as const;
const outcomes: IdentityIntentOutcome[] = [
  invitationOutcome, resetOutcome,
  ...identityIntentFailureCodes.flatMap((code) => (["never", "manual_review"] as const)
    .map((retry) => ({ outcome: "failed" as const, code, retry }))),
  { outcome: "failed", code: "provider_rejected", retry: "safe" },
  ...(["provider_outcome_unknown", "provider_response_invalid", "factors_remaining", "delivery_unverifiable"] as const)
    .flatMap((code) => (["reconcile", "manual_review"] as const)
      .map((nextAction) => ({ outcome: "outcome_unknown" as const, code, nextAction }))),
];
const claimMethods = ["claimForDispatch", "claimForReconciliation"] as const;
const execute = vi.fn<IdentityIntentSqlExecutor["execute"]>();
const repository = createIdentityIntentRepository({ execute });
const dialect = new PgDialect();

function queryAt(index = 0) {
  const query = dialect.sqlToQuery(execute.mock.calls[index][0]);
  return { sql: query.sql.replace(/\s+/g, " ").trim(), params: query.params };
}

function record(intent: unknown = intentId, lease: unknown = leaseToken, outcome: unknown = invitationOutcome) {
  return repository.recordResult(intent as string, lease as string, outcome as IdentityIntentOutcome);
}

function dispatchFixture() {
  const success = { outcome: "succeeded", value: { subjectId, confirmedFactorCount: 0, observedAt } } as const;
  const service = {
    providerWriteIdempotency: "unsupported" as const,
    getVerificationFacts: vi.fn<IdentityService["getVerificationFacts"]>(),
    listMfaFactors: vi.fn<IdentityService["listMfaFactors"]>(),
    resetMfaEnrollment: vi.fn<IdentityService["resetMfaEnrollment"]>().mockResolvedValue(success),
    reconcileMfaReset: vi.fn<IdentityService["reconcileMfaReset"]>().mockResolvedValue(success),
    deliverInvitation: vi.fn<IdentityService["deliverInvitation"]>(),
    reconcileInvitation: vi.fn<IdentityService["reconcileInvitation"]>(),
  } satisfies IdentityService;
  return {
    service,
    run: () => dispatchIdentityIntent({ intentId }, { repository, service, now: () => Date.parse(observedAt) }),
  };
}

describe("fixed identity-intent SQL repository", () => {
  beforeEach(() => { execute.mockReset().mockResolvedValue([{ claim: resetClaim }]); });

  test("exposes only the three worker contract methods", () => {
    expect(Object.keys(repository).sort()).toEqual(Object.keys(identityIntentWorkerFunctions).sort());
  });

  test.each(claimMethods)("%s uses one literal private function and a bound UUID", async (method) => {
    await expect(repository[method](intentId.toUpperCase())).resolves.toEqual(resetClaim);
    expect(execute).toHaveBeenCalledOnce();
    expect(queryAt()).toEqual({
      sql: `SELECT mmhr_private.${identityIntentWorkerFunctions[method]}($1::uuid) AS claim`,
      params: [intentId],
    });
    expect(queryAt().sql).not.toContain(intentId);
    expect(queryAt().params).not.toContain(subjectId);
    expect(queryAt().params).not.toContain(correlationId);
    expect(queryAt().params).not.toContain(idempotencyKey);
  });

  test.each(claimMethods)("%s returns null only for an explicit null claim", async (method) => {
    execute.mockResolvedValue([{ claim: null }]);
    await expect(repository[method](intentId)).resolves.toBeNull();
    expect(execute).toHaveBeenCalledOnce();
  });

  test.each(claimMethods)("%s preserves authorized operation context and opaque lease bytes", async (method) => {
    execute.mockResolvedValue([{ claim: {
      ...invitationClaim, intentId: intentId.toUpperCase(), correlationId: correlationId.toUpperCase(),
      email: "  INVITED@EXAMPLE.TEST  ",
    } }]);
    await expect(repository[method](intentId)).resolves.toEqual(invitationClaim);
    expect((await repository[method](intentId))?.idempotencyKey).toBe(idempotencyKey);
    expect((await repository[method](intentId))?.leaseToken).toBe(leaseToken);
  });

  test("accepts the last reconciliation attempt and an original digest key without replacement", async () => {
    const claim = { ...resetClaim, attemptNumber: 5, idempotencyKey: "a".repeat(64) };
    execute.mockResolvedValue([{ claim }]);
    await expect(repository.claimForReconciliation(intentId)).resolves.toEqual(claim);
    expect(execute).toHaveBeenCalledOnce();
  });

  test("does not replace an expired returned lease or consult an application clock", async () => {
    const claim = { ...resetClaim, leaseExpiresAt: "2000-01-01T00:00:00Z" };
    execute.mockResolvedValue([{ claim }]);
    await expect(repository.claimForDispatch(intentId)).resolves.toEqual(claim);
    expect(execute).toHaveBeenCalledOnce();
  });

  test("accepts driver array metadata without forwarding it in the claim", async () => {
    execute.mockResolvedValue(Object.assign([{ claim: resetClaim }], { count: 1, command: "SELECT" }));
    await expect(repository.claimForDispatch(intentId)).resolves.toEqual(resetClaim);
  });

  test.each([
    null, undefined, [], {}, { intentId }, { intentId, actorId: subjectId },
    { intentId, operation: "invitation_delivery", email: "other@example.test" },
    "invalid", "", 1, `${intentId}'::uuid); SELECT 1; --`,
  ])("rejects invalid claim IDs and caller-selected metadata before SQL: %j", async (value) => {
    for (const method of claimMethods) {
      await expect(repository[method](value as string)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, {}, { rows: [{ claim: resetClaim }] }, [],
    [{ claim: resetClaim }, { claim: resetClaim }], [null], [{}], [{ claim: undefined }],
    [{ claim: [resetClaim] }], [{ claim: resetClaim, actorId: subjectId }],
    ...[
      { intentId: subjectId }, { intentId: "invalid" }, { subjectId: "invalid" },
      { correlationId: "invalid" }, { idempotencyKey: "invalid" }, { leaseToken: "short" },
      { leaseExpiresAt: "not-a-date" }, { attemptNumber: 0 }, { attemptNumber: 6 },
      { maximumAttempts: 0 }, { maximumAttempts: 6 }, { attemptNumber: 2, maximumAttempts: 1 },
      { actorId: subjectId }, { operation: "identity_relink" }, { email: "other@example.test" },
      { providerPayload: "private" }, { subjectId: undefined },
    ].map((change) => [{ claim: { ...resetClaim, ...change } }]),
    [{ claim: { ...invitationClaim, email: "invalid" } }],
    [{ claim: { ...invitationClaim, subjectId } }],
  ])("rejects malformed, extra, or foreign claims without retry: %j", async (rows) => {
    execute.mockResolvedValue(rows);
    for (const method of claimMethods) {
      const result = repository[method](intentId);
      await expect(result).rejects.toBeInstanceOf(IdentityIntentRepositoryError);
      await expect(result).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "Identity intent storage could not be accessed" });
      await expect(result).rejects.not.toHaveProperty("cause");
    }
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test.each(outcomes)("records one allowlisted outcome as bound JSON: %j", async (outcome) => {
    execute.mockResolvedValue([{ result: "recorded" }]);
    await expect(repository.recordResult(intentId.toUpperCase(), leaseToken, outcome)).resolves.toBe("recorded");
    expect(execute).toHaveBeenCalledOnce();
    const query = queryAt();
    expect(query.sql).toBe("SELECT mmhr_private.mmhr_record_identity_intent_result( $1::uuid, $2::text, $3::jsonb ) AS result");
    expect(query.params).toHaveLength(3);
    expect(query.params.slice(0, 2)).toEqual([intentId, leaseToken]);
    expect(JSON.parse(query.params[2] as string)).toEqual(outcome);
    expect(query.sql).not.toContain(leaseToken);
    expect(query.sql).not.toContain(intentId);
    expect(query.sql).not.toContain(outcome.outcome);
  });

  test("returns a stale lease acknowledgement without retry or another claim", async () => {
    execute.mockResolvedValue([{ result: "stale_lease" }]);
    await expect(record()).resolves.toBe("stale_lease");
    expect(execute).toHaveBeenCalledOnce();
    expect(queryAt().sql).toContain("mmhr_private.mmhr_record_identity_intent_result(");
  });

  test("preserves an uppercase UUID lease and the supplied observation timestamp", async () => {
    execute.mockResolvedValue([{ result: "recorded" }]);
    const lease = "abcdefab-5555-4555-8555-555555555555".toUpperCase();
    const outcome = { ...resetOutcome, observedAt: "2026-08-30T18:00:00-04:00" };
    await record(intentId, lease, outcome);
    expect(queryAt().params).toEqual([intentId, lease, JSON.stringify(outcome)]);
  });

  test.each([
    null, undefined, "", "invalid", 1, { intentId, actorId: subjectId },
  ])("rejects invalid result IDs before SQL: %j", async (value) => {
    await expect(repository.recordResult(value as string, leaseToken, invitationOutcome))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, "", "short", "x".repeat(31), "x".repeat(129), "x".repeat(32) + "'",
    `${leaseToken} `, ` ${leaseToken}`, { leaseToken, subjectId }, 1,
  ])("rejects invalid lease tokens before SQL: %j", async (value) => {
    await expect(repository.recordResult(intentId, value as string, invitationOutcome))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, {}, [], { outcome: "pending" }, { ...invitationOutcome, operation: "invitation_delivery" },
    { ...invitationOutcome, subjectId }, { ...invitationOutcome, actorId: subjectId },
    { ...invitationOutcome, email: invitationClaim.email }, { ...invitationOutcome, role: "super_admin" },
    { ...invitationOutcome, intentId }, { ...invitationOutcome, providerPayload: "private" },
    { ...resetOutcome, confirmedFactorCount: 1 }, { ...resetOutcome, observedAt: "invalid" },
    { outcome: "failed", code: "private SQL error", retry: "never" },
    { outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "retry" },
    ...identityIntentFailureCodes.filter((code) => code !== "provider_rejected")
      .map((code) => ({ outcome: "failed", code, retry: "safe" })),
  ])("rejects unsafe outcomes and injected states or targets before SQL: %j", async (value) => {
    await expect(repository.recordResult(intentId, leaseToken, value as IdentityIntentOutcome))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([
    null, undefined, {}, [], { rows: [{ result: "recorded" }] },
    [{ result: "recorded" }, { result: "recorded" }], [null], [{}], [{ result: null }],
    [{ result: "succeeded" }], [{ result: { outcome: "recorded" } }],
    [{ result: "recorded", intentId: subjectId }], [{ result: "recorded", rawError: "private" }],
    [{ result: "stale_lease", operation: "mfa_enrollment_reset" }],
  ])("rejects malformed, extra, or foreign acknowledgements without another write: %j", async (rows) => {
    execute.mockResolvedValue(rows);
    const result = record();
    await expect(result).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "Identity intent storage could not be accessed" });
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(execute).toHaveBeenCalledOnce();
  });

  test.each(["claimForDispatch", "claimForReconciliation", "recordResult"] as const)(
    "%s discards SQL errors and does not retry ambiguous execution", async (method) => {
      execute.mockRejectedValue(new Error("private SQL and connection information"));
      const result = method === "recordResult" ? record() : repository[method](intentId);
      await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Identity intent storage could not be accessed" });
      await expect(result).rejects.not.toHaveProperty("cause");
      expect(execute).toHaveBeenCalledOnce();
    },
  );

  test("sanitizes a synchronous executor failure", async () => {
    execute.mockImplementation(() => { throw new Error("private SQL parameters"); });
    await expect(repository.claimForDispatch(intentId)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(execute).toHaveBeenCalledOnce();
  });

  test("leaves repeat-result idempotency to SQL with unchanged bound values", async () => {
    execute.mockResolvedValue([{ result: "recorded" }]);
    await expect(record()).resolves.toBe("recorded");
    await expect(record()).resolves.toBe("recorded");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(queryAt(1)).toEqual(queryAt(0));
  });

  test("does not cache a claim or repeat it when the next database claim is unavailable", async () => {
    execute.mockResolvedValueOnce([{ claim: resetClaim }]).mockResolvedValueOnce([{ claim: null }]);
    await expect(repository.claimForDispatch(intentId)).resolves.toEqual(resetClaim);
    await expect(repository.claimForDispatch(intentId)).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(queryAt(1)).toEqual(queryAt(0));
  });

  test("awaits a promise-like Drizzle execution without requiring a driver or pool", async () => {
    const executor: IdentityIntentSqlExecutor = {
      execute: () => ({ then: (resolve, reject) => Promise.resolve([{ claim: resetClaim }]).then(resolve, reject) }),
    };
    await expect(createIdentityIntentRepository(executor).claimForDispatch(intentId)).resolves.toEqual(resetClaim);
  });

  test.each(["transport", "foreign_claim"] as const)("a %s claim failure prevents provider access and reconciliation fallback", async (failure) => {
    const fixture = dispatchFixture();
    if (failure === "transport") execute.mockRejectedValueOnce(new Error("private claim failure"));
    else execute.mockResolvedValueOnce([{ claim: { ...resetClaim, intentId: subjectId } }]);
    await expect(fixture.run()).resolves.toEqual({
      outcome: "outcome_unknown", code: "repository_unavailable", nextAction: "reconcile",
    });
    expect(execute).toHaveBeenCalledOnce();
    for (const method of [fixture.service.resetMfaEnrollment, fixture.service.reconcileMfaReset,
      fixture.service.deliverInvitation, fixture.service.reconcileInvitation]) expect(method).not.toHaveBeenCalled();
  });

  test.each(["stale_lease", "malformed", "transport"] as const)("a %s result remains unknown without repeating the provider write", async (failure) => {
    const fixture = dispatchFixture();
    execute.mockResolvedValueOnce([{ claim: resetClaim }]);
    if (failure === "transport") execute.mockRejectedValueOnce(new Error("private result failure"));
    else execute.mockResolvedValueOnce(failure === "stale_lease"
      ? [{ result: "stale_lease" }]
      : [{ result: "recorded", subjectId }]);
    await expect(fixture.run()).resolves.toEqual({
      outcome: "outcome_unknown",
      code: failure === "stale_lease" ? "lease_superseded" : "result_recording_failed",
      nextAction: "reconcile",
    });
    expect(fixture.service.resetMfaEnrollment).toHaveBeenCalledOnce();
    expect(fixture.service.reconcileMfaReset).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(queryAt(1).params[1]).toBe(leaseToken);
  });

  test("reconciles a lost result acknowledgement with a new database lease and no repeated reset", async () => {
    const fixture = dispatchFixture();
    const nextLease = "Test_Next_Lease_Upper_and_lower_1234567890";
    execute.mockResolvedValueOnce([{ claim: resetClaim }])
      .mockRejectedValueOnce(new Error("acknowledgement lost"))
      .mockResolvedValueOnce([{ claim: null }])
      .mockResolvedValueOnce([{ claim: { ...resetClaim, leaseToken: nextLease, attemptNumber: 2 } }])
      .mockResolvedValueOnce([{ result: "recorded" }]);
    await expect(fixture.run()).resolves.toMatchObject({ outcome: "outcome_unknown", code: "result_recording_failed" });
    await expect(fixture.run()).resolves.toEqual(resetOutcome);
    expect(fixture.service.resetMfaEnrollment).toHaveBeenCalledOnce();
    expect(fixture.service.reconcileMfaReset).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(5);
    expect(queryAt(2)).toEqual(queryAt(0));
    expect(queryAt(3).sql).toBe("SELECT mmhr_private.mmhr_claim_identity_intent_reconciliation($1::uuid) AS claim");
    expect(queryAt(4).params).toEqual([intentId, nextLease, JSON.stringify(resetOutcome)]);
  });
});
