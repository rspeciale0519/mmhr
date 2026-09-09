import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase, type SecurityCommandFixture, type SecuritySql } from "./r1-security-command-fixtures";

describe("R3 candidate vendor scope", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-candidate-vendor-scope");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  async function createVendorOrganization(sql: SecuritySql) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
      VALUES (${`Vendor ${randomUUID()}`} , 'vendor', 'active', now(), false)
      RETURNING id
    `;
    return row!.id;
  }

  test("keeps legacy add and replay same-org while rejecting a vendor product", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      const vendorOrganizationId = await createVendorOrganization(sql);
      const [customerVendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, approved_at, approved_by_identity_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, 'active', now(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      const [externalVendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, approved_at, approved_by_identity_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${vendorOrganizationId}::uuid, 'active', now(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      const customerProductId = randomUUID();
      const externalProductId = randomUUID();
      await sql`INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'in_progress', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${customerProductId}::uuid, ${fixture.organizationId}::uuid, ${customerVendor!.id}::uuid, 'legacy_customer_product', 'Legacy Customer Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid),
          (${externalProductId}::uuid, ${vendorOrganizationId}::uuid, ${externalVendor!.id}::uuid, 'external_vendor_product', 'External Vendor Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;

      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const add = (productId: string, correlation = randomUUID(), key = randomUUID()) =>
        asAuthenticated(sql, fixture.pair[0], async (probe) => {
          const payload = { organizationId: fixture.organizationId, intakeId, productId, source: "initial", actorIdentityId: fixture.pair[0].identityId };
          const [row] = await probe<{ result: Record<string, unknown> }[]>`
            SELECT public.mmhr_add_evaluation_candidate(${JSON.stringify(payload)}::jsonb, ${correlation}::uuid, ${key}::uuid) AS result
          `;
          return row!.result;
        });

      const created = await add(customerProductId, correlationId, idempotencyKey);
      expect(created).toMatchObject({ organizationId: fixture.organizationId, intakeId, productId: customerProductId, source: "initial", outcomeCode: "created" });
      const [stored] = await sql<{ vendor_organization_id: string }[]>`
        SELECT vendor_organization_id FROM public.evaluation_candidates WHERE id = ${(created.candidateId as string)}::uuid
      `;
      expect(stored!.vendor_organization_id).toBe(fixture.organizationId);
      await expect(add(customerProductId, correlationId, idempotencyKey)).resolves.toMatchObject({ outcomeCode: "replayed" });
      const [audit] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM public.audit_events
        WHERE command = 'r3.candidate.add' AND entity_id = ${(created.candidateId as string)}
      `;
      expect(audit!.count).toBe("1");
      await expect(add(externalProductId)).rejects.toMatchObject({ code: "42501" });
      const [counts] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM public.evaluation_candidates WHERE organization_id = ${fixture.organizationId}::uuid AND intake_id = ${intakeId}::uuid
      `;
      expect(counts!.count).toBe("1");
    });
  }, 120_000);

  test("enforces vendor product scope, customer scope, and raw table denial", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      const vendorOrganizationId = await createVendorOrganization(sql);
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, approved_at, approved_by_identity_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${vendorOrganizationId}::uuid, 'active', now(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      const productId = randomUUID();
      await sql`INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'in_progress', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${productId}::uuid, ${vendorOrganizationId}::uuid, ${vendor!.id}::uuid, 'scope_product', 'Scope Product', 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;

      await expect(sql.savepoint((probe) => probe`
        INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, vendor_organization_id, product_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${randomUUID()}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${fixture.organizationId}::uuid, ${productId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `)).rejects.toMatchObject({ code: "23503", constraint_name: "evaluation_candidates_product_vendor_scope_fk" });

      const otherOrganizationId = (await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES (${`Other customer ${randomUUID()}`}, 'customer', 'active', now(), false)
        RETURNING id
      `)[0]!.id;
      await expect(sql.savepoint((probe) => probe`
        INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, vendor_organization_id, product_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${randomUUID()}::uuid, ${otherOrganizationId}::uuid, ${intakeId}::uuid, ${vendorOrganizationId}::uuid, ${productId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `)).rejects.toMatchObject({ code: "23503", constraint_name: "evaluation_candidates_intake_scope_fk" });
      await expect(asAuthenticated(sql, fixture.target, async (probe) => probe`
        SELECT public.mmhr_add_evaluation_candidate(${JSON.stringify({ organizationId: otherOrganizationId, intakeId, productId, source: "initial", actorIdentityId: fixture.target.identityId })}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.target, async (probe) => probe`
        SELECT count(*) FROM public.evaluation_candidates
      `)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("matches published vendor facts across organizations and ignores unpublished facts", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID();
      const ruleSetId = randomUUID();
      const candidateIds = [randomUUID(), randomUUID()] as const;
      const vendorOrganizationIds = [await createVendorOrganization(sql), await createVendorOrganization(sql)];
      await sql`INSERT INTO public.intakes (id, organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.intake_requirements (organization_id, intake_id, stable_key, label, importance, weight, response, created_by_identity_id, updated_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, ${intakeId}::uuid, 'payroll', 'Payroll', 'must', 10, '"mid"'::jsonb, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid),
          (${fixture.organizationId}::uuid, ${intakeId}::uuid, 'benefits', 'Benefits', 'nice', 5, '"rich"'::jsonb, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      const products: string[] = [];
      for (let index = 0; index < 2; index += 1) {
        const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.vendor_profiles (organization_id, status, approved_at, approved_by_identity_id, created_by_identity_id, updated_by_identity_id)
          VALUES (${vendorOrganizationIds[index]!}::uuid, 'active', now(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid) RETURNING id`;
        const productId = randomUUID(); products.push(productId);
        await sql`INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status, created_by_identity_id, updated_by_identity_id)
          VALUES (${productId}::uuid, ${vendorOrganizationIds[index]!}::uuid, ${vendor!.id}::uuid, ${`scope_match_${index}`}, ${`Scope Match ${index}`}, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
        await sql`INSERT INTO public.vendor_facts (organization_id, vendor_profile_id, product_id, field_key, value, observed_at, status, created_by_identity_id)
          VALUES (${vendorOrganizationIds[index]!}::uuid, ${vendor!.id}::uuid, ${productId}::uuid, 'payroll', 'mid', clock_timestamp(), ${index === 0 ? "published" : "draft"}, ${fixture.pair[0].identityId}::uuid)`;
      }
      await sql`INSERT INTO public.evaluation_candidates (id, organization_id, intake_id, vendor_organization_id, product_id, created_by_identity_id, updated_by_identity_id)
        VALUES (${candidateIds[0]}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${vendorOrganizationIds[0]!}::uuid, ${products[0]!}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid),
          (${candidateIds[1]}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${vendorOrganizationIds[1]!}::uuid, ${products[1]!}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      await sql`INSERT INTO public.matching_rule_sets (id, organization_id, version, status, rules, approved_by_identity_id, approved_at, created_by_identity_id)
        VALUES (${ruleSetId}::uuid, ${fixture.organizationId}::uuid, 1, 'approved', '{"version":1}'::jsonb, ${fixture.pair[0].identityId}::uuid, clock_timestamp(), ${fixture.pair[0].identityId}::uuid)`;

      const provider = await createSecurityPrincipal(sql);
      await createMembership(sql, vendorOrganizationIds[0]!, provider, "organization_admin");
      await sql`INSERT INTO public.portal_access_grants (organization_id, portal, issued_by_identity_id, issue_reason)
        VALUES (${vendorOrganizationIds[0]}::uuid, 'vendor'::public.portal_kind, ${fixture.pair[1].identityId}::uuid, 'Vendor matching denial fixture')`;

      const payload = { organizationId: fixture.organizationId, intakeId, ruleVersion: 1, actorIdentityId: fixture.pair[0].identityId };
      const correlationId = randomUUID(); const idempotencyKey = randomUUID();
      const run = () => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_run_deterministic_matching(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result`;
        return row!.result;
      });
      const computed = await run();
      expect(computed).toMatchObject({ candidateCount: 2, outcomeCode: "computed" });
      expect(computed).not.toHaveProperty("productId");
      expect(computed).not.toHaveProperty("vendorOrganizationId");
      const replayed = await run();
      expect(replayed).toMatchObject({ matchingRunId: computed.matchingRunId, outcomeCode: "replayed" });
      const [audit] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM public.audit_events
        WHERE command = 'r3.matching.run' AND entity_type = 'matching_run' AND entity_id = ${(computed.matchingRunId as string)}
      `;
      expect(audit!.count).toBe("1");
      const [snapshot] = await sql<{ candidate_snapshot: unknown }[]>`
        SELECT candidate_snapshot FROM public.matching_runs WHERE id = ${(computed.matchingRunId as string)}::uuid
      `;
      const snapshotText = JSON.stringify(snapshot!.candidate_snapshot);
      expect(snapshotText).not.toContain("productId");
      expect(snapshotText).not.toContain("vendorOrganizationId");
      for (const privateId of [...products, ...vendorOrganizationIds]) {
        expect(snapshotText).not.toContain(privateId);
        expect(JSON.stringify(computed)).not.toContain(privateId);
      }
      await expect(asAuthenticated(sql, provider, async (probe) => probe`
        SELECT public.mmhr_run_deterministic_matching(${JSON.stringify({ ...payload, actorIdentityId: provider.identityId })}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });
      const rows = await sql<{ id: string; eligibility: string; deterministic_score: number; fit_reasons: unknown; limitations: unknown; evidence_fresh_at: string | null }[]>`
        SELECT id, eligibility, deterministic_score, fit_reasons, limitations, evidence_fresh_at
        FROM public.evaluation_candidates WHERE organization_id = ${fixture.organizationId}::uuid AND intake_id = ${intakeId}::uuid ORDER BY id
      `;
      const published = rows.find((row) => row.id === candidateIds[0]);
      const unpublished = rows.find((row) => row.id === candidateIds[1]);
      expect(published).toMatchObject({ eligibility: "eligible", deterministic_score: 6667 });
      expect(published!.fit_reasons).toEqual(["payroll"]);
      expect(published!.limitations).toEqual(["benefits"]);
      expect(published!.evidence_fresh_at).not.toBeNull();
      expect(unpublished).toMatchObject({ eligibility: "ineligible", deterministic_score: 0, evidence_fresh_at: null });
      expect(unpublished!.fit_reasons).toEqual([]);
      expect(unpublished!.limitations).toEqual(["benefits", "payroll"]);
    });
  }, 120_000);
});
