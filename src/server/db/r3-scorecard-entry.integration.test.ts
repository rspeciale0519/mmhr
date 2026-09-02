import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R3 scorecard entry RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-scorecard-entry");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records, replaces, and replays a scoped score entry with immutable history", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      const productId = randomUUID();
      const candidateId = randomUUID();
      const scorecardId = randomUUID();
      const configurationId = randomUUID();
      const scoreId = randomUUID();
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
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
        VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid, 'score_product', 'Score Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      await sql`
        INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, product_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      await sql`
        INSERT INTO public.scorecards (id, organization_id, intake_id, candidate_id, configuration_id, configuration_version)
        VALUES (${scorecardId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${candidateId}::uuid, ${configurationId}::uuid, 1)
      `;
      await sql`
        INSERT INTO public.scorecard_criteria (organization_id, scorecard_id, criterion_key, weight)
        VALUES (${fixture.organizationId}::uuid, ${scorecardId}::uuid, 'fit', 2)
      `;
      const payload = {
        scorecardId, organizationId: fixture.organizationId, expectedRevision: 1,
        actorIdentityId: fixture.pair[0].identityId,
        entry: { scoreId, criterionKey: 'fit', scorerIdentityId: fixture.pair[0].identityId,
          value: 88, comment: null, evidenceReferences: ['source:one'], enteredAt: new Date().toISOString() },
      };
      const recorded = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_scorecard_entry(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result
        `;
        return row!.result;
      });
      expect(recorded).toMatchObject({ scorecardId, organizationId: fixture.organizationId, entryId: scoreId, revision: 2, outcomeCode: 'recorded' });
      const replayed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_scorecard_entry(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result
        `;
        return row!.result;
      });
      expect(replayed).toMatchObject({ outcomeCode: 'replayed', revision: 2 });
      const [counts] = await sql<{ entries: string; history: string; revision: number }[]>`
        SELECT (SELECT count(*)::text FROM public.scorecard_entries WHERE scorecard_id = ${scorecardId}::uuid) AS entries,
          (SELECT count(*)::text FROM public.scorecard_entry_history WHERE scorecard_id = ${scorecardId}::uuid) AS history,
          (SELECT revision FROM public.scorecards WHERE id = ${scorecardId}::uuid) AS revision
      `;
      expect(counts).toMatchObject({ entries: '1', history: '1', revision: 2 });
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_record_scorecard_entry(${JSON.stringify({ ...payload, expectedRevision: 1, entry: { ...payload.entry, scoreId: randomUUID(), value: 91 } })}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: '42501' });
    });
  }, 120_000);

  test("denies a score entry for another organization", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = { scorecardId: randomUUID(), organizationId: '99999999-9999-4999-8999-999999999999', expectedRevision: 1,
        actorIdentityId: fixture.pair[0].identityId,
        entry: { scoreId: randomUUID(), criterionKey: 'fit', scorerIdentityId: fixture.pair[0].identityId, value: 50, comment: null, evidenceReferences: [], enteredAt: new Date().toISOString() } };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_record_scorecard_entry(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: '42501' });
    });
  }, 120_000);
});
