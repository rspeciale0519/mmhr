import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { evaluatePublishedOption } from "@/server/matching/option-publication-contract";
import { applyMigrationsBeforeSelectionRetry, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { addContributor, addPortalGrant, prepare, publicationPayload, publish, readPublication, REQUIREMENT_KEY, seedSubmittedIntake, seedVendorOption } from "./r3-evaluation-publication-fixtures";
import { createCommandFixture, createSecurityPrincipal, rollbackCase } from "./r1-security-command-fixtures";

const fact = (fieldKey: string, value: string) => ({
  fact_id: randomUUID(), field_key: fieldKey, value, provenance: "evidence", evidence_id: randomUUID(),
  source_id: randomUUID(), review_id: randomUUID(), evidence_version: 1, content_hash: "a".repeat(64),
  observed_at: "2026-09-15T00:00:00.000Z", captured_at: "2026-09-15T00:00:00.000Z",
  valid_until: "2026-10-15T00:00:00.000Z", override_id: null, approved_at: "2026-09-15T01:00:00.000Z",
});
const rules = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"],
  capabilityMeaning: "presence", partnerAcceptance: { requirementKey: "payroll", responsePath: ["acceptPartner"] } }] };
const saved = (required: boolean, acceptPartner?: boolean) => [{ requirementId: randomUUID(), revision: 1, key: "payroll",
  label: "Payroll", importance: "must", weight: 100, response: { required, workers: "employees", ...(acceptPartner === undefined ? {} : { acceptPartner }) } }];
