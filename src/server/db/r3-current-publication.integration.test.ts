import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  currentEvaluationPublicationResultSchema,
} from "@/server/commands/current-evaluation-publication";
import { initialEvaluationSelectionReadSchema } from "@/server/commands/evaluation-selection";
import { publicationReadSchema } from "@/server/matching/option-publication-contract";
import { evaluateEstimateScope } from "@/server/matching/fact-scope";
import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  createMembership,
  createSecurityPrincipal,
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTokenPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  CONFIG,
  REQUIREMENT_KEY,
  addContributor,
  addPortalGrant,
  prepare,
  publish,
  publicationPayload,
  readPublication,
  seedSubmittedIntake,
  seedVendorOption,
  type SeededInput,
} from "./r3-evaluation-publication-fixtures";

describe("R3 current evaluation publication discovery", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;

  beforeAll(async () => {
    context = await startRehearsal("r3-current-publication");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const value = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      await addContributor(sql, value.organizationId, customerContributor);
      await addPortalGrant(sql, value.organizationId, value.pair[1].identityId);
      return value;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  async function current(
    sql: SecurityTransaction,
    principal: SecurityTokenPrincipal,
    intakeId: string,
    limit = 25,
    assurance: "aal1" | "aal2" = "aal1",
  ) {
    return asAuthenticated(sql, principal, async (probe) => {
      const correlationId = randomUUID();
      const [row] = await probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_get_current_evaluation_publication(
          ${JSON.stringify({ organizationId: fixture.organizationId, intakeId, limit })}::text::jsonb,
          ${correlationId}::uuid
        ) AS result
      `;
      const parsed = currentEvaluationPublicationResultSchema.parse(row!.result);
      expect(parsed.correlationId).toBe(correlationId);
      return parsed;
    }, assurance);
  }

  async function currentRaw(
    sql: SecurityTransaction,
    principal: SecurityTokenPrincipal,
    payload: unknown,
    assurance: "aal1" | "aal2" = "aal1",
  ) {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: unknown }[]>`
        SELECT public.mmhr_get_current_evaluation_publication(
          ${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid
        ) AS result
      `;
      return row!.result;
    }, assurance);
  }

  async function seedDraft(sql: SecurityTransaction) {
    const intakeId = randomUUID();
    await sql`
      INSERT INTO public.intakes (
        id, organization_id, status, created_by_identity_id, updated_by_identity_id
      ) VALUES (
        ${intakeId}::uuid, ${fixture.organizationId}::uuid, 'draft',
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
      )
    `;
    return intakeId;
  }

  async function publishOptions(sql: SecurityTransaction, index: number, count = 6) {
    const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
    const inputs: SeededInput[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      inputs.push(await seedVendorOption(sql, fixture, index + offset));
    }
    const payload = { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG };
    const prepared = await prepare(sql, fixture.pair[0], payload);
    const published = await publish(sql, fixture.pair[0], {
      organizationId: fixture.organizationId,
      publicationId: prepared.publicationId,
      expectedDigest: prepared.inputDigest,
      approvalReference: `current-publication-${index}`,
      reason: "Publish current customer options",
    });
    return { intakeId, inputs, prepared, published };
  }

  test("keeps estimate scope aligned between the application and database", async () => {
    await rollbackCase(context!, async (sql) => {
      const [available] = await sql<{ present: boolean }[]>`SELECT
        to_regprocedure('mmhr_private.r3_estimate_scope(jsonb,jsonb,jsonb,jsonb)') IS NOT NULL AS present`;
      expect(available!.present).toBe(true);
      const scope = { version: 1, conditions: [{ kind: "module", requirementKey: "package",
        responsePath: ["payroll"], allowedValues: [true] }] };
      const yes = [{ key: "package", response: { payroll: true } }];
      const no = [{ key: "package", response: { payroll: false } }];
      const cases = [
        { context: { estimateEmployeeCountV1: 25 }, scope, requirements: yes },
        { context: { estimateEmployeeCountV1: 26 }, scope, requirements: yes },
        { context: {}, scope, requirements: yes },
        { context: { estimateEmployeeCountV1: "25" }, scope, requirements: yes },
        { context: { estimateEmployeeCountV1: 25.5 }, scope, requirements: yes },
        { context: { estimateEmployeeCountV1: 0 }, scope, requirements: yes },
        { context: { estimateEmployeeCountV1: 25 }, scope, requirements: no },
        { context: {}, scope, requirements: no },
        { context: { estimateEmployeeCountV1: 25 }, scope: null, requirements: yes },
        { context: { estimateEmployeeCountV1: 25 }, scope, requirements: [] },
      ];
      for (const item of cases) {
        const [row] = await sql<{ result: string }[]>`SELECT mmhr_private.r3_estimate_scope(
          ${JSON.stringify(item.context)}::text::jsonb, ${JSON.stringify(25)}::text::jsonb,
          ${JSON.stringify(item.scope)}::text::jsonb, ${JSON.stringify(item.requirements)}::text::jsonb) AS result`;
        expect(row!.result).toBe(evaluateEstimateScope({ estimateEmployeeCount: 25, companyContext: item.context,
          scope: item.scope, requirements: item.requirements }));
      }
    });
  }, 180_000);

  test("returns scoped estimates only for a matching customer while keeping legacy details", async () => {
    await rollbackCase(context!, async (sql) => {
      const [available] = await sql<{ present: boolean }[]>`SELECT
        to_regprocedure('mmhr_private.r3_masked_publication_details_v2(jsonb,jsonb,jsonb,jsonb,jsonb)') IS NOT NULL AS present`;
      expect(available!.present).toBe(true);
      const estimate = { recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 25,
        includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: ["taxes"], oneTime: null };
      const setupEstimate = { duration: { minimum: 4, maximum: 8 }, unit: "weeks", scope: "initial_implementation",
        includedModules: ["hr", "payroll"], assumptions: ["customer_data_ready"] };
      const capability = await seedVendorOption(sql, fixture, 901);
      const price = await seedVendorOption(sql, fixture, 902, { fieldKey: "comparison_annual_cost", factValue: JSON.stringify(estimate) });
      const setup = await seedVendorOption(sql, fixture, 904, { fieldKey: "comparison_setup", factValue: JSON.stringify(setupEstimate) });
      const scope = await seedVendorOption(sql, fixture, 903, { fieldKey: "comparison_fact_scopes", factValue: JSON.stringify({
        comparison_annual_cost: { version: 1, conditions: [{ kind: "module", requirementKey: "package",
          responsePath: ["payroll"], allowedValues: [true] }] },
        comparison_setup: { version: 1, conditions: [{ kind: "module", requirementKey: "package",
          responsePath: ["payroll"], allowedValues: [true] }] },
      }) });
      const requirements = [{ key: REQUIREMENT_KEY, response: "yes" }, { key: "package", response: { payroll: true } }];
      const inputs = [capability.input, price.input, setup.input, scope.input];
      const option = { fitReasons: [REQUIREMENT_KEY], limitations: [] };
      const read = async (companyContext: unknown, rows = inputs, answers = requirements) => {
        const [result] = await sql<{ value: { annualCost: unknown; setup: unknown } }[]>`SELECT mmhr_private.r3_masked_publication_details_v2(
          ${JSON.stringify(CONFIG)}::text::jsonb, ${JSON.stringify(answers)}::text::jsonb,
          ${JSON.stringify(rows)}::text::jsonb, ${JSON.stringify(option)}::text::jsonb,
          ${JSON.stringify(companyContext)}::text::jsonb) AS value`;
        return result!.value;
      };
      expect((await read({ estimateEmployeeCountV1: 25 })).annualCost).toMatchObject(estimate);
      expect((await read({ estimateEmployeeCountV1: 25 })).setup).toMatchObject(setupEstimate);
      expect((await read({ estimateEmployeeCountV1: 26 })).annualCost).toBeNull();
      expect((await read({})).annualCost).toBeNull();
      const withoutScope = await read({ estimateEmployeeCountV1: 25 }, [capability.input, price.input, setup.input]);
      expect(withoutScope.annualCost).toBeNull();
      expect(withoutScope.setup).toBeNull();
      const withoutPackage = await read({ estimateEmployeeCountV1: 25 }, inputs,
        [{ key: REQUIREMENT_KEY, response: "yes" }, { key: "package", response: { payroll: false } }]);
      expect(withoutPackage.annualCost).toBeNull();
      expect(withoutPackage.setup).toBeNull();
      const [legacy] = await sql<{ value: { annualCost: unknown } }[]>`SELECT mmhr_private.r3_masked_publication_details(
        ${JSON.stringify(CONFIG)}::text::jsonb, ${JSON.stringify(requirements)}::text::jsonb,
        ${JSON.stringify(inputs)}::text::jsonb, ${JSON.stringify(option)}::text::jsonb) AS value`;
      expect(legacy!.value.annualCost).toMatchObject(estimate);
    });
  }, 180_000);

  test("supports scoped details on customer discovery and later pages", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, prepared } = await publishOptions(sql, 910, 3);
      const scope = { organizationId: fixture.organizationId, intakeId, limit: 2 };
      const first = currentEvaluationPublicationResultSchema.parse(await currentRaw(sql, customerContributor,
        { ...scope, detailsVersion: 2 }));
      expect(first.publication?.options).toHaveLength(2);
      expect(first.publication?.nextOrdinal).toBe(2);
      expect(first.publication?.options.every((option) => option.details?.annualCost === null)).toBe(true);
      const later = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", {
        ...publicationPayload(fixture.organizationId, intakeId, String(prepared.publicationId), 2, 2), detailsVersion: 2,
      }, "aal1"));
      expect(later.options).toHaveLength(1);
      expect(later.options[0]!.ordinal).toBe(3);
      expect(later.options[0]!.details?.annualCost).toBeNull();
      await expect(sql.savepoint((probe) => currentRaw(probe, customerContributor,
        { ...scope, organizationId: randomUUID(), detailsVersion: 2 }))).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => currentRaw(probe, customerContributor,
        { ...scope, detailsVersion: 3 }))).rejects.toMatchObject({ code: "22023" });
      for (const role of ["anon", "authenticated", "service_role", "mmhr_worker"]) {
        const [privilege] = await sql<{ allowed: boolean }[]>`SELECT has_function_privilege(
          ${role}, 'mmhr_private.r3_read_evaluation_publication_v2(jsonb,uuid,boolean)', 'EXECUTE') AS allowed`;
        expect(privilege!.allowed).toBe(false);
      }
    });
  }, 180_000);

  test("lets a customer without MFA create an intake, submit needs, and save choices", async () => {
    await rollbackCase(context!, async (sql) => {
      const identityId = randomUUID(), subject = randomUUID(), sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      const email = `comparison-${subject}@example.invalid`;
      await sql`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES (${subject}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
          'authenticated', 'authenticated', ${email}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`;
      await sql`INSERT INTO public.identities (id, auth_user_id, normalized_email, email_verified_at, status,
        activated_at, synchronized_at, migration_review_required)
        VALUES (${identityId}::uuid, ${subject}::uuid, ${email}, now(), 'active', now(), now(), false)`;
      await sql`INSERT INTO auth.sessions (id, user_id, aal, not_after, created_at, updated_at)
        VALUES (${sessionId}::uuid, ${subject}::uuid, 'aal1', ${expiresAt.toISOString()}::timestamptz, now(), now())`;
      const customer: SecurityTokenPrincipal = { identityId, subject, sessionId, expiresAt };
      await addContributor(sql, fixture.organizationId, customer);
      const [factor] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth.mfa_factors WHERE user_id=${subject}::uuid`;
      expect(factor!.count).toBe(0);
      const submitCustomerIntake = (employeeCount: number) => asAuthenticated(sql, customer, async (probe) => {
        const payload = { intakeId: null, organizationId: fixture.organizationId, expectedRevision: 0,
          status: "in_progress", data: { companyContext: { sector: "services", estimateEmployeeCountV1: employeeCount } } };
        const [created] = await probe<{ result: { intakeId: string; outcomeCode: string; revision: number } }[]>`
          SELECT public.mmhr_save_customer_intake(
            ${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid) AS result`;
        expect(created!.result).toMatchObject({ outcomeCode: "created", revision: 1 });
        const createdIntakeId = created!.result.intakeId;
        const requirement = { requirementId: randomUUID(), organizationId: fixture.organizationId,
          intakeId: createdIntakeId, expectedRevision: 0, stableKey: REQUIREMENT_KEY,
          label: "Payroll platform", importance: "must", weight: 100, response: "yes", requirementType: "structured" };
        await probe`SELECT public.mmhr_save_customer_intake_requirement(
          ${JSON.stringify(requirement)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
        const [submitted] = await probe<{ result: { status: string; revision: number } }[]>`
          SELECT public.mmhr_submit_customer_intake(
            ${JSON.stringify({ organizationId: fixture.organizationId, intakeId: createdIntakeId, expectedRevision: 1 })}::text::jsonb,
            ${randomUUID()}::uuid, ${randomUUID()}::uuid) AS result`;
        expect(submitted!.result).toMatchObject({ status: "submitted", revision: 2 });
        return createdIntakeId;
      }, "aal1");
      const intakeId = await submitCustomerIntake(25);
      const first = await seedVendorOption(sql, fixture, 800);
      for (let index = 1; index < 6; index += 1) await seedVendorOption(sql, fixture, 800 + index);
      const scopedEstimate = { recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 25,
        includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: ["taxes"], oneTime: null };
      const scope = { comparison_annual_cost: { version: 1, conditions: [{ kind: "module", requirementKey: REQUIREMENT_KEY,
        responsePath: [], allowedValues: ["yes"] }] } };
      for (const [fieldKey, value] of [["comparison_annual_cost", scopedEstimate], ["comparison_fact_scopes", scope]] as const) {
        const factId = randomUUID(), evidenceId = randomUUID();
        await sql`INSERT INTO public.vendor_facts (id, organization_id, vendor_profile_id, product_id, field_key,
          value, observed_at, status, created_by_identity_id)
          SELECT ${factId}::uuid, organization_id, vendor_profile_id, product_id, ${fieldKey},
            ${JSON.stringify(value)}, observed_at, status, created_by_identity_id
          FROM public.vendor_facts WHERE id=${String(first.input.fact_id)}::uuid`;
        await sql`INSERT INTO public.vendor_evidence_versions (id, organization_id, fact_id, source_id, version,
          content_hash, captured_at, fresh_until, citation)
          SELECT ${evidenceId}::uuid, organization_id, ${factId}::uuid, source_id, version,
            content_hash, captured_at, fresh_until, citation
          FROM public.vendor_evidence_versions WHERE id=${first.evidenceId}::uuid`;
        await sql`INSERT INTO public.vendor_fact_reviews (id, organization_id, evidence_id, reviewer_identity_id,
          decision, decided_at, reason)
          SELECT ${randomUUID()}::uuid, organization_id, ${evidenceId}::uuid, reviewer_identity_id,
            decision, decided_at, reason FROM public.vendor_fact_reviews WHERE evidence_id=${first.evidenceId}::uuid`;
      }
      const prepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      await publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: prepared.publicationId,
        expectedDigest: prepared.inputDigest, approvalReference: "no-mfa-fixture", reason: "Publish test comparison",
      });
      const result = await current(sql, customer, intakeId);
      expect(result.publication?.options).toHaveLength(6);
      const scoped = currentEvaluationPublicationResultSchema.parse(await currentRaw(sql, customer,
        { organizationId: fixture.organizationId, intakeId, limit: 25, detailsVersion: 2 }));
      expect(scoped.publication?.options.filter((option) => Boolean(option.details?.annualCost))).toHaveLength(1);
      expect(scoped.publication?.options.find((option) => Boolean(option.details?.annualCost))?.details?.annualCost)
        .toMatchObject(scopedEstimate);
      const input = { organizationId: fixture.organizationId, intakeId, publicationId: prepared.publicationId,
        expectedDigest: prepared.inputDigest, optionIds: result.publication!.options.slice(0, 5).map((option) => option.optionId) };
      const selection = await asAuthenticated(sql, customer, async (probe) => {
        const [row] = await probe`SELECT public.mmhr_select_initial_evaluation_options(
          ${JSON.stringify(input)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid) AS result`;
        return row!.result as { selectedCount: number; initialCandidateCount: number; outcomeCode: string };
      }, "aal1");
      expect(selection).toMatchObject({ selectedCount: 5, initialCandidateCount: 5, outcomeCode: "created" });
      const after = await current(sql, customer, intakeId);
      expect(after.publication?.options).toHaveLength(6);
      const otherIntakeId = await submitCustomerIntake(26);
      const other = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId: otherIntakeId, expectedRevision: 2, configuration: CONFIG,
      });
      await publish(sql, fixture.pair[0], { organizationId: fixture.organizationId, publicationId: other.publicationId,
        expectedDigest: other.inputDigest, approvalReference: "mismatched-count-fixture", reason: "Publish test comparison" });
      const newRead = currentEvaluationPublicationResultSchema.parse(await currentRaw(sql, customer,
        { organizationId: fixture.organizationId, intakeId: otherIntakeId, limit: 25, detailsVersion: 2 }));
      const oldRead = currentEvaluationPublicationResultSchema.parse(await currentRaw(sql, customer,
        { organizationId: fixture.organizationId, intakeId: otherIntakeId, limit: 25, detailsVersion: 1 }));
      expect(newRead.publication?.options.every((option) => option.details?.annualCost === null)).toBe(true);
      expect(oldRead.publication?.options.some((option) => Boolean(option.details?.annualCost))).toBe(true);
      expect(newRead.publication?.options.map((option) => option.deterministicScore))
        .toEqual(oldRead.publication?.options.map((option) => option.deterministicScore));
    });
  }, 180_000);

  test("returns the exact empty wrapper for submitted and draft intakes", async () => {
    await rollbackCase(context!, async (sql) => {
      const submittedId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const draftId = await seedDraft(sql);
      const submitted = await current(sql, customerContributor, submittedId);
      const draft = await current(sql, customerContributor, draftId);
      expect(submitted.publication).toBeNull();
      expect(draft.publication).toBeNull();
      expect(submitted.organizationId).toBe(fixture.organizationId);
      expect(submitted.intakeId).toBe(submittedId);
    });
  }, 120_000);

  test("denies unauthorized, missing, and foreign intake scopes", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const outsider = await createSecurityPrincipal(sql);
      await expect(current(sql, outsider, intakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(current(sql, customerContributor, randomUUID())).rejects.toMatchObject({ code: "42501" });

      const foreignOrganizationId = randomUUID();
      const foreignIntakeId = randomUUID();
      await sql`
        INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
        VALUES (${foreignOrganizationId}::uuid, 'Foreign current publication org', 'customer', 'active', now(), false)
      `;
      await createMembership(sql, foreignOrganizationId, fixture.organizationAdmin, "organization_admin");
      await sql`
        INSERT INTO public.intakes (id, organization_id, status, created_by_identity_id, updated_by_identity_id, submitted_at)
        VALUES (${foreignIntakeId}::uuid, ${foreignOrganizationId}::uuid, 'submitted',
          ${fixture.organizationAdmin.identityId}::uuid, ${fixture.organizationAdmin.identityId}::uuid, now())
      `;
      await expect(current(sql, customerContributor, foreignIntakeId)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("isolates two published comparisons and their saved choices", async () => {
    await rollbackCase(context!, async (sql) => {
      const first = await publishOptions(sql, 900);
      const secondOrganizationId = randomUUID();
      const secondCustomer = await createSecurityPrincipal(sql);
      await sql`INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
        VALUES (${secondOrganizationId}::uuid, 'Second comparison fixture', 'customer', 'active', now(), false)`;
      await createMembership(sql, secondOrganizationId, fixture.organizationAdmin, "organization_admin");
      await createMembership(sql, secondOrganizationId, fixture.pair[0]);
      await addContributor(sql, secondOrganizationId, secondCustomer);
      await addPortalGrant(sql, secondOrganizationId, fixture.pair[1].identityId);
      await sql`INSERT INTO public.user_permission_overrides (
        identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason
      ) VALUES (
        ${fixture.pair[0].identityId}::uuid, 'workspace.access', 'organization', ${secondOrganizationId}::uuid,
        ${`organization:${secondOrganizationId}`}, 'allow', ${fixture.pair[1].identityId}::uuid, 'Two-customer isolation fixture'
      )`;
      const secondFixture = { ...fixture, organizationId: secondOrganizationId };
      const secondIntakeId = await seedSubmittedIntake(sql, secondFixture, secondCustomer);
      const secondPrepared = await prepare(sql, fixture.pair[0], {
        organizationId: secondOrganizationId, intakeId: secondIntakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const secondPublished = await publish(sql, fixture.pair[0], {
        organizationId: secondOrganizationId, publicationId: secondPrepared.publicationId,
        expectedDigest: secondPrepared.inputDigest, approvalReference: "second-customer-publication",
        reason: "Publish second customer fixture",
      });
      const scopes = [
        { principal: customerContributor, organizationId: fixture.organizationId, intakeId: first.intakeId,
          publicationId: String(first.published.publicationId), digest: String(first.prepared.inputDigest) },
        { principal: secondCustomer, organizationId: secondOrganizationId, intakeId: secondIntakeId,
          publicationId: String(secondPublished.publicationId), digest: String(secondPrepared.inputDigest) },
      ];
      const reads = [];
      for (const scope of scopes) {
        const result = currentEvaluationPublicationResultSchema.parse(await currentRaw(sql, scope.principal, {
          organizationId: scope.organizationId, intakeId: scope.intakeId, limit: 2, detailsVersion: 2,
        }));
        expect(result.publication?.publicationId).toBe(scope.publicationId);
        expect(result.publication?.options).toHaveLength(2);
        reads.push(result.publication!);
      }
      expect(scopes[0]!.publicationId).not.toBe(scopes[1]!.publicationId);
      for (const [index, scope] of scopes.entries()) {
        const other = scopes[1 - index]!;
        await expect(currentRaw(sql, scope.principal, {
          organizationId: other.organizationId, intakeId: other.intakeId, detailsVersion: 2,
        })).rejects.toMatchObject({ code: "42501" });
        await expect(currentRaw(sql, scope.principal, {
          organizationId: scope.organizationId, intakeId: other.intakeId, detailsVersion: 2,
        })).rejects.toMatchObject({ code: "42501" });
        await expect(readPublication(sql, scope.principal, "get", {
          ...publicationPayload(other.organizationId, other.intakeId, other.publicationId, 0, 2), detailsVersion: 2,
        }, "aal1")).rejects.toMatchObject({ code: "42501" });
        await expect(readPublication(sql, scope.principal, "get", {
          ...publicationPayload(scope.organizationId, scope.intakeId, other.publicationId, 0, 2), detailsVersion: 2,
        }, "aal1")).rejects.toMatchObject({ code: "42501" });
        const select = (organizationId: string, intakeId: string, publicationId: string, digest: string, optionId: string) =>
          asAuthenticated(sql, scope.principal, async (probe) => {
            const payload = { organizationId, intakeId, publicationId, expectedDigest: digest, optionIds: [optionId] };
            const [row] = await probe<{ result: { items: unknown[] } }[]>`SELECT public.mmhr_select_initial_evaluation_options(
              ${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid) AS result`;
            return row!.result;
          }, "aal1");
        await expect(select(other.organizationId, other.intakeId, other.publicationId, other.digest,
          reads[1 - index]!.options[0]!.optionId)).rejects.toMatchObject({ code: "42501" });
        await expect(select(scope.organizationId, scope.intakeId, other.publicationId, other.digest,
          reads[1 - index]!.options[0]!.optionId)).rejects.toMatchObject({ code: "42501" });
        expect((await select(scope.organizationId, scope.intakeId, scope.publicationId, scope.digest,
          reads[index]!.options[0]!.optionId)).items).toHaveLength(1);
      }
      for (const [index, scope] of scopes.entries()) {
        const other = scopes[1 - index]!;
        const readChoices = (organizationId: string, intakeId: string) => asAuthenticated(sql, scope.principal, async (probe) => {
          const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_get_initial_evaluation_selections(
            ${JSON.stringify({ organizationId, intakeId })}::text::jsonb, ${randomUUID()}::uuid) AS result`;
          return row!.result;
        }, "aal1");
        const own = initialEvaluationSelectionReadSchema.parse(await readChoices(scope.organizationId, scope.intakeId));
        expect(own).toMatchObject({ organizationId: scope.organizationId, intakeId: scope.intakeId, initialCandidateCount: 1 });
        expect(own.items.map((item) => item.optionId)).toEqual([reads[index]!.options[0]!.optionId]);
        await expect(readChoices(other.organizationId, other.intakeId)).rejects.toMatchObject({ code: "42501" });
      }
      const selected = await sql<{ organization_id: string; count: number }[]>`
        SELECT organization_id, count(*)::int AS count FROM public.evaluation_initial_selection_items
        WHERE intake_id IN (${first.intakeId}::uuid, ${secondIntakeId}::uuid)
        GROUP BY organization_id ORDER BY organization_id`;
      expect(selected).toHaveLength(2);
      expect(selected.every((row) => row.count === 1)).toBe(true);
      expect(selected.map((row) => row.organization_id).sort()).toEqual([fixture.organizationId, secondOrganizationId].sort());
    });
  }, 240_000);

  test("rejects malformed current-publication payloads with stable input errors", async () => {
    await rollbackCase(context!, async (sql) => {
      const malformed = [
        null,
        [],
        "not an object",
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 0 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 51 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), limit: 1.5 },
        { organizationId: fixture.organizationId, intakeId: randomUUID(), extra: true },
      ];
      for (const payload of malformed) {
        await expect(sql.savepoint((probe) => currentRaw(probe, customerContributor, payload)))
          .rejects.toMatchObject({ code: "22023" });
      }
    });
  }, 120_000);

  test("returns a bounded masked first page and keeps later pages explicit", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, published } = await publishOptions(sql, 10, 6);
      const first = await current(sql, customerContributor, intakeId, 3);
      expect(first.publication).not.toBeNull();
      const publication = publicationReadSchema.parse(first.publication);
      expect(publication).toMatchObject({
        publicationId: published.publicationId,
        state: "published",
        optionCount: 6,
      });
      expect(publication.options).toHaveLength(3);
      expect(publication.options.map((option) => option.ordinal)).toEqual([1, 2, 3]);
      expect(publication.nextOrdinal).toBe(3);
      expect(JSON.stringify(publication)).not.toMatch(/vendorOrganizationId|productId|sourceId|evidenceId/);

      const second = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", publicationPayload(
        fixture.organizationId, intakeId, String(published.publicationId), 3, 10,
      ), "aal1"));
      expect(second.options).toHaveLength(3);
      expect(second.options.map((option) => option.ordinal)).toEqual([4, 5, 6]);
      expect(second.nextOrdinal).toBeNull();
    });
  }, 180_000);

  test("does not replace a published version with a newer prepared version, then revokes without fallback", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, prepared: firstPrepared, published: firstPublished } = await publishOptions(sql, 20, 6);
      const newerPrepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const beforePublish = await current(sql, customerContributor, intakeId);
      expect(beforePublish.publication).toMatchObject({ publicationId: firstPublished.publicationId });
      expect(newerPrepared.publicationId).not.toBe(firstPrepared.publicationId);

      const newerPublished = await publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: newerPrepared.publicationId,
        expectedDigest: newerPrepared.inputDigest, approvalReference: "current-replacement",
        reason: "Publish replacement",
      });
      const afterPublish = await current(sql, customerContributor, intakeId);
      expect(afterPublish.publication).toMatchObject({ publicationId: newerPublished.publicationId });

      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`SELECT public.mmhr_revoke_evaluation_publication(
          ${JSON.stringify({ organizationId: fixture.organizationId, publicationId: newerPublished.publicationId, reason: "Revoke current" })}::text::jsonb,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid
        )`;
      });
      const afterRevoke = await current(sql, customerContributor, intakeId);
      expect(afterRevoke.publication).toBeNull();
    });
  }, 180_000);

  test("rejects a current publication after approved inputs change", async () => {
    await rollbackCase(context!, async (sql) => {
      const { intakeId, inputs } = await publishOptions(sql, 40, 6);
      const before = await current(sql, customerContributor, intakeId);
      expect(before.publication).not.toBeNull();
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = now() - interval '1 hour' WHERE id = ${inputs[0]!.evidenceId}::uuid`;
      await sql`UPDATE public.vendor_sources SET active = false WHERE id = ${inputs[0]!.sourceId}::uuid`;
      await expect(current(sql, customerContributor, intakeId)).rejects.toMatchObject({ code: "42501" });
    });
  }, 180_000);
});
