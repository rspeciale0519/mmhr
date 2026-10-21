import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R3 candidate add RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r3-candidate-add"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("caps initial candidates at five and replays", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      await sql`INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'in_progress', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.vendor_profiles (organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid) RETURNING id`;
      const productIds: string[] = [];
      for (let i = 0; i < 6; i += 1) { const productId = randomUUID(); productIds.push(productId); await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id) VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid, ${`add_product_${i}`}, ${`Add Product ${i}`}, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`; }
      const add = async (productId: string, source = "initial", correlationId = randomUUID(), idempotencyKey = randomUUID()) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const payload = { organizationId: fixture.organizationId, intakeId, productId, source, actorIdentityId: fixture.pair[0].identityId }; const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_add_evaluation_candidate(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result`; return row!.result; });
      const firstCorrelationId = randomUUID(); const firstIdempotencyKey = randomUUID();
      const first = await add(productIds[0]!, "initial", firstCorrelationId, firstIdempotencyKey); expect(first).toMatchObject({ source: "initial", outcomeCode: "created", revision: 1 });
      const replay = await add(productIds[0]!, "initial", firstCorrelationId, firstIdempotencyKey);
      expect(replay.outcomeCode).toBe("replayed");
      for (let i = 1; i < 5; i += 1) await add(productIds[i]!);
      await expect(add(productIds[5]!)).rejects.toMatchObject({ code: "42501" });
      await sql`UPDATE public.intakes SET status = 'under_review', submitted_at = now() WHERE id = ${intakeId}::uuid`;
      const reviewed = await add(productIds[5]!, "review_addition"); expect(reviewed).toMatchObject({ source: "review_addition", outcomeCode: "created" });
    });
  }, 120_000);
  test("denies a cross-organization candidate add", async () => { await rollbackCase(context!, async (sql) => { const payload = { organizationId: "99999999-9999-4999-8999-999999999999", intakeId: randomUUID(), productId: randomUUID(), source: "initial", actorIdentityId: fixture.pair[0].identityId }; await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT public.mmhr_add_evaluation_candidate(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`)).rejects.toMatchObject({ code: "42501" }); }); }, 120_000);
});
