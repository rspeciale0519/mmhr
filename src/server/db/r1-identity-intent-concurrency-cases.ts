import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import type { RehearsalContext } from "./r1-migration-rehearsal";
import {
  asWorker, assertContained, claimIntent, createInvitationFixture, createRecoveryFixture, deleteSyntheticFactors,
  intentSnapshot, intentState, recordIntentResult, zeroFactorOutcome, type RecoveryFixture,
} from "./r1-identity-intent-fixtures";
import { acceptedInvitation, insertHistoricalIntent } from "./r1-identity-intent-history-fixtures";
import {
  createMembership, createSecurityPrincipal, deferred, denied, waitForGuardWait,
  type SecurityCommandFixture, type SecurityTransaction,
} from "./r1-security-command-fixtures";

export type ConcurrentIntentCase = {
  name: string;
  run(context: RehearsalContext, foundation: SecurityCommandFixture): Promise<void>;
};

async function verifyFactorEnrollmentRaces(context: RehearsalContext, f: RecoveryFixture, leaseToken: string) {
  await deleteSyntheticFactors(context.client, f);
  const snapshotReady = deferred<void>();
  const releaseSnapshot = deferred<void>();
  const staleOutcome = await zeroFactorOutcome(context.client);
  const staleReader = context.client.begin("isolation level repeatable read", async (sql) => {
    expect(await sql`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`).toHaveLength(0);
    snapshotReady.resolve();
    await releaseSnapshot.promise;
    // This old view really hides the factor committed by the other connection.
    expect(await sql`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`).toHaveLength(0);
    return asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, leaseToken, staleOutcome));
  });
  void staleReader.catch(snapshotReady.reject);
  try {
    await snapshotReady.promise;
    await context.client`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${f.subjectId}::uuid, 'totp', 'unverified', clock_timestamp(), clock_timestamp())`;
  } finally {
    releaseSnapshot.resolve();
  }
  const frozenState = await intentSnapshot(context.client);
  const guard = await context.client`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`;
  await expect(staleReader).rejects.toMatchObject(denied);
  expect(await intentSnapshot(context.client)).toEqual(frozenState);
  expect(await context.client`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`).toEqual(guard);
  await deleteSyntheticFactors(context.client, f);
  const before = await intentState(context.client, f.intentId);
  const enrollerReady = deferred<SecurityTransaction>();
  const releaseEnroller = deferred<void>();
  const resultReady = deferred<number>();
  const racingFactorId = randomUUID();
  const enroller = context.client.begin(async (sql) => {
    await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      VALUES (${racingFactorId}::uuid, ${f.subjectId}::uuid, 'totp', 'unverified', clock_timestamp(), clock_timestamp())`;
    enrollerReady.resolve(sql);
    await releaseEnroller.promise;
  });
  void enroller.catch(enrollerReady.reject);
  const holdingEnrollment = await enrollerReady.promise;
  const outcome = await zeroFactorOutcome(holdingEnrollment);
  const recording = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    resultReady.resolve(backend!.id);
    return asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, leaseToken, outcome));
  });
  void recording.catch(resultReady.reject);
  try {
    await waitForGuardWait(holdingEnrollment, await resultReady.promise);
  } finally {
    releaseEnroller.resolve();
    await enroller;
    await expect(recording).rejects.toMatchObject(denied);
  }
  expect(await intentState(context.client, f.intentId)).toEqual(before);
  expect(await context.client`SELECT id FROM public.audit_events WHERE idempotency_key = ${f.idempotencyKey}
    AND action IN ('identity.intent.result', 'identity.recovery.reset_confirmed')`).toHaveLength(0);
  expect(await context.client`SELECT id FROM auth.mfa_factors WHERE id = ${racingFactorId}::uuid`).toHaveLength(1);

  await deleteSyntheticFactors(context.client, f);
  const completedReady = deferred<SecurityTransaction>();
  const releaseResult = deferred<void>();
  const insertionReady = deferred<number>();
  const completedOutcome = await zeroFactorOutcome(context.client);
  const successfulRecording = context.client.begin(async (sql) => {
    expect(await asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, leaseToken, completedOutcome))).toBe("recorded");
    completedReady.resolve(sql);
    await releaseResult.promise;
  });
  void successfulRecording.catch(completedReady.reject);
  const holdingResult = await completedReady.promise;
  const laterFactorId = randomUUID();
  const laterEnrollment = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    insertionReady.resolve(backend!.id);
    await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      VALUES (${laterFactorId}::uuid, ${f.subjectId}::uuid, 'totp', 'unverified', clock_timestamp(), clock_timestamp())`;
  });
  void laterEnrollment.catch(insertionReady.reject);
  try {
    await waitForGuardWait(holdingResult, await insertionReady.promise);
    expect(await holdingResult`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`).toHaveLength(0);
    expect(await intentState(holdingResult, f.intentId)).toMatchObject({ state: "succeeded", confirmed_factor_count: 0 });
  } finally {
    releaseResult.resolve();
    await successfulRecording;
    await laterEnrollment;
  }
  expect(await context.client`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.subjectId}::uuid`).toEqual([{ id: laterFactorId }]);
  expect(await intentState(context.client, f.intentId)).toMatchObject({ state: "succeeded", confirmed_factor_count: 0 });
  await assertContained(context.client, f);
}

