import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  initialEvaluationSelectionReadSchema,
  initialEvaluationSelectionResultSchema,
} from "@/server/commands/evaluation-selection";
import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createMembership,
  createSecurityPrincipal,
  deferred,
  rollbackCase,
  waitForGuardWait,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  CONFIG,
  addContributor,
  addPortalGrant,
  createCommandFixture,
  expectAppendOnlyFailure,
  fixtureDates,
  prepare,
  publish,
  publicationPayload,
  readPublication,
  revoke,
  seedSubmittedIntake,
  seedVendorOption,
} from "./r3-evaluation-publication-fixtures";

type RpcResult = Record<string, unknown>;

async function selectInitial(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: unknown,
  assurance: "aal1" | "aal2" = "aal1",
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_select_initial_evaluation_options(
        ${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function readInitial(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string, intakeId: string) {
  return readInitialPayload(sql, principal, { organizationId, intakeId });
}

async function readInitialPayload(sql: SecurityTransaction, principal: SecurityPrincipal, payload: unknown) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_get_initial_evaluation_selections(
        ${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid
      ) AS result
    `;
    return row!.result;
  }, "aal1");
}

async function selectionArtifacts(sql: SecurityTransaction, intakeId: string) {
  const [row] = await sql<{ selections: number; candidates: number; masks: number; items: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.evaluation_initial_selections WHERE intake_id = ${intakeId}::uuid) AS selections,
      (SELECT count(*)::integer FROM public.evaluation_candidates WHERE intake_id = ${intakeId}::uuid AND source = 'initial') AS candidates,
      (SELECT count(*)::integer FROM public.evaluation_candidate_masks WHERE candidate_id IN (SELECT id FROM public.evaluation_candidates WHERE intake_id = ${intakeId}::uuid AND source = 'initial')) AS masks,
      (SELECT count(*)::integer FROM public.evaluation_initial_selection_items WHERE intake_id = ${intakeId}::uuid) AS items,
      (SELECT count(*)::integer FROM public.audit_events WHERE entity_id IN (SELECT id::text FROM public.evaluation_initial_selections WHERE intake_id = ${intakeId}::uuid)) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts WHERE entity_id IN (SELECT id FROM public.evaluation_initial_selections WHERE intake_id = ${intakeId}::uuid)) AS receipts
  `;
  return row!;
}

async function seedPublishedSelectionFixture(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  customer: SecurityPrincipal,
  options: { variedEligibility?: boolean } = {},
) {
  const intakeId = await seedSubmittedIntake(sql, fixture, customer);
  const dates = fixtureDates();
  const inputs = [];
  for (let index = 0; index < 6; index += 1) {
    const option = options.variedEligibility && index === 1
      ? { factValue: "no" }
      : options.variedEligibility && index === 2
        ? { fieldKey: "other_fact" }
        : {};
    inputs.push(await seedVendorOption(sql, fixture, index + 1, { ...dates, ...option }));
  }
  const prepared = await prepare(sql, fixture.pair[0], {
    organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG,
  });
  const publicationId = String(prepared.publicationId);
  const published = await publish(sql, fixture.pair[0], {
    organizationId: fixture.organizationId, publicationId,
    expectedDigest: prepared.inputDigest, approvalReference: "selection-fixture", reason: "Selection fixture publication",
  });
  const page = await readPublication(sql, fixture.pair[0], "review", publicationPayload(
    fixture.organizationId, intakeId, publicationId, 0, 50,
  ));
  return { intakeId, inputs, prepared, published, page: page as RpcResult, publicationId };
}

async function addLegacyInitialCandidate(sql: SecurityTransaction, fixture: SecurityCommandFixture, intakeId: string, productId: string) {
  const [product] = await sql<{ organization_id: string }[]>`
    SELECT organization_id FROM public.products WHERE id = ${productId}::uuid
  `;
  const candidateId = randomUUID();
  await sql`
    INSERT INTO public.evaluation_candidates (
      id, organization_id, intake_id, product_id, vendor_organization_id, source, state,
      eligibility, deterministic_score, scoring_configuration_version, fit_reasons, limitations,
      created_by_identity_id, updated_by_identity_id, revision, correlation_id
    ) VALUES (
      ${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid, ${productId}::uuid,
      ${product!.organization_id}::uuid, 'initial', 'proposed', 'unknown', NULL, NULL, '[]'::jsonb, '[]'::jsonb,
      ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid, 1, ${randomUUID()}::uuid
    )
  `;
  return { candidateId };
}

async function archiveCandidate(sql: SecurityTransaction, fixture: SecurityCommandFixture, candidateId: string) {
  return asAuthenticated(sql, fixture.pair[0], async (probe) => {
    const payload = {
      candidateId, organizationId: fixture.organizationId, fromState: "proposed", toState: "archived",
      expectedRevision: 1, actorIdentityId: fixture.pair[0].identityId, approvalReference: null,
    };
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_transition_evaluation_candidate(
        ${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid
      ) AS result
    `;
    return row!.result;
  }, "aal2");
}

describe("R3 initial customer selection RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;
  let viewer: SecurityPrincipal;

  beforeAll(async () => {
    context = await startRehearsal("r3-initial-selection");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const value = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      await addContributor(sql, value.organizationId, customerContributor);
      await addPortalGrant(sql, value.organizationId, value.pair[1].identityId);
      viewer = await createSecurityPrincipal(sql);
      await createMembership(sql, value.organizationId, viewer, "viewer");
      return value;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("selects noncontiguous options, preserves all eligibility states, and parses the exact public shape", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor, { variedEligibility: true });
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(
        fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50,
      ))) as { options: Array<Record<string, unknown>> };
      expect(new Set(publication.options.map((option) => option.eligibility))).toEqual(new Set(["eligible", "ineligible", "unknown"]));
      const optionIds = (["eligible", "ineligible", "unknown"] as const).map((eligibility) => {
        const option = publication.options.find((candidate) => candidate.eligibility === eligibility);
        expect(option).toBeDefined();
        return String(option!.optionId);
      });
      const selection = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, {
        organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest, optionIds,
      }));
      expect(selection).toMatchObject({ organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId, selectedCount: 3, initialCandidateCount: 3, outcomeCode: "created" });
      expect(selection.items.map((item) => item.optionId)).toEqual(optionIds);
      expect(selection.items.every((item) => item.maskedLabel === `Option ${item.ordinal}`)).toBe(true);
      const read = initialEvaluationSelectionReadSchema.parse(await readInitial(sql, customerContributor, fixture.organizationId, seeded.intakeId));
      expect(read).toMatchObject({ organizationId: fixture.organizationId, intakeId: seeded.intakeId, initialCandidateCount: 3, remainingInitialChoices: 2 });
      expect(read.items).toHaveLength(3);
      const candidates = await sql<{ source: string; state: string; eligibility: string; scoring_configuration_version: number }[]>`
        SELECT source, state, eligibility, scoring_configuration_version
        FROM public.evaluation_candidates WHERE organization_id = ${fixture.organizationId}::uuid AND intake_id = ${seeded.intakeId}::uuid
      `;
      expect(candidates).toHaveLength(3);
      expect(candidates.every((candidate) => candidate.source === "initial" && candidate.state === "proposed" && candidate.scoring_configuration_version === 1)).toBe(true);
      expect(new Set(candidates.map((candidate) => candidate.eligibility))).toEqual(new Set(["eligible", "ineligible", "unknown"]));
      const [privileges] = await sql<{ anon: boolean; authenticated: boolean }[]>`
        SELECT
          has_function_privilege('anon', 'public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid)', 'EXECUTE') AS anon,
          has_function_privilege('authenticated', 'public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid)', 'EXECUTE') AS authenticated
      `;
      expect(privileges).toEqual({ anon: false, authenticated: true });
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`SELECT count(*) FROM public.evaluation_initial_selections`)).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => probe`
        INSERT INTO public.evaluation_initial_selection_items
          (organization_id, intake_id, publication_id, selection_id, option_id, candidate_id, position)
        VALUES (
          ${fixture.organizationId}::uuid, ${seeded.intakeId}::uuid, ${seeded.publicationId}::uuid,
          ${selection.selectionId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, 4
        )
      `)).rejects.toMatchObject({ code: "23503" });
      await expectAppendOnlyFailure(sql, (probe) => probe`UPDATE public.evaluation_initial_selections SET selected_count = selected_count WHERE organization_id = ${fixture.organizationId}::uuid`);
      await expectAppendOnlyFailure(sql, (probe) => probe`DELETE FROM public.evaluation_initial_selection_items WHERE organization_id = ${fixture.organizationId}::uuid`);
    });
  }, 240_000);

  test("rejects null, scalar, array, and wrong option types before structural inspection", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(
        fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50,
      ))) as { options: Array<Record<string, unknown>> };
      const valid = {
        organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest, optionIds: [String(publication.options[0]!.optionId)],
      };
      for (const malformed of [null, 1, [], { ...valid, optionIds: "not-an-array" }, { ...valid, optionIds: [123] }, { ...valid, optionIds: [null] }] as unknown[]) {
        await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, malformed))).rejects.toMatchObject({ code: "22023" });
      }
      for (const malformed of [null, 1, [], { organizationId: fixture.organizationId }, { organizationId: fixture.organizationId, intakeId: seeded.intakeId, extra: true }] as unknown[]) {
        await expect(sql.savepoint((probe) => readInitialPayload(probe, customerContributor, malformed))).rejects.toMatchObject({ code: "22023" });
      }
    });
  }, 240_000);

  test("replays the exact receipt, rejects altered payloads, and rolls back failed writes", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50))) as { options: Array<Record<string, unknown>> };
      const input = { organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId, expectedDigest: String(seeded.prepared.inputDigest), optionIds: [String(publication.options[1]!.optionId), String(publication.options[4]!.optionId)] };
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const created = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, input, "aal1", correlationId, idempotencyKey));
      const replayed = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, input, "aal1", correlationId, idempotencyKey));
      expect(replayed).toEqual({ ...created, correlationId, outcomeCode: "replayed" });
      const [exactArtifacts] = await sql<{ audits: number; receipts: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.audit_events WHERE entity_id = ${created.selectionId}) AS audits,
          (SELECT count(*)::integer FROM public.security_command_receipts WHERE entity_id = ${created.selectionId}::uuid) AS receipts
      `;
      expect(exactArtifacts).toEqual({ audits: 1, receipts: 1 });
      const before = await selectionArtifacts(sql, seeded.intakeId);
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, { ...input, expectedDigest: "f".repeat(64) }, "aal1", correlationId, idempotencyKey))).rejects.toMatchObject({ code: "42501" });
      expect(await selectionArtifacts(sql, seeded.intakeId)).toEqual(before);
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r3_initial_selection_audit_failure CHECK (false) NOT VALID`;
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, {
        ...input, optionIds: [String(publication.options[2]!.optionId), String(publication.options[5]!.optionId)],
      }))).rejects.toMatchObject({ code: "23514", constraint_name: "r3_initial_selection_audit_failure" });
      expect(await selectionArtifacts(sql, seeded.intakeId)).toEqual(before);
      await sql`ALTER TABLE public.audit_events DROP CONSTRAINT r3_initial_selection_audit_failure`;
      const second = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, {
        ...input, optionIds: [String(publication.options[2]!.optionId), String(publication.options[5]!.optionId)],
      }));
      expect(second.initialCandidateCount).toBe(4);
      const firstReplayAfterSecond = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, input, "aal1", correlationId, idempotencyKey));
      expect(firstReplayAfterSecond.initialCandidateCount).toBe(created.initialCandidateCount);
    });
  }, 240_000);

  test("counts archived and legacy initial candidates toward the five-choice cap", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50))) as { options: Array<Record<string, unknown>> };
      const [legacyOption] = await sql<{ product_id: string }[]>`
        SELECT product_id FROM public.evaluation_publication_options
        WHERE publication_id = ${seeded.publicationId}::uuid ORDER BY ordinal LIMIT 1
      `;
      const legacy = await addLegacyInitialCandidate(sql, fixture, seeded.intakeId, legacyOption!.product_id);
      await archiveCandidate(sql, fixture, String(legacy.candidateId));
      const first = initialEvaluationSelectionResultSchema.parse(await selectInitial(sql, customerContributor, {
        organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest, optionIds: publication.options.slice(1, 5).map((option) => String(option.optionId)),
      }));
      expect(first.initialCandidateCount).toBe(5);
      const read = initialEvaluationSelectionReadSchema.parse(await readInitial(sql, customerContributor, fixture.organizationId, seeded.intakeId));
      expect(read.initialCandidateCount).toBe(5);
      expect(read.items).toHaveLength(4);
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, {
        organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest, optionIds: [String(publication.options[5]!.optionId)],
      }))).rejects.toMatchObject({ code: "42501" });
      const [archived] = await sql<{ state: string }[]>`SELECT state FROM public.evaluation_candidates WHERE id = ${String(legacy.candidateId)}::uuid`;
      expect(archived!.state).toBe("archived");
    });
  }, 240_000);

  test("rejects unpublished, stale, revoked, replaced, and cross-scope publications", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedSubmittedIntake(sql, fixture, customerContributor);
      const dates = fixtureDates();
      const input = await seedVendorOption(sql, fixture, 700, dates);
      const prepared = await prepare(sql, fixture.pair[0], { organizationId: fixture.organizationId, intakeId, expectedRevision: 2, configuration: CONFIG });
      const publicationId = String(prepared.publicationId);
      const option = await sql<{ id: string }[]>`SELECT id FROM public.evaluation_publication_options WHERE publication_id = ${publicationId}::uuid ORDER BY ordinal LIMIT 1`;
      const payload = { organizationId: fixture.organizationId, intakeId, publicationId, expectedDigest: prepared.inputDigest, optionIds: [option[0]!.id] };
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, payload))).rejects.toMatchObject({ code: "42501" });
      const published = await publish(sql, fixture.pair[0], { organizationId: fixture.organizationId, publicationId, expectedDigest: prepared.inputDigest, approvalReference: "selection-state", reason: "Publish selection state" });
      await expect(sql.savepoint((probe) => selectInitial(probe, viewer, payload))).rejects.toMatchObject({ code: "42501" });
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = ${dates.expiredAt}::timestamptz WHERE id = ${input.evidenceId}::uuid`;
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, payload))).rejects.toMatchObject({ code: "42501" });
      await sql`UPDATE public.vendor_evidence_versions SET fresh_until = ${dates.freshUntil}::timestamptz WHERE id = ${input.evidenceId}::uuid`;
      const revoked = await revoke(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId,
        reason: "Revoke selection fixture",
      });
      expect(revoked).toBeDefined();
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, payload))).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, { ...payload, organizationId: randomUUID() }))).rejects.toMatchObject({ code: "42501" });
      expect(published.publicationId).toBe(publicationId);

      const replacement = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const replacementPrepared = await prepare(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, intakeId: replacement.intakeId, expectedRevision: 2, configuration: CONFIG,
      });
      const oldPublication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(
        fixture.organizationId, replacement.intakeId, replacement.publicationId, 0, 50,
      ))) as { options: Array<Record<string, unknown>> };
      const replacementPublished = await publish(sql, fixture.pair[0], {
        organizationId: fixture.organizationId, publicationId: String(replacementPrepared.publicationId),
        expectedDigest: replacementPrepared.inputDigest, approvalReference: "selection-replacement", reason: "Replace selection publication",
      });
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, {
        organizationId: fixture.organizationId, intakeId: replacement.intakeId, publicationId: replacement.publicationId,
        expectedDigest: replacement.prepared.inputDigest, optionIds: [String(oldPublication.options[0]!.optionId)],
      }))).rejects.toMatchObject({ code: "42501" });
      const currentPublication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(
        fixture.organizationId, replacement.intakeId, String(replacementPrepared.publicationId), 0, 50,
      ))) as { options: Array<Record<string, unknown>> };
      await expect(selectInitial(sql, customerContributor, {
        organizationId: fixture.organizationId, intakeId: replacement.intakeId,
        publicationId: String(replacementPublished.publicationId), expectedDigest: replacementPrepared.inputDigest,
        optionIds: [String(currentPublication.options[0]!.optionId)],
      })).resolves.toMatchObject({ outcomeCode: "created" });
    });
  }, 240_000);

  test("denies selection after customer portal grant revocation", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50))) as { options: Array<Record<string, unknown>> };
      const grant = await sql<{ id: string }[]>`SELECT id FROM public.portal_access_grants WHERE organization_id = ${fixture.organizationId}::uuid AND portal = 'customer' AND state = 'active' ORDER BY created_at DESC LIMIT 1`;
      await asAuthenticated(sql, fixture.pair[0], (probe) => probe`SELECT public.mmhr_revoke_portal_access(${fixture.organizationId}::uuid, ${grant[0]!.id}::uuid, 'Selection grant revoked', ${randomUUID()}::uuid, ${randomUUID()}::uuid)`, "aal2");
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, {
        organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest, optionIds: [String(publication.options[0]!.optionId)],
      }))).rejects.toMatchObject({ code: "42501" });
    });
  }, 240_000);

  test("denies selection when the intake is not submitted", async () => {
    await rollbackCase(context!, async (sql) => {
      const seeded = await seedPublishedSelectionFixture(sql, fixture, customerContributor);
      const publication = (await readPublication(sql, fixture.pair[0], "review", publicationPayload(
        fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50,
      ))) as { options: Array<Record<string, unknown>> };
      await sql`
        UPDATE public.intakes
        SET status = 'in_progress'
        WHERE organization_id = ${fixture.organizationId}::uuid AND id = ${seeded.intakeId}::uuid
      `;
      await expect(sql.savepoint((probe) => selectInitial(probe, customerContributor, {
        organizationId: fixture.organizationId,
        intakeId: seeded.intakeId,
        publicationId: seeded.publicationId,
        expectedDigest: seeded.prepared.inputDigest,
        optionIds: [String(publication.options[0]!.optionId)],
      }))).rejects.toMatchObject({ code: "42501" });
    });
  }, 240_000);

  test("serializes competing selections and enforces the cap after the first commit", async () => {
    const seeded = await context!.client.begin(async (sql) => seedPublishedSelectionFixture(sql, fixture, customerContributor));
    const publication = await context!.client.begin(async (sql) => readPublication(sql, fixture.pair[0], "review", publicationPayload(fixture.organizationId, seeded.intakeId, seeded.publicationId, 0, 50))) as { options: Array<Record<string, unknown>> };
    const firstRelease = deferred<void>();
    const firstReady = deferred<RpcResult>();
    const firstHolding = deferred<SecurityTransaction>();
    const secondReady = deferred<number>();
    void firstRelease.promise.catch(() => undefined);
    void firstReady.promise.catch(() => undefined);
    void firstHolding.promise.catch(() => undefined);
    void secondReady.promise.catch(() => undefined);
    const firstTransaction = context!.client.begin(async (sql) => {
      try {
        const result = await selectInitial(sql, customerContributor, {
          organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
          expectedDigest: seeded.prepared.inputDigest, optionIds: publication.options.slice(0, 3).map((option) => String(option.optionId)),
        });
        firstHolding.resolve(sql);
        firstReady.resolve(result);
        await firstRelease.promise;
        return result;
      } catch (error) {
        firstHolding.reject(error);
        firstReady.reject(error);
        throw error;
      }
    });
    void firstTransaction.catch(() => undefined);
    let secondTransaction: Promise<unknown> | undefined;
    try {
      await firstReady.promise;
      secondTransaction = context!.client.begin(async (sql) => {
        try {
          const [backend] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::integer AS pid`;
          secondReady.resolve(backend!.pid);
          return await selectInitial(sql, customerContributor, {
            organizationId: fixture.organizationId, intakeId: seeded.intakeId, publicationId: seeded.publicationId,
            expectedDigest: seeded.prepared.inputDigest, optionIds: publication.options.slice(3, 6).map((option) => String(option.optionId)),
          });
        } catch (error) {
          secondReady.reject(error);
          throw error;
        }
      });
      void secondTransaction.catch(() => undefined);
      await waitForGuardWait(await firstHolding.promise, await secondReady.promise);
      firstRelease.resolve();
      await expect(firstTransaction).resolves.toMatchObject({ selectedCount: 3 });
      await expect(secondTransaction).rejects.toMatchObject({ code: "42501" });
    } finally {
      firstRelease.resolve();
      await firstTransaction.catch(() => undefined);
      if (secondTransaction) await secondTransaction.catch(() => undefined);
    }
  }, 240_000);
});
