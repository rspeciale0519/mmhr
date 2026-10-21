import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  evaluatePublishedOption,
  publicationReadSchema,
} from "@/server/matching/option-publication-contract";
import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  CONFIG,
  REQUIREMENT_KEY,
  addContributor,
  addPortalGrant,
  expectAppendOnlyFailure,
  fixtureDates,
  prepare,
  publish,
  publicationArtifacts,
  publicationPayload,
  readPublication,
  revoke,
  seedSubmittedIntake,
  seedVendorOption,
  type RpcResult,
  type SeededInput,
} from "./r3-evaluation-publication-fixtures";
import {
  asAuthenticated,
  createCommandFixture,
  createSecurityPrincipal,
  deferred,
  rollbackCase,
  waitForGuardWait,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import { assertEvaluationParity } from "./r3-evaluation-publication-parity";
import { annualCostEstimateSchema, maskedPublicationDetailsSchema } from "@/server/matching/masked-publication-details";

describe("R3 evaluation publication RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;

  beforeAll(async () => {
    context = await startRehearsal("r3-evaluation-publication");
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

  test("prepares, reviews, publishes, paginates, masks, replays, revokes, and replaces six options", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const inputs: SeededInput[] = [];
      const dates = fixtureDates();
      for (let index = 0; index < 6; index += 1) {
        inputs.push(await seedVendorOption(sql, fixture, index + 1, dates));
      }
      const payload = { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG };
      const prepareCorrelation = randomUUID();
      const prepareKey = randomUUID();
      const prepared = await prepare(sql, fixture.pair[0], payload, "aal2", prepareCorrelation, prepareKey);
      const publicationId = String(prepared.publicationId);
      expect(prepared).toMatchObject({ organizationId: fixture.organizationId, intakeId, state: "prepared", optionCount: 6 });
      expect(prepared.inputDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(prepared.outcomeCode).toEqual(expect.any(String));
      const replayedPrepare = await prepare(sql, fixture.pair[0], payload, "aal2", prepareCorrelation, prepareKey);
      expect(replayedPrepare).toEqual({ ...prepared, outcomeCode: "replayed" });

      const readPayload = publicationPayload(fixture.organizationId, intakeId, publicationId, 0, 3);
      await expect(readPublication(sql, customerContributor, "get", readPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
      const reviewed = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", readPayload));
      expect(reviewed).toMatchObject({ publicationId, state: "prepared", optionCount: 6 });
      expect(reviewed.options).toHaveLength(3);
      expect(reviewed.nextOrdinal).toBe(3);
      expect(JSON.stringify(reviewed)).not.toMatch(/vendorOrganizationId|productId|sourceId|evidenceId/);

      const expected = evaluatePublishedOption([{
        requirementId: randomUUID(), revision: 1, key: REQUIREMENT_KEY, label: "Payroll platform",
        importance: "must", weight: 100, response: "yes",
      }], CONFIG, [inputs[0]!.input]);
      expect(reviewed.options[0]).toMatchObject({
        eligibility: expected.eligibility,
        deterministicScore: expected.deterministicScore,
        confidenceBasisPoints: expected.confidenceBasisPoints,
        fitReasons: expected.fitReasons,
        limitations: expected.limitations,
      });
      expect(Date.parse(reviewed.options[0]!.evidenceFreshAt!)).toBe(Date.parse(String(expected.evidenceFreshAt)));
      expect(Date.parse(reviewed.options[0]!.validUntil!)).toBe(Date.parse(String(expected.validUntil)));
      const secondPage = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", publicationPayload(fixture.organizationId, intakeId, publicationId, 3, 10)));
      expect(secondPage.options).toHaveLength(3);
      expect(secondPage.nextOrdinal).toBeNull();

      await expect(prepare(sql, customerContributor, payload, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(prepare(sql, fixture.pair[0], payload, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(prepare(sql, fixture.pair[0], {
        ...payload, organizationId: randomUUID(),
      })).rejects.toMatchObject({ code: "42501" });
      await expect(publish(sql, customerContributor, { organizationId: fixture.organizationId, publicationId, expectedDigest: prepared.inputDigest, approvalReference: "approval-1", reason: "Publish for customer review" }, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(readPublication(sql, customerContributor, "review", readPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(revoke(sql, customerContributor, { organizationId: fixture.organizationId, publicationId, reason: "No customer mutation" }, "aal1")).rejects.toMatchObject({ code: "42501" });

      const malformedArtifacts = await publicationArtifacts(sql, publicationId);
      await expect(sql.savepoint((probe) => publish(probe, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId, expectedDigest: prepared.inputDigest,
        approvalReference: { invalid: true }, reason: "Malformed approval reference",
      }))).rejects.toMatchObject({ code: "22023" });
      await expect(sql.savepoint((probe) => publish(probe, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId, expectedDigest: prepared.inputDigest,
        approvalReference: "approval-1", reason: { invalid: true },
      }))).rejects.toMatchObject({ code: "22023" });
      expect(await publicationArtifacts(sql, publicationId)).toEqual(malformedArtifacts);

      const olderPrepared = await prepare(sql, fixture.pair[0], payload);
      expect(olderPrepared).toMatchObject({ state: "prepared", sequence: 2 });
      const replacement = await prepare(sql, fixture.pair[0], payload);
      expect(replacement).toMatchObject({ organizationId: fixture.organizationId, intakeId, state: "prepared", optionCount: 6 });
      expect(replacement.publicationId).not.toBe(publicationId);
      expect(replacement.sequence).toBe(3);

      const publishPayload = { organizationId: fixture.organizationId, publicationId, expectedDigest: prepared.inputDigest, approvalReference: "approval-1", reason: "Publish for customer review" };
      const publishCorrelation = randomUUID();
      const publishKey = randomUUID();
      const published = await publish(sql, fixture.pair[0], publishPayload, "aal2", publishCorrelation, publishKey);
      expect(published).toMatchObject({ publicationId, state: "published" });
      const receiptsBeforeReplay = await sql<{ count: number }[]>`SELECT count(*)::integer AS count FROM public.security_command_receipts WHERE entity_id = ${publicationId}::uuid`;
      const replayedPublish = await publish(sql, fixture.pair[0], publishPayload, "aal2", publishCorrelation, publishKey);
      expect(replayedPublish).toEqual({ ...published, outcomeCode: "replayed" });
      const receiptsAfterReplay = await sql<{ count: number }[]>`SELECT count(*)::integer AS count FROM public.security_command_receipts WHERE entity_id = ${publicationId}::uuid`;
      expect(receiptsAfterReplay[0]!.count).toBe(receiptsBeforeReplay[0]!.count);

      const customerPage = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", readPayload, "aal1"));
      expect(customerPage.state).toBe("published");
      expect(customerPage.options).toHaveLength(3);
      expect(customerPage.options.every((option) => option.maskedLabel.startsWith("Option "))).toBe(true);
      const pageText = JSON.stringify(customerPage);
      expect(pageText).not.toMatch(/vendorOrganizationId|productId|sourceId|evidenceId/);
      await expectAppendOnlyFailure(sql, (probe) => probe`UPDATE public.evaluation_publications SET option_count = option_count WHERE id = ${publicationId}::uuid`);
      await expectAppendOnlyFailure(sql, (probe) => probe`DELETE FROM public.evaluation_publication_options WHERE publication_id = ${publicationId}::uuid`);
      await expectAppendOnlyFailure(sql, (probe) => probe`TRUNCATE public.evaluation_publication_decisions`);
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`SELECT count(*) FROM public.evaluation_publications`)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`SELECT count(*) FROM public.evaluation_publication_options`)).rejects.toMatchObject({ code: "42501" });

      const deniedArtifacts = await publicationArtifacts(sql, publicationId);
      await expect(publish(sql, customerContributor, publishPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(revoke(sql, customerContributor, { organizationId: fixture.organizationId, publicationId, reason: "No customer mutation" }, "aal1")).rejects.toMatchObject({ code: "42501" });
      expect(await publicationArtifacts(sql, publicationId)).toEqual(deniedArtifacts);

      const replacementPublished = await publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: replacement.publicationId,
        expectedDigest: replacement.inputDigest, approvalReference: "approval-2", reason: "Replace publication",
      });
      expect(replacementPublished).toMatchObject({ publicationId: replacement.publicationId, state: "published" });
      const olderArtifacts = await publicationArtifacts(sql, String(olderPrepared.publicationId));
      await expect(publish(sql, fixture.pair[0], {
        ...publishPayload, publicationId: olderPrepared.publicationId,
        expectedDigest: olderPrepared.inputDigest,
      })).rejects.toMatchObject({ code: "42501" });
      expect(await publicationArtifacts(sql, String(olderPrepared.publicationId))).toEqual(olderArtifacts);
      await expect(readPublication(sql, customerContributor, "get", readPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
      const replacementPage = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", publicationPayload(fixture.organizationId, intakeId, String(replacement.publicationId), 0, 3), "aal1"));
      expect(replacementPage.state).toBe("published");
      const staleDates = fixtureDates();
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = ${staleDates.expiredAt}::timestamptz WHERE id = ${inputs[0]!.evidenceId}::uuid`;
      await sql`UPDATE public.vendor_sources SET active = false WHERE id = ${inputs[0]!.sourceId}::uuid`;
      await expect(readPublication(sql, customerContributor, "get", publicationPayload(fixture.organizationId, intakeId, String(replacement.publicationId), 0, 3), "aal1")).rejects.toMatchObject({ code: "42501" });
      const revokePayload = { organizationId: fixture.organizationId, publicationId: String(replacement.publicationId), reason: "Review complete" };
      const revokeCorrelation = randomUUID();
      const revokeKey = randomUUID();
      const revoked = await revoke(sql, fixture.pair[0], revokePayload, "aal2", revokeCorrelation, revokeKey);
      expect(revoked).toMatchObject({ publicationId: replacement.publicationId, state: "revoked" });
      expect(await revoke(sql, fixture.pair[0], revokePayload, "aal2", revokeCorrelation, revokeKey)).toEqual({ ...revoked, outcomeCode: "replayed" });
    });
  }, 240_000);

  test("prepares an empty publication when every approved input is expired", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const dates = fixtureDates();
      await seedVendorOption(sql, fixture, 99, {
        capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        freshUntil: dates.expiredAt,
      });
      await expect(prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      })).resolves.toMatchObject({ state: "prepared", optionCount: 0 });
    });
  }, 240_000);

  test("serializes a newer publish before rejecting an older concurrent publish", async () => {
    const prepared = await context!.client.begin(async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const dates = fixtureDates();
      for (let index = 0; index < 6; index += 1) {
        await seedVendorOption(sql, fixture, index + 40, dates);
      }
      const payload = { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG };
      const older = await prepare(sql, fixture.pair[0], payload);
      const newer = await prepare(sql, fixture.pair[0], payload);
      return {
        intakeId,
        older: { publicationId: String(older.publicationId), inputDigest: String(older.inputDigest) },
        newer: { publicationId: String(newer.publicationId), inputDigest: String(newer.inputDigest) },
      };
    });
    const before = await publicationArtifacts(context!.client, prepared.older.publicationId);
    const release = deferred<void>();
    const holdingReady = deferred<SecurityTransaction>();
    const publishedReady = deferred<RpcResult>();
    const waitingReady = deferred<number>();
    void release.promise.catch(() => undefined);
    void holdingReady.promise.catch(() => undefined);
    void publishedReady.promise.catch(() => undefined);
    void waitingReady.promise.catch(() => undefined);

    const newerTransaction = context!.client.begin(async (sql) => {
      try {
        await sql`SET LOCAL statement_timeout = '10000ms'`;
        await sql`SELECT mmhr_private.r1_lock_security()`;
        holdingReady.resolve(sql);
        const result = await publish(sql, fixture.pair[0], {
          organizationId: fixture.organizationId, publicationId: prepared.newer.publicationId,
          expectedDigest: prepared.newer.inputDigest, approvalReference: "approval-concurrent-newer",
          reason: "Publish newer candidate",
        });
        publishedReady.resolve(result);
        await release.promise;
        return result;
      } catch (error) {
        holdingReady.reject(error);
        publishedReady.reject(error);
        throw error;
      }
    });
    void newerTransaction.catch(() => undefined);
    let olderTransaction: Promise<unknown> | undefined;
    try {
      await publishedReady.promise;
      olderTransaction = context!.client.begin(async (sql) => {
        try {
          await sql`SET LOCAL statement_timeout = '10000ms'`;
          const [backend] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::integer AS pid`;
          waitingReady.resolve(backend!.pid);
          return await publish(sql, fixture.pair[0], {
            organizationId: fixture.organizationId, publicationId: prepared.older.publicationId,
            expectedDigest: prepared.older.inputDigest, approvalReference: "approval-concurrent-older",
            reason: "Older publication must lose",
          });
        } catch (error) {
          waitingReady.reject(error);
          throw error;
        }
      });
      void olderTransaction.catch(() => undefined);
      await waitForGuardWait(await holdingReady.promise, await waitingReady.promise);
      release.resolve();
      await expect(newerTransaction).resolves.toMatchObject({ publicationId: prepared.newer.publicationId, state: "published" });
      await expect(olderTransaction).rejects.toMatchObject({ code: "42501" });
      expect(await publicationArtifacts(context!.client, prepared.older.publicationId)).toEqual(before);
    } finally {
      release.resolve();
      await newerTransaction.catch(() => undefined);
      if (olderTransaction) await olderTransaction.catch(() => undefined);
    }
  }, 240_000);

  test("rejects publishing when approved evidence changes after preparation", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const inputs: SeededInput[] = [];
      const dates = fixtureDates();
      for (let index = 0; index < 6; index += 1) inputs.push(await seedVendorOption(sql, fixture, index + 20, dates));
      const prepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = ${dates.expiredAt}::timestamptz WHERE id = ${inputs[0]!.evidenceId}::uuid`;
      await sql`UPDATE public.vendor_sources SET active = false WHERE id = ${inputs[0]!.sourceId}::uuid`;
      const before = await publicationArtifacts(sql, String(prepared.publicationId));
      await expect(publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: prepared.publicationId,
        expectedDigest: prepared.inputDigest, approvalReference: "approval-stale", reason: "Evidence changed",
      })).rejects.toMatchObject({ code: "42501" });
      expect(await publicationArtifacts(sql, String(prepared.publicationId))).toEqual(before);
    });
  }, 240_000);

  test("keeps the private SQL evaluator aligned with the TypeScript oracle", async () => {
    await rollbackCase(context!, async (sql) => {
      await assertEvaluationParity(sql);
    });
  }, 240_000);

  test("returns opt-in immutable estimates while preserving legacy reads and customer scope", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const estimate = { recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 100,
        includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: ["taxes"], oneTime: null };
      const costInput = await seedVendorOption(sql, fixture, 70, {
        fieldKey: "comparison_annual_cost", factValue: JSON.stringify(estimate),
      });
      await seedVendorOption(sql, fixture, 71);
      const prepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const payload = publicationPayload(fixture.organizationId, intakeId, String(prepared.publicationId), 0, 25);
      const legacy = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", payload));
      expect(legacy.options.every((option) => option.details === undefined)).toBe(true);
      const detailedPayload = { ...payload, detailsVersion: 1 };
      const detailed = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", detailedPayload));
      expect(detailed.options.map((option) => {
        const legacyOption = { ...option };
        delete legacyOption.details;
        return legacyOption;
      })).toEqual(legacy.options);
      const cost = detailed.options.find((option) => option.details?.annualCost !== null)?.details?.annualCost;
      expect(annualCostEstimateSchema.parse(cost)).toMatchObject({ ...estimate, evidence: { basis: "evidence", version: 1 } });
      expect(detailed.options.every((option) => option.details?.setup === null)).toBe(true);
      expect(JSON.stringify(detailed)).not.toMatch(/vendor\.example|productId|fact_id|content_hash|source_id|review_id/);
      await expect(readPublication(sql, customerContributor, "get", detailedPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => readPublication(probe, fixture.pair[0], "review", {
        ...payload, detailsVersion: 2,
      }))).rejects.toMatchObject({ code: "22023" });
      await publish(sql, fixture.pair[0], { organizationId: fixture.organizationId, publicationId: prepared.publicationId,
        expectedDigest: prepared.inputDigest, approvalReference: "synthetic-estimate-review", reason: "Review synthetic estimate projection" });
      const customer = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", detailedPayload, "aal1"));
      expect(customer.options).toEqual(detailed.options);
      const later = publicationReadSchema.parse(await readPublication(sql, customerContributor, "get", {
        ...detailedPayload, afterOrdinal: 1, limit: 1,
      }, "aal1"));
      expect(later.options).toEqual(customer.options.slice(1, 2));
      await expect(readPublication(sql, customerContributor, "get", {
        ...detailedPayload, organizationId: randomUUID(),
      }, "aal1")).rejects.toMatchObject({ code: "42501" });
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until=${fixtureDates().expiredAt}::timestamptz
        WHERE id=${costInput.evidenceId}::uuid`;
      await expect(readPublication(sql, customerContributor, "get", detailedPayload, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 240_000);

  test("rejects malformed or identity-bearing approved estimates before returning their values", async () => {
    await rollbackCase(context!, async (sql) => {
      const estimate = { recurring: { minimum: 12000, maximum: 18000 }, currency: "USD", employeeCount: 100,
        includedModules: ["hr", "payroll"], assumptions: ["annual_billing"], exclusions: [], oneTime: null };
      for (const value of [
        { ...estimate, sourceUrl: "https://vendor.example/quote" },
        { ...estimate, assumptions: ["Vendor-branded onboarding"] },
        { ...estimate, recurring: { minimum: -1, maximum: 10 } },
        { ...estimate, includedModules: ["payroll", "payroll"] },
      ]) {
        const input = { value: JSON.stringify(value) };
        await expect(sql.savepoint(async (probe) => {
          await probe`SELECT mmhr_private.r3_masked_estimate(${JSON.stringify(input)}::jsonb,'annual_cost')`;
        })).rejects.toMatchObject({ code: "22023" });
      }
      await expect(asAuthenticated(sql, customerContributor, async (probe) => {
        await probe`SELECT mmhr_private.r3_masked_estimate(NULL::jsonb,'annual_cost')`;
      }, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 240_000);

  test("projects separately approved delivery types without changing stored match results", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedVendorOption(sql, fixture, 72);
      const requirements = [{ key: REQUIREMENT_KEY, response: "yes" }];
      for (const coverage of ["native", "add_on", "partner", "limited", "not_supported", "unknown"]) {
        const coverageInput = { ...seeded.input, fact_id: randomUUID(), field_key: "comparison_feature_coverage",
          value: JSON.stringify({ [REQUIREMENT_KEY]: coverage }) };
        const [row] = await sql<{ result: unknown }[]>`SELECT mmhr_private.r3_masked_publication_details(
          ${JSON.stringify(CONFIG)}::jsonb, ${JSON.stringify(requirements)}::jsonb,
          ${JSON.stringify([seeded.input, coverageInput])}::jsonb,
          ${JSON.stringify({ fitReasons: [REQUIREMENT_KEY] })}::jsonb) AS result`;
        const result = maskedPublicationDetailsSchema.parse(row!.result);
        expect(result.features).toMatchObject([{ requirementKey: REQUIREMENT_KEY, outcome: "match", coverage,
          evidence: { basis: "evidence" }, coverageEvidence: { basis: "evidence" } }]);
        expect(result.annualCost).toBeNull();
      }
      const unsafeInput = { ...seeded.input, field_key: "comparison_feature_coverage",
        value: JSON.stringify({ [REQUIREMENT_KEY]: "Branded payroll" }) };
      await expect(sql.savepoint(async (probe) => {
        await probe`SELECT mmhr_private.r3_masked_publication_details(${JSON.stringify(CONFIG)}::jsonb,
          ${JSON.stringify(requirements)}::jsonb, ${JSON.stringify([unsafeInput])}::jsonb, '{"fitReasons":[]}'::jsonb)`;
      })).rejects.toMatchObject({ code: "22023" });
    });
  }, 240_000);

  test("format 2 uses stable product order without changing an earlier format 1 publication", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const lowProductId = `00000000${randomUUID().slice(8)}`;
      const highProductId = `ffffffff${randomUUID().slice(8)}`;
      const seededOptions = [await seedVendorOption(sql, fixture, 80, { productId: lowProductId, factValue: "no" }),
        await seedVendorOption(sql, fixture, 81, { productId: highProductId, factValue: "yes" })];
      for (const seeded of seededOptions) {
        const factId = randomUUID(), evidenceId = randomUUID();
        await sql`INSERT INTO public.vendor_facts (id,organization_id,vendor_profile_id,product_id,field_key,
          value,observed_at,status,created_by_identity_id)
          SELECT ${factId}::uuid,organization_id,vendor_profile_id,product_id,'comparison_fact_scopes',
            ${JSON.stringify({ [REQUIREMENT_KEY]: { version: 1, conditions: [] } })},observed_at,status,created_by_identity_id
          FROM public.vendor_facts WHERE id=${String(seeded.input.fact_id)}::uuid`;
        await sql`INSERT INTO public.vendor_evidence_versions (id,organization_id,fact_id,source_id,version,
          content_hash,captured_at,fresh_until,citation)
          SELECT ${evidenceId}::uuid,organization_id,${factId}::uuid,source_id,1,content_hash,captured_at,fresh_until,
            'Synthetic unrestricted scope for ordering test'
          FROM public.vendor_evidence_versions WHERE id=${seeded.evidenceId}::uuid`;
        await sql`INSERT INTO public.vendor_fact_reviews (id,organization_id,evidence_id,reviewer_identity_id,decision,decided_at,reason)
          SELECT ${randomUUID()}::uuid,organization_id,${evidenceId}::uuid,reviewer_identity_id,decision,decided_at,reason
          FROM public.vendor_fact_reviews WHERE id=${String(seeded.input.review_id)}::uuid`;
      }
      const beforeRejected = await sql`SELECT id FROM public.evaluation_publications
        WHERE intake_id=${intakeId}::uuid ORDER BY id`;
      for (const version of [1, 2]) {
        for (const factKey of ["commercial_relationship", "sponsorship", "advertising", "paid_placement", "partner_status"]) {
          await expect(prepare(sql, fixture.pair[0], {
            organizationId: fixture.organizationId, intakeId, expectedRevision: 2,
            configuration: { version, criteria: CONFIG.criteria.map((criterion) => ({ ...criterion, factKey })) },
          })).rejects.toMatchObject({ code: "22023" });
        }
      }
      expect(await sql`SELECT id FROM public.evaluation_publications
        WHERE intake_id=${intakeId}::uuid ORDER BY id`).toEqual(beforeRejected);
      const legacy = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const legacyPayload = publicationPayload(fixture.organizationId, intakeId, String(legacy.publicationId), 0, 25);
      const before = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", legacyPayload));
      const revised = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: { ...CONFIG, version: 2 },
      });
      for (const [publication, expected] of [[legacy, [highProductId, lowProductId]], [revised, [lowProductId, highProductId]]] as const) {
        const rows = await sql<{ product_id: string; deterministic_score: number }[]>`SELECT product_id,deterministic_score FROM public.evaluation_publication_options
          WHERE publication_id=${String(publication.publicationId)}::uuid ORDER BY ordinal`;
        const ids = rows.map((row) => row.product_id);
        expect(ids.filter((id) => id === highProductId || id === lowProductId)).toEqual(expected);
        expect(rows.find((row) => row.product_id === highProductId)?.deterministic_score).toBe(10000);
        expect(rows.find((row) => row.product_id === lowProductId)?.deterministic_score).toBe(0);
        if (publication === revised) expect(ids).toEqual([...ids].sort());
        expect(rows.length).toBe(before.optionCount);
      }
      const after = publicationReadSchema.parse(await readPublication(sql, fixture.pair[0], "review", legacyPayload));
      expect(after.options).toEqual(before.options);
    });
  }, 240_000);
});
