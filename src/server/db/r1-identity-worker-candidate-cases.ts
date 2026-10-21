import { expect } from "vitest";
import { createIdentityIntentRepository } from "./identity-intent-repository";
import {
  claimIntent, createInvitationFixture, createRecoveryFixture, databaseNow, intentState,
  type IntentFixture,
} from "./r1-identity-intent-fixtures";
import { acceptedInvitation, insertHistoricalIntent } from "./r1-identity-intent-history-fixtures";
import {
  expectReadOnlyCandidates, insertWorkerPending, withIdentityWorkerFixtures, type IdentityWorkerCase,
} from "./r1-identity-worker-fixtures";

const pendingExclusions = [
  "future retry", "manual review", "expired invitation", "cancelled intent", "busy lease",
  "successful intent", "missing correlation", "invalid correlation UUID", "invalid idempotency key",
  "unsupported retry limit",
] as const;

export const identityWorkerCandidateCases: readonly IdentityWorkerCase[] = [
  {
    name: "returns no rows when the durable outbox is empty",
    async run(context, worker) { await expectReadOnlyCandidates(context, worker, []); },
  },
  ...(["invitation_delivery", "mfa_enrollment_reset"] as const).map((operation): IdentityWorkerCase => ({
    name: `lists an authorized pending ${operation} without a claim, factor change, or audit write`,
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const fixture = operation === "invitation_delivery"
          ? await createInvitationFixture(sql, base) : await createRecoveryFixture(sql, base);
        return { fixtures: [fixture] };
      }, async ({ fixtures }) => {
        await expectReadOnlyCandidates(context, worker, [fixtures[0]!.intentId]);
        expect(await intentState(context.client, fixtures[0]!.intentId)).toMatchObject({
          state: "pending", attempt_count: 0, dispatch_count: 0, lease_token: null,
        });
      });
    },
  })),
  {
    name: "returns only five IDs in due-time order with UUID tie breaks",
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const now = Date.parse(await databaseNow(sql));
        const fixtures: IntentFixture[] = [];
        const rows = [
          { suffix: "7", created: -60_000, retry: undefined },
          { suffix: "4", created: -120_000, retry: -50_000 },
          { suffix: "3", created: -80_000, retry: undefined },
          { suffix: "2", created: -80_000, retry: undefined },
          { suffix: "5", created: -40_000, retry: undefined },
          { suffix: "1", created: -100_000, retry: undefined },
          { suffix: "6", created: -30_000, retry: undefined },
        ];
        for (const row of rows) {
          const fixture = await createInvitationFixture(sql, base, { seedIntent: false });
          fixture.intentId = `a0000000-0000-4000-8000-00000000000${row.suffix}`;
          await insertWorkerPending(sql, fixture, { createdAt: new Date(now + row.created).toISOString(),
            nextAttemptAt: row.retry === undefined ? undefined : new Date(now + row.retry).toISOString() });
          fixtures.push(fixture);
        }
        return { fixtures };
      }, async () => {
        await expectReadOnlyCandidates(context, worker,
          ["1", "2", "3", "7", "4"].map((suffix) => `a0000000-0000-4000-8000-00000000000${suffix}`));
      });
    },
  },
  ...pendingExclusions.map((scenario): IdentityWorkerCase => ({
    name: `excludes ${scenario} while a separate due invitation remains visible`,
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const control = await createInvitationFixture(sql, base);
        const fixture = await createInvitationFixture(sql, base, { seedIntent: false,
          maximumAttempts: scenario === "unsupported retry limit" ? 6 : undefined,
          expiresOffsetMs: scenario === "expired invitation" ? -1_000 : undefined });
        await insertWorkerPending(sql, fixture, {
          manual: scenario === "manual review",
          nextAttemptAt: scenario === "future retry" ? new Date(Date.now() + 60_000).toISOString() : undefined,
          correlationId: scenario === "missing correlation" ? null
            : scenario === "invalid correlation UUID" ? "a0000000-0000-0000-8000-000000000001" : undefined,
          idempotencyKey: scenario === "invalid idempotency key" ? "not-an-approved-key" : undefined,
        });
        if (scenario === "cancelled intent") await sql`UPDATE public.identity_admin_intents
          SET state = 'cancelled', completed_at = clock_timestamp() WHERE id = ${fixture.intentId}::uuid`;
        return { fixtures: [control, fixture], control, fixture };
      }, async ({ fixture, control }) => {
        if (scenario === "busy lease" || scenario === "successful intent") {
          const claim = await claimIntent(worker.client, fixture.intentId);
          expect(claim).not.toBeNull();
          if (scenario === "successful intent") expect(await createIdentityIntentRepository(worker.db).recordResult(
            fixture.intentId, claim!.leaseToken, acceptedInvitation)).toBe("recorded");
        }
        await expectReadOnlyCandidates(context, worker, [control.intentId]);
      });
    },
  })),
  ...(["expired request", "missing approval"] as const).map((scenario): IdentityWorkerCase => ({
    name: `excludes a pending reset with ${scenario}`,
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => ({ fixtures: [await createRecoveryFixture(sql, base, {
        requestExpiresOffsetMs: scenario === "expired request" ? -1_000 : undefined,
        approval: scenario === "missing approval" ? "missing" : undefined,
      })] }), async () => { await expectReadOnlyCandidates(context, worker, []); });
    },
  })),
  ...([
    { name: "due safe invitation rejection", operation: "invitation_delivery", state: "rejected", expected: true },
    { name: "future safe invitation retry", operation: "invitation_delivery", state: "rejected", futureRetry: true, expected: false },
    { name: "unsafe invitation rejection", operation: "invitation_delivery", state: "rejected", nextAction: "none", expected: false },
    { name: "non-retryable provider failure", operation: "invitation_delivery", state: "rejected", errorCode: "provider_unavailable", expected: false },
    { name: "nullable rejection code", operation: "invitation_delivery", state: "rejected", intentErrorCode: null, expected: false },
    { name: "manual invitation delivery uncertainty", operation: "invitation_delivery", state: "unknown", manual: true, expected: false },
    { name: "missing attempt history", operation: "invitation_delivery", state: "expired_dispatch", skipHistory: true, expected: false },
    { name: "expired invitation dispatch lease", operation: "invitation_delivery", state: "expired_dispatch", expected: true },
    { name: "expired reset dispatch lease", operation: "mfa_enrollment_reset", state: "expired_dispatch", expected: true },
    { name: "expired reconciliation lease", operation: "mfa_enrollment_reset", state: "expired_reconciliation", expected: true },
    { name: "due unknown reset outcome", operation: "mfa_enrollment_reset", state: "unknown", expected: true },
    { name: "future reset reconciliation", operation: "mfa_enrollment_reset", state: "unknown", futureRetry: true, expected: false },
    { name: "failed reset marked retryable", operation: "mfa_enrollment_reset", state: "rejected", expected: false },
    { name: "manual reset outcome", operation: "mfa_enrollment_reset", state: "unknown", manual: true, expected: false },
    { name: "exhausted completed reconciliation", operation: "mfa_enrollment_reset", state: "unknown", attempts: 5, expected: false },
    { name: "expired final reconciliation lease", operation: "mfa_enrollment_reset", state: "expired_reconciliation", attempts: 5, expected: true },
  ] as const).map((scenario): IdentityWorkerCase => ({
    name: `${scenario.expected ? "lists" : "excludes"} ${scenario.name}`,
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const fixture = scenario.operation === "invitation_delivery"
          ? await createInvitationFixture(sql, base, { seedIntent: false })
          : await createRecoveryFixture(sql, base, { seedIntent: false });
        await insertHistoricalIntent(sql, fixture, scenario);
        return { fixtures: [fixture], fixture };
      }, async ({ fixture }) => {
        await expectReadOnlyCandidates(context, worker, scenario.expected ? [fixture.intentId] : []);
        if (scenario.name === "expired final reconciliation lease") {
          expect(await claimIntent(worker.client, fixture.intentId)).toBeNull();
          expect(await claimIntent(worker.client, fixture.intentId, true)).toBeNull();
          expect(await intentState(context.client, fixture.intentId)).toMatchObject({
            attempt_count: 5, dispatch_count: 1, manual_review_required: true, lease_token: null,
          });
          await expectReadOnlyCandidates(context, worker, []);
        }
      });
    },
  })),
];
