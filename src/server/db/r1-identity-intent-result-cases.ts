import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asRuntimeRole, asWorker, assertContained, claimIntent, createInvitationFixture, createRecoveryFixture,
  deleteSyntheticFactors, intentSnapshot, intentState, recordIntentResult, zeroFactorOutcome,
  type IntentCase, type RecoveryFixture,
} from "./r1-identity-intent-fixtures";
import {
  acceptedInvitation, insertHistoricalIntent, malformedOutcomes, terminalReset,
} from "./r1-identity-intent-history-fixtures";
import { createMembership, denied, invalidInput, type SecurityCommandFixture, type SecurityTransaction } from "./r1-security-command-fixtures";

async function myIdentityAt(sql: SecurityTransaction, fixture: RecoveryFixture, sessionId: string, issuedAt: number) {
  return asRuntimeRole(sql, "authenticated", async (runtime) => {
    await runtime`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      sub: fixture.subjectId, session_id: sessionId, aal: "aal2", role: "authenticated", aud: "authenticated",
      iat: issuedAt, exp: Math.floor(fixture.target.expiresAt.getTime() / 1000),
    })}, true)`;
    return runtime<{ id: string }[]>`SELECT id FROM public.mmhr_get_my_identity()`;
  });
}

async function renewedSessions(sql: SecurityTransaction, base: SecurityCommandFixture) {
  const f = await createRecoveryFixture(sql, base, { seedIntent: false });
  await createMembership(sql, base.organizationId, f.target);
  const oldSessionId = randomUUID();
  const freshSessionId = randomUUID();
  await sql`UPDATE auth.sessions SET created_at = clock_timestamp() - interval '30 minutes'
    WHERE id = ${f.target.sessionId}::uuid`;
  await sql`INSERT INTO auth.sessions (id, user_id, aal, created_at, updated_at, not_after)
    VALUES (${oldSessionId}::uuid, ${f.subjectId}::uuid, 'aal1', clock_timestamp() - interval '30 minutes',
      clock_timestamp(), ${f.target.expiresAt.toISOString()}::timestamptz)`;
  const token = await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
  await deleteSyntheticFactors(sql, f);
  const outcome = await zeroFactorOutcome(sql);
  expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, token, outcome))).toBe("recorded");
  await assertContained(sql, f);
  const factorId = randomUUID();
  await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    VALUES (${factorId}::uuid, ${f.subjectId}::uuid, 'totp', 'verified', clock_timestamp(), clock_timestamp())`;
  const restored = await sql`UPDATE auth.sessions SET factor_id = ${factorId}::uuid, aal = 'aal2', updated_at = clock_timestamp()
    WHERE id = ${f.target.sessionId}::uuid RETURNING id`;
  expect(restored).toHaveLength(1);
  await sql`INSERT INTO auth.sessions (id, user_id, aal, created_at, updated_at, not_after)
    VALUES (${freshSessionId}::uuid, ${f.subjectId}::uuid, 'aal1', clock_timestamp(),
      clock_timestamp(), ${f.target.expiresAt.toISOString()}::timestamptz)`;
  const probe = (sessionId: string, assurance: "aal1" | "aal2" = "aal1") => asRuntimeRole(sql, "authenticated", async (runtime) => {
    await runtime`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      sub: f.subjectId, session_id: sessionId, aal: assurance, role: "authenticated", aud: "authenticated",
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(f.target.expiresAt.getTime() / 1000),
    })}, true)`;
    const identities = await runtime<{ id: string }[]>`SELECT id FROM public.mmhr_get_my_identity()`;
    const permissions = await runtime<{ identity_id: string }[]>`SELECT identity_id
      FROM public.mmhr_authorize('workspace.access', ${base.organizationId}::uuid)`;
    return { identities, permissions };
  });
  return { f, factorId, oldSessionId, freshSessionId, probe };
}

export const resultCases: readonly IntentCase[] = [
  {
    name: "denies a refreshed AAL1 token from a non-bound pre-reset session after reactivation",
    async run(sql, base) {
      const { f, factorId, oldSessionId, freshSessionId, probe } = await renewedSessions(sql, base);
      await sql`UPDATE public.identity_recovery_presence SET expected_replacement_factor_id = ${factorId}
        WHERE id = ${f.presenceId}::uuid`;
      await sql`UPDATE public.identity_recovery_presence SET state = 'completed', completed_at = clock_timestamp()
        WHERE id = ${f.presenceId}::uuid`;
      await sql`UPDATE public.identities SET status = 'active' WHERE id = ${f.target.identityId}::uuid`;
      const allowed = { identities: [{ id: f.target.identityId }], permissions: [{ identity_id: f.target.identityId }] };
      expect(await probe(freshSessionId)).toEqual(allowed);
      expect(await probe(f.target.sessionId, "aal2")).toEqual(allowed);
      expect(await probe(oldSessionId)).toEqual({ identities: [], permissions: [] });
    },
  },
  {
    name: "does not exempt a bound pre-reset session before its recovery presence is completed",
    async run(sql, base) {
      const { f, factorId, freshSessionId, probe } = await renewedSessions(sql, base);
      await sql`UPDATE public.identity_recovery_presence SET expected_replacement_factor_id = ${factorId}
        WHERE id = ${f.presenceId}::uuid`;
      await sql`UPDATE public.identities SET status = 'active' WHERE id = ${f.target.identityId}::uuid`;
      expect(await probe(freshSessionId)).toEqual({ identities: [{ id: f.target.identityId }],
        permissions: [{ identity_id: f.target.identityId }] });
      expect(await probe(f.target.sessionId, "aal2")).toEqual({ identities: [], permissions: [] });
    },
  },
  {
    name: "records zero-factor completion without reactivating identity, completing presence, or reviving sessions",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(claim).not.toBeNull();
      await deleteSyntheticFactors(sql, f);
      await sql`DELETE FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid`;
      const outcome = await zeroFactorOutcome(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome))).toBe("recorded");
      await assertContained(sql, f);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "succeeded", result_code: "mfa_zero_factors",
        confirmed_factor_count: 0, attempt_count: 1, dispatch_count: 1, lease_token: null, work_mode: null });
      const [request] = await sql<{ state: string; completed: boolean }[]>`SELECT state, completed_at IS NOT NULL AS completed
        FROM public.identity_recovery_requests WHERE id = ${f.requestId}::uuid`;
      const [presence] = await sql<{ state: string; completed_at: null }[]>`SELECT state, completed_at
        FROM public.identity_recovery_presence WHERE id = ${f.presenceId}::uuid`;
      expect(request).toEqual({ state: "completed", completed: true });
      expect(presence).toEqual({ state: "linked", completed_at: null });
      expect(await sql`SELECT id FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid`).toHaveLength(0);
      const events = await sql<{ action: string }[]>`SELECT action FROM public.audit_events
        WHERE idempotency_key = ${f.idempotencyKey} ORDER BY action`;
      expect(events.map((row) => row.action)).toEqual([
        "identity.intent.dispatch", "identity.intent.result", "identity.recovery.contain", "identity.recovery.reset_confirmed",
      ]);
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome))).toBe("stale_lease");
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  ...(["verified", "unverified"] as const).map((status): IntentCase => ({
    name: `rejects a zero-factor claim while one ${status} factor remains`,
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      await deleteSyntheticFactors(sql, f);
      await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
        VALUES (${randomUUID()}::uuid, ${f.subjectId}::uuid, 'totp', ${status}::auth.factor_status, now(), now())`;
      const before = await intentSnapshot(sql);
      const outcome = await zeroFactorOutcome(sql);
      await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome))).rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  })),
  {
    name: "rolls back result, request completion, and attempt history when the final audit fails",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      await deleteSyntheticFactors(sql, f);
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_intent_result_audit_failure
        CHECK (action <> 'identity.intent.result') NOT VALID`;
      const before = await intentSnapshot(sql);
      const outcome = await zeroFactorOutcome(sql);
      await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome)))
        .rejects.toMatchObject({ code: "23514" });
      expect(await intentSnapshot(sql)).toEqual(before);
      await assertContained(sql, f);
    },
  },
  {
    name: "keeps reset failure terminal and contained without a second destructive dispatch",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, terminalReset))).toBe("recorded");
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "failed", manual_review_required: true,
        safe_error_code: "factors_remaining", dispatch_count: 1 });
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      await expect(sql.savepoint((owner) => owner`UPDATE public.identity_admin_intents SET state = 'pending'
        WHERE id = ${f.intentId}::uuid`)).rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
      await assertContained(sql, f);
    },
  },
  {
    name: "rejects arbitrary or sensitive outcome fields without storing them",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      const before = await intentSnapshot(sql);
      for (const outcome of malformedOutcomes) {
        await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome)))
          .rejects.toMatchObject(invalidInput);
        expect(await intentSnapshot(sql)).toEqual(before);
      }
    },
  },
  {
    name: "requires the correct operation result and numeric zero observed during the current attempt",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      await deleteSyntheticFactors(sql, f);
      const valid = await zeroFactorOutcome(sql);
      const before = await intentSnapshot(sql);
      for (const outcome of [
        acceptedInvitation, { ...valid, confirmedFactorCount: "0" }, { ...valid, confirmedFactorCount: 1 },
        { ...valid, observedAt: "now" }, { ...valid, observedAt: "2026-13-40T99:99:99Z" },
        { ...valid, subjectId: f.subjectId }, { ...valid, observedAt: null },
        { outcome: "failed", code: "provider_rejected", retry: "safe" },
      ]) {
        await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome)))
          .rejects.toMatchObject(invalidInput);
      }
      for (const observedAt of ["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
        await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, { ...valid, observedAt })))
          .rejects.toMatchObject(denied);
      }
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "rejects foreign, missing, and malformed lease tokens with no outcome writes",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const other = await createInvitationFixture(sql, base);
      const first = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      const second = await asWorker(sql, (worker) => claimIntent(worker, other.intentId));
      const before = await intentSnapshot(sql);
      for (const [id, token] of [[f.intentId, second!.leaseToken], [f.intentId, randomUUID()], [randomUUID(), first!.leaseToken]]) {
        expect(await asWorker(sql, (worker) => recordIntentResult(worker, id!, token!, acceptedInvitation))).toBe("stale_lease");
      }
      await expect(asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, "invalid-token", acceptedInvitation)))
        .rejects.toMatchObject(invalidInput);
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "preserves intent provenance and completed outcomes even against owner-level rewrites",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      const rewrites = [
        "id = gen_random_uuid()", "idempotency_key = 'replacement-key'", "correlation_id = gen_random_uuid()",
        "initiated_by_identity_id = NULL", "maximum_attempts = 4", "created_at = created_at + interval '1 second'",
        "attempt_count = attempt_count + 2", "dispatch_count = 0", "operation = 'identity_relink'", "invitation_id = gen_random_uuid()",
      ];
      const before = await intentSnapshot(sql);
      for (const change of rewrites) {
        await expect(sql.savepoint((owner) => owner.unsafe(`UPDATE public.identity_admin_intents SET ${change} WHERE id = $1::uuid`, [f.intentId])))
          .rejects.toMatchObject(denied);
      }
      await expect(sql.savepoint((owner) => owner`UPDATE public.identity_intent_attempts SET lease_token = gen_random_uuid(),
        completed_at = clock_timestamp(), outcome = 'failed', next_action = 'none' WHERE intent_id = ${f.intentId}::uuid`))
        .rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, acceptedInvitation))).toBe("recorded");
      const completed = await intentSnapshot(sql);
      for (const statement of [
        "UPDATE public.identity_admin_intents SET safe_error_code = 'provider_rejected' WHERE id = $1::uuid",
        "DELETE FROM public.identity_admin_intents WHERE id = $1::uuid",
        "UPDATE public.identity_intent_attempts SET outcome = 'failed' WHERE intent_id = $1::uuid",
        "DELETE FROM public.identity_intent_attempts WHERE intent_id = $1::uuid",
      ]) {
        await expect(sql.savepoint((owner) => owner.unsafe(statement, [f.intentId]))).rejects.toMatchObject(denied);
      }
      await expect(sql.savepoint((owner) => owner`TRUNCATE public.identity_intent_attempts`)).rejects.toMatchObject({
        code: "P0001", message: "identity_intent_attempts is append-only",
      });
      expect(await intentSnapshot(sql)).toEqual(completed);
    },
  },
  {
    name: "keeps policy, approval, invitation, presence, and request bindings immutable",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const invitation = await createInvitationFixture(sql, base);
      const before = await intentSnapshot(sql);
      const statements = [
        "UPDATE mmhr_private.recovery_policy_state SET operations_evidence_id = gen_random_uuid()",
        "DELETE FROM mmhr_private.recovery_policy_state", "TRUNCATE mmhr_private.recovery_policy_state",
        "UPDATE public.identity_recovery_approvals SET evidence_reference = 'rewritten'",
        "DELETE FROM public.identity_recovery_approvals", "TRUNCATE public.identity_recovery_approvals",
        "UPDATE public.identity_recovery_presence SET auth_subject_id = gen_random_uuid()",
        "UPDATE public.identity_recovery_presence SET auth_session_id = 'rewritten'",
        "UPDATE public.identity_recovery_presence SET linked_at = linked_at + interval '1 second'",
        "UPDATE public.identity_recovery_presence SET expires_at = expires_at + interval '1 second'",
        "UPDATE public.identity_recovery_requests SET initiated_by_identity_id = gen_random_uuid()",
        "UPDATE public.identity_recovery_requests SET target_identity_id = gen_random_uuid()",
        "UPDATE public.identity_recovery_requests SET approved_at = approved_at + interval '1 second'",
        "UPDATE public.identity_recovery_requests SET expires_at = expires_at + interval '1 second'",
      ];
      for (const statement of statements) {
        const appendOnlyTable = statement.includes("recovery_policy_state") ? "recovery_policy_state"
          : statement.includes("identity_recovery_approvals") ? "identity_recovery_approvals" : null;
        await expect(sql.savepoint((owner) => owner.unsafe(statement))).rejects.toMatchObject(appendOnlyTable
          ? { code: "P0001", message: `${appendOnlyTable} is append-only` } : denied);
      }
      await expect(sql.savepoint((owner) => owner`UPDATE public.invitations SET
        email = 'new@example.invalid', normalized_email = 'new@example.invalid' WHERE id = ${invitation.invitationId}::uuid`))
        .rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
      const factorId = randomUUID();
      await sql`UPDATE public.identity_recovery_presence SET expected_replacement_factor_id = ${factorId}
        WHERE id = ${f.presenceId}::uuid`;
      for (const replacement of [null, randomUUID()]) {
        await expect(sql.savepoint((owner) => owner`UPDATE public.identity_recovery_presence
          SET expected_replacement_factor_id = ${replacement} WHERE id = ${f.presenceId}::uuid`)).rejects.toMatchObject(denied);
      }
    },
  },
  {
    name: "keeps the authorization fence after later synthetic re-enrollment and rejects reset-second tokens",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      const token = await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      await deleteSyntheticFactors(sql, f);
      const outcome = await zeroFactorOutcome(sql);
      expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, token, outcome))).toBe("recorded");
      await assertContained(sql, f);
      const [fence] = await sql<{ epoch: string }[]>`SELECT floor(extract(epoch FROM authorization_not_before))::text AS epoch
        FROM public.identities WHERE id = ${f.target.identityId}::uuid`;
      const factorId = randomUUID();
      const sessionId = randomUUID();
      await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
        VALUES (${factorId}::uuid, ${f.subjectId}::uuid, 'totp', 'verified', now(), now())`;
      await sql`INSERT INTO auth.sessions (id, user_id, factor_id, aal, not_after, created_at, updated_at)
        VALUES (${sessionId}::uuid, ${f.subjectId}::uuid, ${factorId}::uuid, 'aal2',
          ${f.target.expiresAt.toISOString()}::timestamptz, now(), now())`;
      expect(await myIdentityAt(sql, f, sessionId, Math.floor(Date.now() / 1000))).toHaveLength(0);
      // Owner-only simulation of a later, separately verified recovery completion.
      // The worker itself never performs this activation or creates these factors.
      await sql`UPDATE public.identities SET status = 'active' WHERE id = ${f.target.identityId}::uuid`;
      for (const issuedAt of [Number(fence!.epoch) - 1, Number(fence!.epoch)]) {
        expect(await myIdentityAt(sql, f, sessionId, issuedAt)).toHaveLength(0);
      }
      expect(await myIdentityAt(sql, f, sessionId, Math.floor(Date.now() / 1000))).toEqual([{ id: f.target.identityId }]);
      for (const statement of [
        "UPDATE public.identities SET authorization_not_before = NULL WHERE id = $1::uuid",
        "UPDATE public.identities SET authorization_not_before = authorization_not_before - interval '1 second' WHERE id = $1::uuid",
      ]) {
        await expect(sql.savepoint((owner) => owner.unsafe(statement, [f.target.identityId]))).rejects.toMatchObject(denied);
      }
    },
  },
];
