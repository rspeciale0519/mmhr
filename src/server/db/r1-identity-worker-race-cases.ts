import { expect } from "vitest";
import {
  claimIntent, createInvitationFixture, createRecoveryFixture, intentSnapshot, intentState,
} from "./r1-identity-intent-fixtures";
import { insertHistoricalIntent } from "./r1-identity-intent-history-fixtures";
import { createMembership, createSecurityPrincipal } from "./r1-security-command-fixtures";
import {
  closeIdentityWorker, expectReadOnlyCandidates, listIdentityCandidates, openIdentityWorker,
  withIdentityWorkerFixtures, type IdentityWorkerCase,
} from "./r1-identity-worker-fixtures";

export const identityWorkerRaceCases: readonly IdentityWorkerCase[] = [
  {
    name: "does not wait for intent row locks or the mutation authority lock",
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => ({ fixtures: [await createInvitationFixture(sql, base)] }),
        async ({ fixtures }) => {
          await context.client.begin(async (holding) => {
            await holding`SELECT id FROM public.identity_admin_intents WHERE id = ${fixtures[0]!.intentId}::uuid FOR UPDATE`;
            await holding`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1 FOR UPDATE`;
            await worker.client.begin(async (sql) => {
              await sql`SET LOCAL statement_timeout = '2s'`;
              expect(await listIdentityCandidates(sql)).toEqual([fixtures[0]!.intentId]);
            });
          });
          await expectReadOnlyCandidates(context, worker, [fixtures[0]!.intentId]);
        });
    },
  },
  ...(["cancelled invitation", "lost issuer authority"] as const).map((scenario): IdentityWorkerCase => ({
    name: `rechecks ${scenario} after discovery and before a dispatch claim`,
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const issuer = await createSecurityPrincipal(sql);
        await createMembership(sql, base.organizationId, issuer, "organization_admin");
        const fixture = await createInvitationFixture(sql, base, { issuer });
        return { fixtures: [fixture], fixture, issuer };
      }, async ({ fixture, issuer }) => {
        await expectReadOnlyCandidates(context, worker, [fixture.intentId]);
        if (scenario === "cancelled invitation") {
          await context.client`UPDATE public.invitations SET status = 'revoked', revoked_at = clock_timestamp(),
            revoked_by_identity_id = ${issuer.identityId}::uuid, revoked_reason = 'Synthetic cancellation race'
            WHERE id = ${fixture.invitationId}::uuid`;
        } else {
          await context.client`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
            WHERE id = ${issuer.identityId}::uuid`;
        }
        const before = await intentSnapshot(context.client);
        expect(await claimIntent(worker.client, fixture.intentId)).toBeNull();
        expect(await intentSnapshot(context.client)).toEqual(before);
        await expectReadOnlyCandidates(context, worker, []);
      });
    },
  })),
  {
    name: "two real worker logins can discover an ID but only one can claim its write",
    async run(context, worker, base) {
      const second = await openIdentityWorker(context);
      try {
        await withIdentityWorkerFixtures(context, async (sql) => ({ fixtures: [await createInvitationFixture(sql, base)] }),
          async ({ fixtures }) => {
            const fixture = fixtures[0]!;
            expect(await Promise.all([listIdentityCandidates(worker.client), listIdentityCandidates(second.client)]))
              .toEqual([[fixture.intentId], [fixture.intentId]]);
            const results = await Promise.all([claimIntent(worker.client, fixture.intentId), claimIntent(second.client, fixture.intentId)]);
            expect(results.filter(Boolean)).toHaveLength(1);
            expect(results.filter((claim) => claim === null)).toHaveLength(1);
            expect(results.find(Boolean)).toMatchObject({ intentId: fixture.intentId,
              idempotencyKey: fixture.idempotencyKey, correlationId: fixture.correlationId });
            expect(await intentState(context.client, fixture.intentId)).toMatchObject({ attempt_count: 1, dispatch_count: 1 });
            expect(await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${fixture.intentId}::uuid`).toHaveLength(1);
            expect(await context.client`SELECT id FROM public.audit_events WHERE idempotency_key = ${fixture.idempotencyKey}`).toHaveLength(1);
            await expectReadOnlyCandidates(context, worker, []);
          });
      } finally { await closeIdentityWorker(context, second); }
    },
  },
  {
    name: "an expired reset remains discoverable after request expiry but cannot repeat its provider write",
    async run(context, worker, base) {
      await withIdentityWorkerFixtures(context, async (sql) => {
        const fixture = await createRecoveryFixture(sql, base, { seedIntent: false });
        await insertHistoricalIntent(sql, fixture, { state: "expired_dispatch" });
        await sql`UPDATE public.identity_recovery_requests SET state = 'expired', updated_at = clock_timestamp()
          WHERE id = ${fixture.requestId}::uuid`;
        return { fixtures: [fixture], fixture };
      }, async ({ fixture }) => {
        await expectReadOnlyCandidates(context, worker, [fixture.intentId]);
        expect(await claimIntent(worker.client, fixture.intentId)).toBeNull();
        const readClaim = await claimIntent(worker.client, fixture.intentId, true);
        expect(readClaim).toMatchObject({ intentId: fixture.intentId, subjectId: fixture.subjectId,
          idempotencyKey: fixture.idempotencyKey, operation: "mfa_enrollment_reset", attemptNumber: 2 });
        expect(await intentState(context.client, fixture.intentId)).toMatchObject({
          state: "outcome_unknown", work_mode: "reconciliation", dispatch_count: 1,
        });
        await expectReadOnlyCandidates(context, worker, []);
      });
    },
  },
];
