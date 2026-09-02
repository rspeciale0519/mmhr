import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R3 deterministic matching RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r3-matching"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("computes, replays, and stores an evidence-backed candidate score", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID(); const productId = randomUUID(); const candidateId = randomUUID(); const ruleSetId = randomUUID();
      await sql`INSERT INTO public.intakes (id, organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.intake_requirements (organization_id, intake_id, stable_key, label, importance, weight, response, created_by_identity_id, updated_by_identity_id) VALUES (${fixture.organizationId}::uuid, ${intakeId}::uuid, 'payroll', 'Payroll', 'must', 10, '"mid"'::jsonb, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.vendor_profiles (organization_id, status, description, created_by_identity_id, updated_by_identity_id) VALUES (${fixture.organizationId}::uuid, 'active', 'Vendor', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid) RETURNING id`;
      await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id) VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid, 'match_product', 'Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.vendor_facts (organization_id, vendor_profile_id, product_id, field_key, value, observed_at, status, created_by_identity_id) VALUES (${fixture.organizationId}::uuid, ${vendor!.id}::uuid, ${productId}::uuid, 'payroll', 'mid', clock_timestamp(), 'published', ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, product_id, created_by_identity_id, updated_by_identity_id) VALUES (${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.matching_rule_sets (id, organization_id, version, status, rules, approved_by_identity_id, approved_at, created_by_identity_id) VALUES (${ruleSetId}::uuid, ${fixture.organizationId}::uuid, 1, 'approved', '{"version":1}'::jsonb, ${fixture.pair[0].identityId}::uuid, clock_timestamp(), ${fixture.pair[0].identityId}::uuid)`;
      const payload = { organizationId: fixture.organizationId, intakeId, ruleVersion: 1, actorIdentityId: fixture.pair[0].identityId };
      const correlationId = randomUUID(); const idempotencyKey = randomUUID();
      const run = async (key = idempotencyKey, correlation = correlationId) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_run_deterministic_matching(${JSON.stringify(payload)}::jsonb, ${correlation}::uuid, ${key}::uuid) AS result`; return row!.result; });
      await expect(run()).resolves.toMatchObject({ organizationId: fixture.organizationId, intakeId, ruleVersion: 1, candidateCount: 1, outcomeCode: "computed" });
      await expect(run()).resolves.toMatchObject({ outcomeCode: "replayed" });
      const [candidate] = await sql<{ eligibility: string; deterministic_score: number }[]>`SELECT eligibility, deterministic_score FROM public.evaluation_candidates WHERE organization_id = ${fixture.organizationId}::uuid AND id = ${candidateId}::uuid`;
      expect(candidate).toMatchObject({ eligibility: "eligible", deterministic_score: 10000 });
    });
  }, 120_000);

  test("denies cross-organization matching", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => { await probe`SELECT public.mmhr_run_deterministic_matching(${JSON.stringify({ organizationId: "99999999-9999-4999-8999-999999999999", intakeId: randomUUID(), ruleVersion: 1, actorIdentityId: fixture.pair[0].identityId })}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`; })).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
