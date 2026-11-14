import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R3 initial evaluation RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r3-initial-evaluation"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("creates and replays a five-candidate-bounded masked assessment", async () => { await rollbackCase(context!, async (sql) => { const intakeId = randomUUID(); const assessmentId = randomUUID(); const productId = randomUUID(); const candidateId = randomUUID(); const vendor = (await sql<{ id: string }[]>`INSERT INTO public.vendor_profiles (organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid) RETURNING id`)[0]!; await sql`INSERT INTO public.intakes (id, organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`; await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id) VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor.id}::uuid, 'initial_eval_product', 'Initial Eval Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`; await sql`INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, product_id, vendor_organization_id, source, created_by_identity_id, updated_by_identity_id) VALUES (${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid, ${fixture.organizationId}::uuid, 'initial', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`; const payload = { assessmentId, organizationId: fixture.organizationId, intakeId, actorIdentityId: fixture.pair[0].identityId }; const result = await asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe`SELECT public.mmhr_create_initial_evaluation(${JSON.stringify(payload)}::text::jsonb, ${assessmentId}::uuid, ${assessmentId}::uuid) AS result`; return row!.result as Record<string, unknown>; }); expect(result).toMatchObject({ assessmentId, organizationId: fixture.organizationId, intakeId, state: "masked", candidateCount: 1, outcomeCode: "created" }); const [mask] = await sql<{ masked_label: string; state: string }[]>`SELECT masked_label, state FROM public.evaluation_candidate_masks WHERE organization_id=${fixture.organizationId}::uuid AND candidate_id=${candidateId}::uuid`; expect(mask).toMatchObject({ state: "masked" }); const replay = await asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe`SELECT public.mmhr_create_initial_evaluation(${JSON.stringify(payload)}::text::jsonb, ${assessmentId}::uuid, ${assessmentId}::uuid) AS result`; return row!.result as Record<string, unknown>; }); expect(replay).toMatchObject({ outcomeCode: "replayed", candidateCount: 1 }); }); }, 120_000);
  test("denies cross-organization initial evaluations", async () => { await rollbackCase(context!, async (sql) => { const payload = { assessmentId: randomUUID(), organizationId: "99999999-9999-4999-8999-999999999999", intakeId: randomUUID(), actorIdentityId: fixture.pair[0].identityId }; await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT public.mmhr_create_initial_evaluation(${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`)).rejects.toMatchObject({ code: "42501" }); }); }, 120_000);
  test("repairs a historical audit value without changing access", async () => {
    await rollbackCase(context!, async (sql) => {
      const [before] = await sql<{ definition: string; acl: string | null }[]>`
        SELECT pg_get_functiondef(p.oid) AS definition, p.proacl::text AS acl
        FROM pg_proc p WHERE p.oid = 'public.mmhr_create_initial_evaluation(jsonb,uuid,uuid)'::regprocedure`;
      const current = "jsonb_build_object('version',1,'state','completed'),context.authorization_time";
      const legacy = "jsonb_build_object('version',1,'state','masked'),context.authorization_time";
      expect(before!.definition.split(current)).toHaveLength(2);
      await sql.unsafe(before!.definition.replace(current, legacy));
      const intakeId = randomUUID(), assessmentId = randomUUID(), productId = randomUUID(), candidateId = randomUUID();
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid,
          ${fixture.pair[0].identityId}::uuid) RETURNING id`;
      await sql`INSERT INTO public.intakes (id, organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', clock_timestamp(),
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${productId}::uuid, ${fixture.organizationId}::uuid, ${vendor!.id}::uuid,
          'audit_repair_product', 'Audit repair product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, product_id, vendor_organization_id, source, created_by_identity_id, updated_by_identity_id)
        VALUES (${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid,
          ${fixture.organizationId}::uuid, 'initial', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      const payload = { assessmentId, organizationId: fixture.organizationId, intakeId, actorIdentityId: fixture.pair[0].identityId };
      const create = (transaction: typeof sql) => asAuthenticated(transaction, fixture.pair[0], async (probe) => {
        const [row] = await probe`SELECT public.mmhr_create_initial_evaluation(${JSON.stringify(payload)}::text::jsonb,
          ${assessmentId}::uuid, ${assessmentId}::uuid) AS result`;
        return row!.result as Record<string, unknown>;
      });
      await expect(sql.savepoint(create)).rejects.toMatchObject({ code: "23514", constraint_name: "audit_events_after_summary_safe_ck" });
      const [failed] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM public.evaluation_assessments WHERE id = ${assessmentId}::uuid`;
      expect(failed!.count).toBe(0);
      const migration = readFileSync("drizzle/0172_r3_initial_evaluation_audit.sql", "utf8");
      await sql.unsafe(migration);
      expect(await create(sql)).toMatchObject({ assessmentId, state: "masked", outcomeCode: "created" });
      expect(await create(sql)).toMatchObject({ assessmentId, state: "masked", outcomeCode: "replayed" });
      const [audit] = await sql<{ state: string }[]>`SELECT after_summary->>'state' AS state FROM public.audit_events
        WHERE entity_type = 'evaluation_assessment' AND entity_id = ${assessmentId}::text AND action = 'initial.evaluation.create'`;
      expect(audit?.state).toBe("completed");
      const [after] = await sql<{ definition: string; acl: string | null; audit_allowed: boolean }[]>`
        SELECT pg_get_functiondef(p.oid) AS definition, p.proacl::text AS acl,
          mmhr_private.r1_audit_summary_is_safe('{"version":1,"state":"completed"}'::jsonb) AS audit_allowed
        FROM pg_proc p WHERE p.oid = 'public.mmhr_create_initial_evaluation(jsonb,uuid,uuid)'::regprocedure`;
      expect(after!.definition).toBe(before!.definition);
      expect(after!.acl).toBe(before!.acl);
      expect(after!.audit_allowed).toBe(true);
      await sql.unsafe(migration);
      await expect(sql.savepoint(async (savepoint) => {
        await savepoint.unsafe(before!.definition.replace(current,
          "jsonb_build_object('version',1,'state','unknown'),context.authorization_time"));
        await savepoint.unsafe(migration);
      })).rejects.toThrow("Initial evaluation audit baseline requires review");
      const [restored] = await sql<{ definition: string; acl: string | null }[]>`
        SELECT pg_get_functiondef(p.oid) AS definition, p.proacl::text AS acl
        FROM pg_proc p WHERE p.oid = 'public.mmhr_create_initial_evaluation(jsonb,uuid,uuid)'::regprocedure`;
      expect(restored).toEqual(before);
    });
  }, 120_000);
});
