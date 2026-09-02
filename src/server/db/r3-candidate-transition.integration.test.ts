import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R3 candidate transition RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-candidate-transition");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("transitions, replays, and requires approval for eliminated reactivation", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      const productId = randomUUID();
      const candidateId = randomUUID();
      await sql`
        INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'draft', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      await sql`
        INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid, 'transition_product', 'Transition Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      await sql`
        INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, product_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      const transition = async (fromState: string, toState: string, expectedRevision: number, approvalReference: string | null, correlationId = randomUUID(), idempotencyKey = randomUUID()) =>
        asAuthenticated(sql, fixture.pair[0], async (probe) => {
          const payload = { candidateId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
            fromState, toState, expectedRevision, approvalReference };
          const [row] = await probe<{ result: Record<string, unknown> }[]>`
            SELECT public.mmhr_transition_evaluation_candidate(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result
          `;
          return row!.result;
        });
      const activationCorrelationId = randomUUID();
      const activationIdempotencyKey = randomUUID();
      const activated = await transition('proposed', 'active', 1, null, activationCorrelationId, activationIdempotencyKey);
      expect(activated).toMatchObject({ candidateId, organizationId: fixture.organizationId, state: 'active', revision: 2, outcomeCode: 'transitioned' });
      const replayed = await transition('proposed', 'active', 1, null, activationCorrelationId, activationIdempotencyKey);
      expect(replayed).toMatchObject({ state: 'active', revision: 2, outcomeCode: 'replayed' });
      const eliminated = await transition('active', 'eliminated', 2, null);
      expect(eliminated).toMatchObject({ state: 'eliminated', revision: 3, outcomeCode: 'transitioned' });
      await expect(transition('eliminated', 'active', 3, null)).rejects.toMatchObject({ code: '42501' });
      const reactivated = await transition('eliminated', 'active', 3, 'review:approved');
      expect(reactivated).toMatchObject({ state: 'active', revision: 4, outcomeCode: 'transitioned' });
      await expect(transition('active', 'paused', 3, null)).rejects.toMatchObject({ code: '42501' });
    });
  }, 120_000);

  test("denies a candidate transition for another organization", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = { candidateId: randomUUID(), organizationId: "99999999-9999-4999-8999-999999999999", actorIdentityId: fixture.pair[0].identityId,
        fromState: "proposed", toState: "active", expectedRevision: 1, approvalReference: null };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_transition_evaluation_candidate(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
