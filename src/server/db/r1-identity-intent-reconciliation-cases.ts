import { expect } from "vitest";

import {
  asWorker, assertContained, claimIntent, createInvitationFixture, createRecoveryFixture,
  deleteSyntheticFactors, intentSnapshot, intentState, recordIntentResult, zeroFactorOutcome,
  type IntentCase,
} from "./r1-identity-intent-fixtures";
import {
  acceptedInvitation, insertHistoricalIntent, nonRetryableInvitationOutcomes,
  rejectedInvitation, terminalReset, unknownReset,
} from "./r1-identity-intent-history-fixtures";
import { denied, invalidInput } from "./r1-security-command-fixtures";

export const reconciliationCases: readonly IntentCase[] = [
  {
    name: "converts an expired dispatch to unknown and leases read-only reconciliation once",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      const oldToken = await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      const factorsBefore = await sql`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`;
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true));
      expect(claim).toMatchObject({ intentId: f.intentId, attemptNumber: 2, operation: "mfa_enrollment_reset" });
      expect(claim!.leaseToken).not.toBe(oldToken);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "outcome_unknown", work_mode: "reconciliation",
        attempt_count: 2, dispatch_count: 1, safe_error_code: "lease_expired" });
      const attempts = await sql<{ mode: string; outcome: string | null; safe_error_code: string | null; next_action: string | null }[]>`
        SELECT mode, outcome, safe_error_code, next_action FROM public.identity_intent_attempts
        WHERE intent_id = ${f.intentId}::uuid ORDER BY attempt_number`;
      expect(attempts).toEqual([
        { mode: "dispatch", outcome: "outcome_unknown", safe_error_code: "lease_expired", next_action: "reconcile" },
        { mode: "reconciliation", outcome: null, safe_error_code: null, next_action: null },
      ]);
      expect(await sql`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`).toEqual(factorsBefore);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      const beforeStale = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, oldToken, terminalReset))).toBe("stale_lease");
      expect(await intentSnapshot(sql)).toEqual(beforeStale);
      await assertContained(sql, f);
    },
  },
  {
    name: "permits reconciliation and current results after approval expiry and issuer authority loss",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false, requestCreatedOffsetMs: -25 * 60_000,
        requestExpiresOffsetMs: -5 * 60_000, presenceCreatedOffsetMs: -27 * 60_000,
        presenceExpiresOffsetMs: 3 * 60_000, approvedOffsetMs: -24 * 60_000, approvalOffsetMs: -24 * 60_000 });
      await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${base.pair[0].identityId}::uuid`;
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true));
      expect(claim).not.toBeNull();
      await deleteSyntheticFactors(sql, f);
      const outcome = await zeroFactorOutcome(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome))).toBe("recorded");
      await assertContained(sql, f);
    },
  },
  {
    name: "accepts a late result with the current expired lease token without dispatching again",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      const token = await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      await deleteSyntheticFactors(sql, f);
      const outcome = await zeroFactorOutcome(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, token, outcome))).toBe("recorded");
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "succeeded", attempt_count: 1, dispatch_count: 1 });
      await assertContained(sql, f);
    },
  },
  ...(["unknown", "expired_reconciliation"] as const).map((state): IntentCase => ({
    name: `keeps ${state} reset work read-only and never increases dispatch count`,
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true));
      expect(claim).not.toBeNull();
      expect(await intentState(sql, f.intentId)).toMatchObject({ work_mode: "reconciliation", dispatch_count: 1 });
      const before = await intentSnapshot(sql);
      await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, terminalReset)))
        .rejects.toMatchObject(invalidInput);
      expect(await intentSnapshot(sql)).toEqual(before);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, unknownReset))).toBe("recorded");
    },
  })),
  {
    name: "uses backoff after unknown results without making reset dispatch eligible",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, unknownReset))).toBe("recorded");
      const [retry] = await sql<{ seconds: number }[]>`SELECT extract(epoch FROM next_attempt_at - completed_at)::int AS seconds
        FROM public.identity_admin_intents WHERE id = ${f.intentId}::uuid`;
      expect(retry!.seconds).toBe(30);
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "retries invitation delivery only after confirmed rejection and its stored deadline",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base, { seedIntent: false });
      const oldToken = await insertHistoricalIntent(sql, f, { state: "rejected" });
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(claim).toMatchObject({ operation: "invitation_delivery", email: f.email, attemptNumber: 2 });
      expect(claim!.leaseToken).not.toBe(oldToken);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, rejectedInvitation))).toBe("recorded");
      const [retry] = await sql<{ seconds: number }[]>`SELECT extract(epoch FROM next_attempt_at - completed_at)::int AS seconds
        FROM public.identity_admin_intents WHERE id = ${f.intentId}::uuid`;
      expect(retry!.seconds).toBe(60);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "failed", attempt_count: 2, dispatch_count: 2,
        manual_review_required: false, safe_error_code: "provider_rejected" });
    },
  },
  ...nonRetryableInvitationOutcomes.map((outcome): IntentCase => ({
    name: `never resends invitation after ${outcome.code}/${"retry" in outcome ? outcome.retry : outcome.nextAction}`,
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome))).toBe("recorded");
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  })),
  ...(["future_deadline", "missing_history", "null_rejection", "different_rejection", "manual_review"] as const)
    .map((scenario): IntentCase => ({
      name: `denies invitation retry with ${scenario}`,
      async run(sql, base) {
        const f = await createInvitationFixture(sql, base, { seedIntent: false });
        await insertHistoricalIntent(sql, f, { state: "rejected", futureRetry: scenario === "future_deadline",
          skipHistory: scenario === "missing_history", intentErrorCode: scenario === "null_rejection" ? null : undefined,
          errorCode: scenario === "different_rejection" ? "provider_unavailable" : undefined,
          manual: scenario === "manual_review" });
        const before = await intentSnapshot(sql);
        expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
        expect(await intentSnapshot(sql)).toEqual(before);
      },
    })),
  {
    name: "treats expired invitation delivery as read-only unknown, never as permission to resend",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true));
      expect(claim).not.toBeNull();
      await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, acceptedInvitation)))
        .rejects.toMatchObject(invalidInput);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, {
        outcome: "outcome_unknown", code: "delivery_unverifiable", nextAction: "manual_review",
      }))).toBe("recorded");
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "outcome_unknown", manual_review_required: true, dispatch_count: 1 });
    },
  },
  ...(["expired_dispatch", "expired_reconciliation"] as const).map((state): IntentCase => ({
    name: `closes ${state} at the attempt limit without creating a sixth attempt`,
    async run(sql, base) {
      const maximumAttempts = state === "expired_dispatch" ? 1 : 5;
      const f = await createRecoveryFixture(sql, base, { maximumAttempts, seedIntent: false });
      await insertHistoricalIntent(sql, f, { state, attempts: maximumAttempts });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "outcome_unknown", attempt_count: maximumAttempts,
        dispatch_count: 1, manual_review_required: true, lease_token: null, work_mode: null });
      expect(await sql`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${f.intentId}::uuid`).toHaveLength(maximumAttempts);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      await assertContained(sql, f);
    },
  })),
  {
    name: "stops safe invitation retries at the stored attempt limit",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base, { maximumAttempts: 1 });
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, rejectedInvitation))).toBe("recorded");
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "failed", manual_review_required: true, next_attempt_at: null });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
    },
  },
  {
    name: "rolls back expired-lease closure and replacement claim when reconciliation audit fails",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_intent_reconcile_audit_failure
        CHECK (action <> 'identity.intent.reconcile') NOT VALID`;
      const before = await intentSnapshot(sql);
      await expect(asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).rejects.toMatchObject({ code: "23514" });
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "denies reconciliation for unknown intent with no original dispatch history",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state: "unknown", attempts: 0 });
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "denies an expired live lease when its matching immutable attempt is absent",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state: "expired_dispatch", skipHistory: true });
      const before = await intentSnapshot(sql);
      await expect(asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
];
