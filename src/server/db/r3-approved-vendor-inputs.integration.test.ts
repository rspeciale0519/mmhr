import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  type SecurityCommandFixture,
  type SecuritySql,
} from "./r1-security-command-fixtures";

const AS_OF = "2026-09-10T00:00:00.000Z";
const BEFORE = "2026-09-09T00:00:00.000Z";
const AFTER = "2026-09-11T00:00:00.000Z";
const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type ResolverRow = {
  fact_id: string;
  field_key: string;
  value: string;
  provenance: string;
  evidence_id: string | null;
  source_id: string | null;
  review_id: string | null;
  evidence_version: number | null;
  content_hash: string | null;
  observed_at: string;
  captured_at: string;
  valid_until: string;
  override_id: string | null;
  approved_at: string;
};

type InputCase = {
  productId: string;
  profileId: string;
  sourceId: string;
  factId: string;
};

type EvidenceSpec = {
  version: number;
  capturedAt?: string;
  freshUntil?: string;
  decision?: "approved" | "rejected";
  decidedAt?: string;
};

type OverrideSpec = {
  value: string;
  approvedAt: string;
  expiresAt: string;
  sourceId?: string;
};

describe("R3 approved vendor input resolver and matching consumption", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let vendorOrganizationId: string;
  let vendorProfileId: string;

  beforeAll(async () => {
    context = await startRehearsal("r3-approved-inputs");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    const [organization] = await context.client<{ id: string }[]>`
      INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
      VALUES (${`Approved input vendor ${randomUUID()}`}, 'vendor', 'active', ${BEFORE}::timestamptz, false)
      RETURNING id
    `;
    vendorOrganizationId = organization!.id;
    const [profile] = await context.client<{ id: string }[]>`
      INSERT INTO public.vendor_profiles (
        organization_id, status, approved_at, approved_by_identity_id,
        created_by_identity_id, updated_by_identity_id
      ) VALUES (
        ${vendorOrganizationId}::uuid, 'active', ${BEFORE}::timestamptz,
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid,
        ${fixture.pair[0].identityId}::uuid
      ) RETURNING id
    `;
    vendorProfileId = profile!.id;
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  async function createInputCase(
    sql: SecuritySql,
    key: string,
    options: {
      factStatus?: "draft" | "published" | "archived";
      observedAt?: string;
      sourceActive?: boolean;
      sourceCapturedAt?: string;
      evidence?: EvidenceSpec[];
      overrides?: OverrideSpec[];
    } = {},
  ): Promise<InputCase> {
    const profileId = vendorProfileId;
    const productId = randomUUID();
    const sourceId = randomUUID();
    const factId = randomUUID();
    await sql`
      INSERT INTO public.products (
        id, organization_id, vendor_profile_id, stable_key, name, status,
        created_by_identity_id, updated_by_identity_id
      ) VALUES (
        ${productId}::uuid, ${vendorOrganizationId}::uuid, ${profileId}::uuid,
        ${`approved_${key}_${productId.slice(0, 8)}`}, ${`Approved ${key}`}, 'active',
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
      )
    `;
    await sql`
      INSERT INTO public.vendor_sources (
        id, organization_id, vendor_profile_id, uri, source_type, captured_at,
        active, created_by_identity_id
      ) VALUES (
        ${sourceId}::uuid, ${vendorOrganizationId}::uuid, ${profileId}::uuid,
        ${`https://vendor.example.test/${key}`}, 'manual',
        ${(options.sourceCapturedAt ?? BEFORE)}::timestamptz,
        ${options.sourceActive ?? true}, ${fixture.pair[0].identityId}::uuid
      )
    `;
    await sql`
      INSERT INTO public.vendor_facts (
        id, organization_id, vendor_profile_id, product_id, field_key, value,
        observed_at, status, created_by_identity_id
      ) VALUES (
        ${factId}::uuid, ${vendorOrganizationId}::uuid, ${profileId}::uuid,
        ${productId}::uuid, ${`input_${key}`}, ${`value_${key}`},
        ${(options.observedAt ?? BEFORE)}::timestamptz,
        ${(options.factStatus ?? "published")}, ${fixture.pair[0].identityId}::uuid
      )
    `;
    for (const evidence of options.evidence ?? []) {
      const evidenceId = randomUUID();
      const contentHash = `${HASH.slice(0, 63)}${evidence.version}`;
      await sql`
        INSERT INTO public.vendor_evidence_versions (
          id, organization_id, fact_id, source_id, version, content_hash,
          captured_at, fresh_until, citation
        ) VALUES (
          ${evidenceId}::uuid, ${vendorOrganizationId}::uuid, ${factId}::uuid,
          ${sourceId}::uuid, ${evidence.version}, ${contentHash},
          ${(evidence.capturedAt ?? BEFORE)}::timestamptz,
          ${(evidence.freshUntil ?? AFTER)}::timestamptz,
          ${`evidence ${key} ${evidence.version}`}
        )
      `;
      if (evidence.decision) {
        await sql`
          INSERT INTO public.vendor_fact_reviews (
            id, organization_id, evidence_id, reviewer_identity_id, decision,
            decided_at, reason
          ) VALUES (
            ${randomUUID()}::uuid, ${vendorOrganizationId}::uuid, ${evidenceId}::uuid,
            ${fixture.pair[0].identityId}::uuid, ${evidence.decision},
            ${(evidence.decidedAt ?? BEFORE)}::timestamptz, ${`review ${key}`}
          )
        `;
      }
    }
    for (const override of options.overrides ?? []) {
      await sql`
        INSERT INTO public.vendor_fact_overrides (
          id, organization_id, fact_id, source_id, value, approved_by_identity_id,
          approved_at, expires_at, reason
        ) VALUES (
          ${randomUUID()}::uuid, ${vendorOrganizationId}::uuid, ${factId}::uuid,
          ${(override.sourceId ?? sourceId)}::uuid, ${override.value},
          ${fixture.pair[0].identityId}::uuid, ${override.approvedAt}::timestamptz,
          ${override.expiresAt}::timestamptz, ${`override ${key}`}
        )
      `;
    }
    return { productId, profileId, sourceId, factId };
  }

  async function resolve(sql: SecuritySql, productId: string, asOf = AS_OF) {
    return sql<ResolverRow[]>`
      SELECT * FROM mmhr_private.r3_approved_vendor_inputs(
        ${vendorOrganizationId}::uuid, ${productId}::uuid, ${asOf}::timestamptz
      ) ORDER BY field_key
    `;
  }

  test("requires approval, latest evidence, source scope, and current time bounds", async () => {
    await context!.client.begin(async (sql) => {
      const valid = await createInputCase(sql, "valid", {
        evidence: [{ version: 1, decision: "approved" }],
      });
      const latest = await createInputCase(sql, "latest", {
        evidence: [
          { version: 1, decision: "approved" },
          { version: 2, decision: "approved" },
        ],
      });
      const rejectedLatest = await createInputCase(sql, "rejected_latest", {
        evidence: [
          { version: 1, decision: "approved" },
          { version: 2, decision: "rejected" },
        ],
      });
      const unapproved = await createInputCase(sql, "unapproved", {
        evidence: [{ version: 1 }],
      });
      const stale = await createInputCase(sql, "stale", {
        evidence: [{ version: 1, decision: "approved", freshUntil: BEFORE }],
      });
      const staleLatest = await createInputCase(sql, "stale_latest", {
        evidence: [{ version: 1, decision: "approved" },
          { version: 2, decision: "approved", freshUntil: AS_OF }],
      });
      const pendingLatest = await createInputCase(sql, "pending_latest", {
        evidence: [{ version: 1, decision: "approved" }, { version: 2 }],
      });
      const futureApproval = await createInputCase(sql, "future_approval", {
        evidence: [{ version: 1, decision: "approved", decidedAt: AFTER }],
      });
      const draft = await createInputCase(sql, "draft", {
        factStatus: "draft", evidence: [{ version: 1, decision: "approved" }],
      });
      const future = await createInputCase(sql, "future", {
        observedAt: AFTER,
        evidence: [{ version: 1, decision: "approved", capturedAt: AFTER }],
      });
      const sourceFuture = await createInputCase(sql, "source_future", {
        sourceCapturedAt: AFTER,
        evidence: [{ version: 1, decision: "approved" }],
      });
      const archived = await createInputCase(sql, "archived", {
        factStatus: "archived",
        evidence: [{ version: 1, decision: "approved" }],
      });
      const rows = await Promise.all([
        resolve(sql, valid.productId),
        resolve(sql, latest.productId),
        resolve(sql, rejectedLatest.productId),
        resolve(sql, unapproved.productId),
        resolve(sql, stale.productId),
        resolve(sql, future.productId),
        resolve(sql, sourceFuture.productId),
        resolve(sql, archived.productId),
        resolve(sql, staleLatest.productId),
        resolve(sql, pendingLatest.productId),
        resolve(sql, futureApproval.productId),
        resolve(sql, draft.productId),
      ]);
      expect(rows[0]).toHaveLength(1);
      expect(rows[0]![0]).toMatchObject({
        fact_id: valid.factId,
        field_key: "input_valid",
        value: "value_valid",
        provenance: "evidence",
        evidence_version: 1,
      });
      expect(rows[1]![0]).toMatchObject({ fact_id: latest.factId, evidence_version: 2 });
      expect(rows.slice(2).every((result) => result.length === 0)).toBe(true);
    });
  }, 120_000);

  test("prefers valid overrides and never falls back after the newest override expires or loses scope", async () => {
    await context!.client.begin(async (sql) => {
      const override = await createInputCase(sql, "override", {
        evidence: [{ version: 1, decision: "approved" }],
        overrides: [{ value: "override_value", approvedAt: BEFORE, expiresAt: AFTER }],
      });
      const draftOverride = await createInputCase(sql, "draft_override", {
        factStatus: "draft",
        overrides: [{ value: "reviewed_override", approvedAt: BEFORE, expiresAt: AFTER }],
      });
      const archivedOverride = await createInputCase(sql, "archived_override", {
        factStatus: "archived",
        overrides: [{ value: "archived_override", approvedAt: BEFORE, expiresAt: AFTER }],
      });
      const expired = await createInputCase(sql, "expired", {
        evidence: [{ version: 1, decision: "approved" }],
        overrides: [
          { value: "earlier_value", approvedAt: BEFORE, expiresAt: AFTER },
          { value: "newest_expired", approvedAt: AS_OF, expiresAt: AS_OF },
        ],
      });
      const inactiveSource = await createInputCase(sql, "inactive_source", {
        evidence: [{ version: 1, decision: "approved" }],
        overrides: [{ value: "ignored_value", approvedAt: BEFORE, expiresAt: AFTER }],
      });
      await sql`
        UPDATE public.vendor_sources SET active = false
        WHERE organization_id = ${vendorOrganizationId}::uuid AND id = ${inactiveSource.sourceId}::uuid
      `;
      const wrongSource = await createInputCase(sql, "wrong_source", {
        evidence: [{ version: 1, decision: "approved" }],
        overrides: [{ value: "earlier_wrong_scope", approvedAt: BEFORE, expiresAt: AFTER }],
      });
      await sql`
        INSERT INTO public.vendor_fact_overrides (
          id, organization_id, fact_id, source_id, value, approved_by_identity_id,
          approved_at, expires_at, reason
        ) VALUES (
          ${randomUUID()}::uuid, ${vendorOrganizationId}::uuid, ${wrongSource.factId}::uuid,
          NULL, 'newest_wrong_scope', ${fixture.pair[0].identityId}::uuid,
          ${AS_OF}::timestamptz, ${AFTER}::timestamptz, 'newest wrong source scope'
        )
      `;
      const preferred = await resolve(sql, override.productId);
      const expiredRows = await resolve(sql, expired.productId);
      const inactiveRows = await resolve(sql, inactiveSource.productId);
      const wrongSourceRows = await resolve(sql, wrongSource.productId);
      expect(preferred).toMatchObject([{
        fact_id: override.factId,
        value: "override_value",
        provenance: "override",
        override_id: expect.any(String),
        evidence_id: null,
      }]);
      expect(expiredRows).toMatchObject([{ fact_id: expired.factId, provenance: "evidence" }]);
      expect(expiredRows[0]).not.toHaveProperty("value", "earlier_value");
      expect(inactiveRows).toEqual([]);
      expect(wrongSourceRows).toMatchObject([{ fact_id: wrongSource.factId, provenance: "evidence" }]);
      expect(wrongSourceRows[0]).not.toHaveProperty("value", "earlier_wrong_scope");
      expect(await resolve(sql, draftOverride.productId)).toMatchObject([
        { fact_id: draftOverride.factId, value: "reviewed_override", provenance: "override" },
      ]);
      expect(await resolve(sql, archivedOverride.productId)).toEqual([]);
    });
  }, 120_000);

  test("binds exact vendor and product scope and denies direct helper calls to authenticated roles", async () => {
    await context!.client.begin(async (sql) => {
      const valid = await createInputCase(sql, "scope", {
        evidence: [{ version: 1, decision: "approved" }],
      });
      const [otherOrganization] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES (${`Other vendor ${randomUUID()}`}, 'vendor', 'active', ${BEFORE}::timestamptz, false)
        RETURNING id
      `;
      const [otherProfile] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, approved_at, approved_by_identity_id)
        VALUES (${otherOrganization!.id}::uuid, 'active', ${BEFORE}::timestamptz, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      const [otherProduct] = await sql<{ id: string }[]>`
        INSERT INTO public.products (organization_id, vendor_profile_id, stable_key, name, status)
        VALUES (${otherOrganization!.id}::uuid, ${otherProfile!.id}::uuid, 'other_scope_product', 'Other scope product', 'active')
        RETURNING id
      `;
      await expect(resolve(sql, otherProduct!.id)).resolves.toEqual([]);
      for (const role of ["anon", "authenticated", "service_role", "mmhr_worker"]) {
        const [privilege] = await sql<{ allowed: boolean }[]>`
          SELECT has_function_privilege(${role},
            'mmhr_private.r3_approved_vendor_inputs(uuid,uuid,timestamptz)', 'EXECUTE') AS allowed
        `;
        expect(privilege!.allowed).toBe(false);
      }
      for (const principal of [fixture.pair[0], fixture.target]) {
        await expect(asAuthenticated(sql, principal, async (probe) => probe`
          SELECT * FROM mmhr_private.r3_approved_vendor_inputs(
            ${vendorOrganizationId}::uuid, ${valid.productId}::uuid, ${AS_OF}::timestamptz
          )
        `)).rejects.toMatchObject({ code: "42501" });
      }
      await sql`UPDATE public.vendor_profiles SET status = 'paused' WHERE id = ${vendorProfileId}::uuid`;
      expect(await resolve(sql, valid.productId)).toEqual([]);
      await sql`UPDATE public.vendor_profiles SET status = 'active' WHERE id = ${vendorProfileId}::uuid`;
      expect(await resolve(sql, valid.productId)).toHaveLength(1);
    });
  }, 120_000);

  test("uses approved inputs in matching, stores private provenance, and replays the old snapshot", async () => {
    await context!.client.begin(async (sql) => {
      const intakeId = randomUUID();
      const ruleSetId = randomUUID();
      const candidateId = randomUUID();
      const liveCapture = new Date(Date.now() - 60_000).toISOString();
      const liveExpiry = new Date(Date.now() + 86_400_000).toISOString();
      const input = await createInputCase(sql, "payroll", {
        observedAt: liveCapture,
        sourceCapturedAt: liveCapture,
        evidence: [{ version: 1, capturedAt: liveCapture, freshUntil: liveExpiry }],
      });
      await sql`
        INSERT INTO public.intakes (id, organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id)
        VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', clock_timestamp(),
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
      `;
      await sql`
        INSERT INTO public.intake_requirements (
          organization_id, intake_id, stable_key, label, importance, weight, response,
          created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${fixture.organizationId}::uuid, ${intakeId}::uuid, 'input_payroll', 'Payroll', 'must', 100,
          '"value_payroll"'::jsonb, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      await sql`
        INSERT INTO public.evaluation_candidates (
          id, organization_id, intake_id, product_id, vendor_organization_id,
          created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${candidateId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid,
          ${input.productId}::uuid, ${vendorOrganizationId}::uuid,
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      await sql`
        INSERT INTO public.matching_rule_sets (
          id, organization_id, version, status, rules, approved_by_identity_id,
          approved_at, created_by_identity_id
        ) VALUES (
          ${ruleSetId}::uuid, ${fixture.organizationId}::uuid, 1, 'approved', '{"version":1}'::jsonb,
          ${fixture.pair[0].identityId}::uuid, clock_timestamp(), ${fixture.pair[0].identityId}::uuid
        )
      `;
      const payload = {
        organizationId: fixture.organizationId,
        intakeId,
        ruleVersion: 1,
        actorIdentityId: fixture.pair[0].identityId,
      };
      const firstCorrelationId = randomUUID();
      const firstKey = randomUUID();
      const run = (correlationId: string, key: string) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_run_deterministic_matching(
            ${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${key}::uuid
          ) AS result
        `;
        return row!.result;
      });
      const first = await run(firstCorrelationId, firstKey);
      expect(first).toMatchObject({ outcomeCode: "computed", candidateCount: 1 });
      const [firstCandidate] = await sql<{ eligibility: string; deterministic_score: number }[]>`
        SELECT eligibility, deterministic_score FROM public.evaluation_candidates WHERE id = ${candidateId}::uuid
      `;
      expect(firstCandidate).toMatchObject({ eligibility: "ineligible", deterministic_score: 0 });
      const [firstRun] = await sql<{ vendor_input_snapshot: unknown }[]>`
        SELECT vendor_input_snapshot FROM public.matching_runs WHERE id = ${(first.matchingRunId as string)}::uuid
      `;
      expect(firstRun!.vendor_input_snapshot).toMatchObject([{ candidateId, inputs: [] }]);

      const [evidence] = await sql<{ id: string }[]>`
        SELECT id FROM public.vendor_evidence_versions
        WHERE organization_id = ${vendorOrganizationId}::uuid AND fact_id = ${input.factId}::uuid
        ORDER BY version DESC LIMIT 1
      `;
      await sql`
        INSERT INTO public.vendor_fact_reviews (
          id, organization_id, evidence_id, reviewer_identity_id, decision, decided_at, reason
        ) VALUES (
          ${randomUUID()}::uuid, ${vendorOrganizationId}::uuid, ${evidence!.id}::uuid,
          ${fixture.pair[0].identityId}::uuid, 'approved', ${liveCapture}::timestamptz, 'Approved for matching'
        )
      `;
      const second = await run(randomUUID(), randomUUID());
      expect(second).toMatchObject({ outcomeCode: "computed", candidateCount: 1 });
      const [secondCandidate] = await sql<{ eligibility: string; deterministic_score: number }[]>`
        SELECT eligibility, deterministic_score FROM public.evaluation_candidates WHERE id = ${candidateId}::uuid
      `;
      expect(secondCandidate).toMatchObject({ eligibility: "eligible", deterministic_score: 10000 });
      expect(second).not.toHaveProperty("vendorOrganizationId");
      const [secondRun] = await sql<{ vendor_input_snapshot: Array<Record<string, unknown>> }[]>`
        SELECT vendor_input_snapshot FROM public.matching_runs WHERE id = ${(second.matchingRunId as string)}::uuid
      `;
      expect(secondRun!.vendor_input_snapshot).toMatchObject([{
        candidateId,
        inputs: [expect.objectContaining({
          fact_id: input.factId,
          field_key: "input_payroll",
          provenance: "evidence",
          evidence_id: evidence!.id,
        })],
      }]);
      const snapshotText = JSON.stringify(secondRun!.vendor_input_snapshot);
      expect(snapshotText).not.toContain(fixture.organizationId);
      await expect(sql.savepoint((probe) => probe`UPDATE public.matching_runs SET vendor_input_snapshot = '[]'::jsonb WHERE id = ${(second.matchingRunId as string)}::uuid`))
        .rejects.toMatchObject({ code: "P0001", message: "matching_runs is append-only" });
      await expect(sql.savepoint((probe) => probe`DELETE FROM public.matching_runs WHERE id = ${(second.matchingRunId as string)}::uuid`))
        .rejects.toMatchObject({ code: "P0001", message: "matching_runs is append-only" });
      await expect(sql.savepoint((probe) => probe`TRUNCATE public.matching_runs`))
        .rejects.toMatchObject({ code: "P0001", message: "matching_runs is append-only" });

      const replay = await run(firstCorrelationId, firstKey);
      expect(replay).toMatchObject({ matchingRunId: first.matchingRunId, outcomeCode: "replayed" });
      const [replayedRun] = await sql<{ vendor_input_snapshot: unknown }[]>`
        SELECT vendor_input_snapshot FROM public.matching_runs WHERE id = ${(first.matchingRunId as string)}::uuid
      `;
      expect(replayedRun!.vendor_input_snapshot).toMatchObject([{ candidateId, inputs: [] }]);
    });
  }, 120_000);
});