const scopes = fact("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [] } }));
const coverage = (value: string) => fact("comparison_feature_coverage", JSON.stringify({ payroll: value }));
const inclusion = (value: boolean) => fact("comparison_addon_inclusions", JSON.stringify({ payroll: value }));

describe("coverage scoring database parity", () => {
  let context: RehearsalContext | undefined;
  beforeAll(async () => {
    context = await startRehearsal("r3-history-review");
    await applyMigrationsBeforeSelectionRetry(context);
    const estimateMigration = await readFile(path.resolve("drizzle/0173_r3_estimate_scope.sql"), "utf8");
    for (const section of estimateMigration.split("--> statement-breakpoint")) {
      if (section.trim()) await context.client.unsafe(section);
    }
    const migration = await readFile(path.resolve("drizzle/0174_r3_coverage_conditions.sql"), "utf8");
    const sections = migration.split("--> statement-breakpoint");
    if (sections.length !== 10 || !sections[0].includes("r3_evaluate_publication_option_v3")) {
      throw new Error("Unexpected coverage migration");
    }
    for (const section of sections) if (section.trim()) await context.client.unsafe(section);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("matches the application for reviewed and missing delivery conditions", async () => {
    const cases = [
      { required: true, facts: [fact("payroll", "true"), scopes, coverage("limited")], eligibility: "unknown", score: 0, covered: 0 },
      { required: true, facts: [fact("payroll", "true"), fact("comparison_fact_scopes", JSON.stringify({ payroll: { version: 1, conditions: [
        { kind: "restriction", requirementKey: "payroll", responsePath: ["workers"], allowedValues: ["employees"] },
      ] } })), coverage("limited"), fact("comparison_limitation_reviews", JSON.stringify({ payroll: true }))], eligibility: "eligible", score: 10000, covered: 10000 },
      { required: true, facts: [fact("payroll", "true"), scopes, coverage("native")], eligibility: "eligible", score: 10000, covered: 10000 },
      { required: true, facts: [fact("payroll", "true"), scopes, coverage("add_on")], eligibility: "unknown", score: 0, covered: 0 },
      { required: true, facts: [fact("payroll", "true"), scopes, coverage("add_on"), inclusion(true)], eligibility: "eligible", score: 10000, covered: 10000 },
      { required: true, facts: [fact("payroll", "true"), scopes, coverage("partner")], eligibility: "unknown", score: 0, covered: 0 },
      { required: true, accepted: false, facts: [fact("payroll", "true"), scopes, coverage("partner")], eligibility: "ineligible", score: 0, covered: 10000 },
      { required: true, accepted: true, facts: [fact("payroll", "true"), scopes, coverage("partner")], eligibility: "eligible", score: 10000, covered: 10000 },
      { required: true, facts: [fact("payroll", "false"), scopes, coverage("not_supported")], eligibility: "ineligible", score: 0, covered: 10000 },
      { required: false, facts: [fact("payroll", "false"), scopes, coverage("not_supported")], eligibility: "eligible", score: 10000, covered: 10000 },
      { required: false, facts: [fact("payroll", "false"), fact("payroll", "true"), scopes, coverage("not_supported")], eligibility: "unknown", score: 0, covered: 0 },
    ];
    for (const item of cases) {
      const requirements = saved(item.required, item.accepted);
      const expected = evaluatePublishedOption(requirements, rules, item.facts);
      const [row] = await context!.client<{ result: Record<string, unknown> }[]>`
        SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(rules)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(item.facts)}::text::jsonb) AS result`;
      expect(row!.result).toMatchObject({ eligibility: item.eligibility, deterministicScore: item.score,
        confidenceBasisPoints: item.covered, fitReasons: expected.fitReasons, limitations: expected.limitations });
      expect(Date.parse(String(row!.result.validUntil))).toBe(Date.parse(String(expected.validUntil)));
    }
  }, 120_000);

  test("rejects malformed and duplicate delivery evidence", async () => {
    const requirements = saved(true);
    for (const facts of [
      [fact("payroll", "true"), scopes, coverage("invented")],
      [fact("payroll", "true"), scopes, coverage("native"), coverage("native")],
      [fact("payroll", "true"), scopes, fact("comparison_feature_coverage", JSON.stringify({ commission_rate: "native" }))],
    ]) {
      expect(() => evaluatePublishedOption(requirements, rules, facts)).toThrow();
      await expect(context!.client`
        SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(rules)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb)`)
        .rejects.toMatchObject({ code: "22023" });
    }
  }, 120_000);
  test("rejects malformed version 3 criteria with an invalid-input error", async () => {
    const requirements = saved(true);
    const invalidConfigurations = [
      { version: 3, criteria: [null] },
      { version: 3, criteria: [{ ...rules.criteria[0], partnerAcceptance: [] }] },
      { version: 3, criteria: [{ ...rules.criteria[0], partnerAcceptance: { requirementKey: "payroll", responsePath: "bad" } }] },
      { version: 3, criteria: [{ ...rules.criteria[0], capabilityMeaning: "other" }] },
    ];
    for (const configuration of invalidConfigurations) {
      expect(() => evaluatePublishedOption(requirements, configuration, [])).toThrow();
      await expect(context!.client`
        SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(configuration)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, '[]'::jsonb)`)
        .rejects.toMatchObject({ code: "22023" });
    }
  }, 120_000);

  test("rejects commercial partner acceptance references in both evaluators", async () => {
    const requirements = saved(true);
    for (const requirementKey of ["commission_rate", "payout_total", "referral_fee", "payment_status",
      "commercial_relationship", "sponsorship", "advertising", "paid_placement", "partner_status", " COMMISSION_RATE "]) {
      const configuration = { version: 3, criteria: [{ ...rules.criteria[0],
        partnerAcceptance: { requirementKey, responsePath: [] } }] };
      expect(() => evaluatePublishedOption(requirements, configuration, [])).toThrow();
      await expect(context!.client`
        SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(configuration)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, '[]'::jsonb)`)
        .rejects.toMatchObject({ code: "22023" });
    }
  }, 120_000);
  test("keeps new helper functions private from application roles", async () => {
    for (const role of ["anon", "authenticated", "service_role", "mmhr_worker"]) {
      for (const func of ["mmhr_private.r3_evaluate_publication_option_v3(jsonb,jsonb,jsonb)",
        "mmhr_private.r3_validate_publication_configuration_v3(jsonb,jsonb)",
        "mmhr_private.r3_masked_publication_details_v3(jsonb,jsonb,jsonb,jsonb)"]) {
        const [row] = await context!.client<{ permitted: boolean }[]>`
          SELECT has_function_privilege(${role}, ${func}, 'EXECUTE') AS permitted`;
        expect(row!.permitted).toBe(false);
      }
    }
  }, 120_000);
  test("normalizes versioned criteria without losing reviewed-condition mappings", async () => {
    const requirements = saved(true, true);
    const configured = { version: 3, criteria: [{ requirementKey: " Payroll ", factKey: " PAYROLL ",
      responsePath: ["required"], capabilityMeaning: "presence", partnerAcceptance: {
        requirementKey: " Payroll ", responsePath: ["acceptPartner"] } }] };
    const [row] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_validate_publication_configuration_v3(${JSON.stringify(configured)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb) AS result`;
    expect(row!.result).toEqual({ version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll",
      responsePath: ["required"], capabilityMeaning: "presence", partnerAcceptance: {
        requirementKey: "payroll", responsePath: ["acceptPartner"] } }] });
  }, 120_000);
  test("normalizes mixed-case format 3 keys in masked details", async () => {
    const requirements = saved(true, true);
    const configured = { version: 3, criteria: [{ requirementKey: " Payroll ", factKey: " PAYROLL ",
      responsePath: ["required"], capabilityMeaning: "presence", partnerAcceptance: {
        requirementKey: " Payroll ", responsePath: ["acceptPartner"] } }] };
    const facts = [fact("payroll", "true"), scopes, coverage("native")];
    const [result] = await context!.client<{ value: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_evaluate_publication_option(${JSON.stringify(configured)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb) AS value`;
    const [details] = await context!.client<{ value: { features: Array<{ outcome: string; requirementKey: string }> } }[]>`
      SELECT mmhr_private.r3_masked_publication_details(${JSON.stringify(configured)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb,
        ${JSON.stringify(result!.value)}::text::jsonb) AS value`;
    expect(details!.value.features[0]).toMatchObject({ outcome: "match", requirementKey: "payroll" });
  }, 120_000);
  test("keeps masked feature details consistent with format 3 scores", async () => {
    for (const [kind, accepted, expectedOutcome] of [["native", true, "match"], ["partner", undefined, "unknown"],
      ["partner", false, "mismatch"]] as const) {
      const requirements = saved(true, accepted);
      const facts = [fact("payroll", "true"), scopes, coverage(kind)];
      const [result] = await context!.client<{ value: Record<string, unknown> }[]>`
        SELECT mmhr_private.r3_evaluate_publication_option(${JSON.stringify(rules)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb) AS value`;
      const [details] = await context!.client<{ value: { features: Array<{ outcome: string; coverage: string }> } }[]>`
        SELECT mmhr_private.r3_masked_publication_details(${JSON.stringify(rules)}::text::jsonb,
          ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb,
          ${JSON.stringify(result!.value)}::text::jsonb) AS value`;
      expect(details!.value.features[0]).toMatchObject({ outcome: expectedOutcome, coverage: kind });
    }
  }, 120_000);
  test("keeps format 3 publication order independent of score", async () => {
    await rollbackCase(context!, async (sql) => {
      const fixture = await createCommandFixture(sql);
      const customer = await createSecurityPrincipal(sql);
      await addContributor(sql, fixture.organizationId, customer);
      await addPortalGrant(sql, fixture.organizationId, fixture.pair[1].identityId);
      const intakeId = await seedSubmittedIntake(sql, fixture, customer);
      const lowId = `00000000${randomUUID().slice(8)}`;
      const highId = `ffffffff${randomUUID().slice(8)}`;
      await seedVendorOption(sql, fixture, 90, { productId: lowId, factValue: "no" });
      const high = await seedVendorOption(sql, fixture, 91, { productId: highId, factValue: "yes" });
      for (const [field, value] of [
        ["comparison_fact_scopes", { [REQUIREMENT_KEY]: { version: 1, conditions: [] } }],
        ["comparison_feature_coverage", { [REQUIREMENT_KEY]: "native" }],
      ] as const) {
        const factId = randomUUID(), evidenceId = randomUUID();
        await sql`INSERT INTO public.vendor_facts (id,organization_id,vendor_profile_id,product_id,field_key,value,observed_at,status,created_by_identity_id)
          SELECT ${factId}::uuid,organization_id,vendor_profile_id,product_id,${field},${JSON.stringify(value)},observed_at,status,created_by_identity_id
          FROM public.vendor_facts WHERE id=${String(high.input.fact_id)}::uuid`;
        await sql`INSERT INTO public.vendor_evidence_versions (id,organization_id,fact_id,source_id,version,content_hash,captured_at,fresh_until,citation)
          SELECT ${evidenceId}::uuid,organization_id,${factId}::uuid,source_id,1,content_hash,captured_at,fresh_until,'Synthetic scoring test'
          FROM public.vendor_evidence_versions WHERE id=${high.evidenceId}::uuid`;
        await sql`INSERT INTO public.vendor_fact_reviews (id,organization_id,evidence_id,reviewer_identity_id,decision,decided_at,reason)
          SELECT ${randomUUID()}::uuid,organization_id,${evidenceId}::uuid,reviewer_identity_id,decision,decided_at,reason
          FROM public.vendor_fact_reviews WHERE id=${String(high.input.review_id)}::uuid`;
      }
      const criteria = [{ requirementKey: REQUIREMENT_KEY, factKey: REQUIREMENT_KEY, responsePath: [] }];
      const previous = [];
      for (const version of [1, 2]) {
        const publication = await prepare(sql, fixture.pair[0], { organizationId: fixture.organizationId, intakeId,
          expectedRevision: 2, configuration: { version, criteria } });
        const rows = await sql<{ product_id: string; deterministic_score: number }[]>`
          SELECT product_id,deterministic_score FROM public.evaluation_publication_options
          WHERE publication_id=${String(publication.publicationId)}::uuid ORDER BY ordinal`;
        expect(rows.map((row) => row.product_id)).toEqual(version === 1 ? [highId, lowId] : [lowId, highId]);
        previous.push({ id: String(publication.publicationId), rows });
      }
      const configuration = { version: 3, criteria: [{ requirementKey: REQUIREMENT_KEY, factKey: REQUIREMENT_KEY, responsePath: [] }] };
      const result = await prepare(sql, fixture.pair[0], { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration });
      const rows = await sql<{ product_id: string; deterministic_score: number }[]>`
        SELECT product_id,deterministic_score FROM public.evaluation_publication_options
        WHERE publication_id=${String(result.publicationId)}::uuid ORDER BY ordinal`;
      expect(rows.map((row) => row.product_id)).toEqual([lowId, highId]);
      expect(rows.map((row) => row.deterministic_score)).toEqual([0, 10000]);
      const readInput = publicationPayload(fixture.organizationId, intakeId, String(result.publicationId), 0, 25);
      const prepared = await readPublication(sql, fixture.pair[0], "review", { ...readInput, detailsVersion: 1 });
      expect(prepared).toMatchObject({ state: "prepared", optionCount: 2 });
      await publish(sql, fixture.pair[0], { organizationId: fixture.organizationId, publicationId: result.publicationId,
        expectedDigest: result.inputDigest, approvalReference: "approval:local-test", reason: "Review synthetic comparison" });
      const customerView = await readPublication(sql, customer, "get", { ...readInput, detailsVersion: 2 }, "aal1");
      expect(customerView).toMatchObject({ state: "published", optionCount: 2 });
      expect(JSON.stringify(customerView)).not.toMatch(/knownKeys|productId|vendorOrganizationId|sourceId/);
      const options = customerView.options as Array<{ eligibility: string; details: { features: Array<{ outcome: string }> } }>;
      expect(options.map((option) => option.eligibility)).toEqual(["unknown", "eligible"]);
      expect(options.map((option) => option.details.features[0].outcome)).toEqual(["unknown", "match"]);
      for (const publication of previous) {
        const after = await sql<{ product_id: string; deterministic_score: number }[]>`
          SELECT product_id,deterministic_score FROM public.evaluation_publication_options
          WHERE publication_id=${publication.id}::uuid ORDER BY ordinal`;
        expect(after).toEqual(publication.rows);
      }
    });
  }, 120_000);
  test("routes the current database scorer to format 3 while retaining format 2", async () => {
    const requirements = saved(true, true);
    const facts = [fact("payroll", "true"), scopes, coverage("native")];
    const [next] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_evaluate_publication_option(${JSON.stringify(rules)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb) AS result`;
    expect(next!.result).toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
    const legacy = { version: 2, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
    const [previous] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_evaluate_publication_option(${JSON.stringify(legacy)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb) AS result`;
    expect(previous!.result).toMatchObject({ eligibility: "eligible", deterministicScore: 10000, confidenceBasisPoints: 10000 });
  }, 120_000);
  test("routes the current database validator to format 3 without changing format 2", async () => {
    const requirements = saved(true, true);
    const [next] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_validate_publication_configuration(${JSON.stringify(rules)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb) AS result`;
    expect(next!.result).toEqual(rules);
    const legacy = { version: 2, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["required"] }] };
    const [previous] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_validate_publication_configuration(${JSON.stringify(legacy)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb) AS result`;
    expect(previous!.result).toEqual(legacy);
  }, 120_000);
  test("rejects noncanonical saved requirement keys in both paths", async () => {
    const requirements = [{ ...saved(true)[0], key: "Payroll" }];
    expect(() => evaluatePublishedOption(requirements, rules, [])).toThrow();
    await expect(context!.client`
      SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(rules)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, '[]'::jsonb)`).rejects.toMatchObject({ code: "22023" });
  }, 120_000);
  test("ignores unrelated delivery evidence when determining freshness", async () => {
    const requirements = saved(true);
    const unrelated = { ...fact("comparison_addon_inclusions", JSON.stringify({ another_feature: true })),
      valid_until: "2026-09-16T00:00:00.000Z" };
    const facts = [fact("payroll", "true"), scopes, coverage("native"), unrelated];
    const expected = evaluatePublishedOption(requirements, rules, facts);
    const [row] = await context!.client<{ result: Record<string, unknown> }[]>`
      SELECT mmhr_private.r3_evaluate_publication_option_v3(${JSON.stringify(rules)}::text::jsonb,
        ${JSON.stringify(requirements)}::text::jsonb, ${JSON.stringify(facts)}::text::jsonb) AS result`;
    expect(Date.parse(String(row!.result.validUntil))).toBe(Date.parse("2026-10-15T00:00:00.000Z"));
    expect(Date.parse(String(row!.result.validUntil))).toBe(Date.parse(String(expected.validUntil)));
  }, 120_000);
});