export const concurrentIntentCases: readonly ConcurrentIntentCase[] = [
  ...(["repeatable read", "serializable"] as const).map((isolation): ConcurrentIntentCase => ({
    name: `denies result recording under ${isolation} before any state or authority writes`,
    async run(context, base) {
      const f = await context.client.begin((sql) => createInvitationFixture(sql, base));
      const claim = await context.client.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, f.intentId)));
      expect(claim).not.toBeNull();
      const before = await intentSnapshot(context.client);
      const guard = await context.client`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`;
      await expect(context.client.begin(`isolation level ${isolation}`, (sql) => asWorker(sql, (worker) =>
        recordIntentResult(worker, f.intentId, claim!.leaseToken, acceptedInvitation)))).rejects.toMatchObject(denied);
      expect(await intentSnapshot(context.client)).toEqual(before);
      expect(await context.client`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`).toEqual(guard);
    },
  })),
  {
    name: "gives one dispatch lease to competing workers for the same intent",
    async run(context, base) {
      const f = await context.client.begin((sql) => createInvitationFixture(sql, base));
      const invoke = () => context.client.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, f.intentId)));
      const results = await Promise.all([invoke(), invoke()]);
      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      expect(await intentState(context.client, f.intentId)).toMatchObject({ state: "in_flight", attempt_count: 1, dispatch_count: 1 });
      expect(await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${f.intentId}::uuid`).toHaveLength(1);
      expect(await context.client`SELECT id FROM public.audit_events WHERE idempotency_key = ${f.idempotencyKey}`).toHaveLength(1);
    },
  },
  {
    name: "records one outcome when two workers race with the same current token",
    async run(context, base) {
      const f = await context.client.begin((sql) => createInvitationFixture(sql, base));
      const claim = await context.client.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, f.intentId)));
      const outcomes = [acceptedInvitation, { outcome: "failed", code: "provider_rejected", retry: "never" }] as const;
      const results = await Promise.all(outcomes.map((outcome) => context.client.begin((sql) =>
        asWorker(sql, (worker) => recordIntentResult(worker, f.intentId, claim!.leaseToken, outcome)))));
      expect([...results].sort()).toEqual(["recorded", "stale_lease"]);
      const [attempt] = await context.client<{ outcome: string }[]>`SELECT outcome FROM public.identity_intent_attempts
        WHERE intent_id = ${f.intentId}::uuid AND completed_at IS NOT NULL`;
      expect(attempt!.outcome).toBe(outcomes[results.indexOf("recorded")]!.outcome);
      expect(await context.client`SELECT id FROM public.audit_events WHERE idempotency_key = ${f.idempotencyKey}
        AND action = 'identity.intent.result'`).toHaveLength(1);
    },
  },
  {
    name: "gives one read-only reconciliation lease to competing workers after expiry",
    async run(context, base) {
      const f = await context.client.begin(async (sql) => {
        const fixture = await createInvitationFixture(sql, base, { seedIntent: false });
        await insertHistoricalIntent(sql, fixture, { state: "expired_dispatch" });
        return fixture;
      });
      const invoke = () => context.client.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, f.intentId, true)));
      const claims = await Promise.all([invoke(), invoke()]);
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      expect(await intentState(context.client, f.intentId)).toMatchObject({ state: "outcome_unknown",
        work_mode: "reconciliation", attempt_count: 2, dispatch_count: 1 });
      expect(await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${f.intentId}::uuid`).toHaveLength(2);
    },
  },
  {
    name: "fails a stale repeatable-read claim after another security writer commits",
    async run(context, base) {
      const f = await context.client.begin((sql) => createInvitationFixture(sql, base));
      const captured = deferred<void>();
      const release = deferred<void>();
      const reader = context.client.begin("isolation level repeatable read", async (sql) => {
        await sql`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`;
        captured.resolve();
        await release.promise;
        return asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      });
      void reader.catch(captured.reject);
      try {
        await captured.promise;
        await context.client.begin((sql) => sql`SELECT mmhr_private.r1_lock_security()`);
      } finally {
        release.resolve();
      }
      await expect(reader).rejects.toMatchObject({ code: "40001" });
      expect(await intentState(context.client, f.intentId)).toMatchObject({ state: "pending", attempt_count: 0, dispatch_count: 0 });
    },
  },
  ...(["authority", "deadline"] as const).map((scenario): ConcurrentIntentCase => ({
    name: `checks current ${scenario} after a competing security writer releases the lock`,
    async run(context, base) {
      const { f, issuer } = await context.client.begin(async (sql) => {
        const issuer = await createSecurityPrincipal(sql);
        await createMembership(sql, base.organizationId, issuer, "organization_admin");
        const f = await createInvitationFixture(sql, base, { issuer, expiresOffsetMs: scenario === "deadline" ? 1_500 : undefined });
        return { f, issuer };
      });
      const writerReady = deferred<SecurityTransaction>();
      const releaseWriter = deferred<void>();
      const readerReady = deferred<number>();
      const writer = context.client.begin(async (sql) => {
        await sql`SELECT mmhr_private.r1_lock_security()`;
        if (scenario === "authority") await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
          WHERE id = ${issuer.identityId}::uuid`;
        writerReady.resolve(sql);
        await releaseWriter.promise;
      });
      void writer.catch(writerReady.reject);
      const holding = await writerReady.promise;
      const reader = context.client.begin(async (sql) => {
        const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
        readerReady.resolve(backend!.id);
        return asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      });
      void reader.catch(readerReady.reject);
      try {
        await waitForGuardWait(holding, await readerReady.promise);
        if (scenario === "deadline") {
          const [fresh] = await holding<{ fresh: boolean }[]>`SELECT expires_at > clock_timestamp() AS fresh
            FROM public.invitations WHERE id = ${f.invitationId}::uuid`;
          expect(fresh!.fresh).toBe(true);
          const deadline = Date.now() + 3_000;
          let expired = false;
          while (!expired && Date.now() < deadline) {
            const [row] = await holding<{ expired: boolean }[]>`SELECT expires_at <= clock_timestamp() AS expired
              FROM public.invitations WHERE id = ${f.invitationId}::uuid`;
            expired = row!.expired;
            if (!expired) await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(expired).toBe(true);
        }
      } finally {
        releaseWriter.resolve();
        await writer;
      }
      expect(await reader).toBeNull();
      expect(await intentState(context.client, f.intentId)).toMatchObject({ state: "pending", attempt_count: 0, dispatch_count: 0 });
      expect(await context.client`SELECT id FROM public.audit_events WHERE idempotency_key = ${f.idempotencyKey}`).toHaveLength(0);
    },
  })),
  {
    name: "serializes competing resets and both factor-enrollment orders around zero-factor result recording",
    async run(context, base) {
      const fixtures = await context.client.begin(async (sql) => [
        await createRecoveryFixture(sql, base), await createRecoveryFixture(sql, base),
      ]);
      const claims = await Promise.all(fixtures.map((f) => context.client.begin((sql) =>
        asWorker(sql, (worker) => claimIntent(worker, f.intentId)))));
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      expect(claims.filter((claim) => claim === null)).toHaveLength(1);
      const identities = await context.client<{ status: string }[]>`SELECT status FROM public.identities
        WHERE id IN (${fixtures[0]!.target.identityId}::uuid, ${fixtures[1]!.target.identityId}::uuid) ORDER BY status`;
      expect(identities).toEqual([{ status: "active" }, { status: "recovery_pending" }]);
      const before = await intentSnapshot(context.client);
      const loser = fixtures[claims.indexOf(null)]!;
      expect(await context.client.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, loser.intentId)))).toBeNull();
      expect(await intentSnapshot(context.client)).toEqual(before);
      const winnerIndex = claims.findIndex((claim) => claim !== null);
      await verifyFactorEnrollmentRaces(context, fixtures[winnerIndex]!, claims[winnerIndex]!.leaseToken);
    },
  },
];
