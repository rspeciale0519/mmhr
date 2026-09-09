import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
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

type SubmitResult = {
  intakeId: string;
  organizationId: string;
  status: string;
  revision: number;
  outcomeCode: string;
  correlationId: string;
};

type RequirementResult = {
  requirementId: string;
  organizationId: string;
  intakeId: string;
  revision: number;
  outcomeCode: string;
  correlationId: string;
};

async function addContributor(
  sql: SecurityTransaction,
  organizationId: string,
  principal: SecurityPrincipal,
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.org_members (
      org_id, identity_id, user_id, role, role_key, migration_review_required
    ) VALUES (
      ${organizationId}::uuid, ${principal.identityId}::uuid, ${principal.subject}::uuid,
      'contributor'::public.org_role, 'contributor', false
    ) RETURNING id
  `;
  return row!.id;
}

async function addCustomerPortalGrant(
  sql: SecurityTransaction,
  organizationId: string,
  issuedByIdentityId: string,
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.portal_access_grants (
      organization_id, portal, issued_by_identity_id, issue_reason
    ) VALUES (
      ${organizationId}::uuid, 'customer'::public.portal_kind,
      ${issuedByIdentityId}::uuid, 'Customer intake submit integration fixture'
    ) RETURNING id
  `;
  return row!.id;
}

async function seedIntake(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  identityId: string,
  status: "draft" | "in_progress" | "submitted" | "under_review" | "completed" | "archived" = "in_progress",
  revision = 1,
) {
  const intakeId = randomUUID();
  await sql`
    INSERT INTO public.intakes (
      id, organization_id, status, company_context, current_systems,
      compliance_needs, budget, timeline, stakeholders, decision_process,
      submitted_at, created_by_identity_id, updated_by_identity_id, revision
    ) VALUES (
      ${intakeId}::uuid, ${fixture.organizationId}::uuid, ${status},
      '{"sector":"services"}'::jsonb, '["payroll"]'::jsonb,
      '["soc2"]'::jsonb, '{"range":"mid"}'::jsonb, '{"months":3}'::jsonb,
      '["owner"]'::jsonb, '{"process":"committee"}'::jsonb,
      CASE WHEN ${status} IN ('draft', 'in_progress') THEN NULL ELSE now() END,
      ${identityId}::uuid, ${identityId}::uuid, ${revision}
    )
  `;
  return intakeId;
}

function requirementPayload(
  fixture: SecurityCommandFixture,
  intakeId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    requirementId: randomUUID(),
    organizationId: fixture.organizationId,
    intakeId,
    expectedRevision: 0,
    stableKey: `submit_requirement_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    label: "Payroll platform",
    importance: "must",
    weight: 1,
    response: { value: "mid" },
    requirementType: "structured",
    ...overrides,
  };
}

async function saveRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RequirementResult }[]>`
      SELECT public.mmhr_save_customer_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${randomUUID()}::uuid,
        ${randomUUID()}::uuid
      ) AS result
    `;
    return row!.result;
  });
}

async function submitIntake(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: SubmitResult }[]>`
      SELECT public.mmhr_submit_customer_intake(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

function submitPayload(fixture: SecurityCommandFixture, intakeId: string, expectedRevision = 1) {
  return { organizationId: fixture.organizationId, intakeId, expectedRevision };
}

async function submitCounts(sql: SecurityTransaction, intakeId: string) {
  const [row] = await sql<{ history: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.intake_history WHERE intake_id = ${intakeId}::uuid) AS history,
      (SELECT count(*)::integer FROM public.audit_events
        WHERE command = 'r3.customer.intake.submit' AND entity_id = ${intakeId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts
        WHERE command = 'r3.customer.intake.submit' AND entity_id = ${intakeId}::uuid) AS receipts
  `;
  return row!;
}

describe("R3 customer intake submit RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;
  let customerMembershipId: string;
  let customerPortalGrantId: string;

  beforeAll(async () => {
    context = await startRehearsal("r3-customer-intake-submit");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const created = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      customerMembershipId = await addContributor(sql, created.organizationId, customerContributor);
      customerPortalGrantId = await addCustomerPortalGrant(sql, created.organizationId, created.pair[1].identityId);
      return created;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("submits, preserves answers, and records ordered requirement revisions", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      const first = await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      const second = await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId, {
        importance: "nice", label: "Time tracking", response: { value: "required" },
      }));
      const correlationId = randomUUID();
      const result = await submitIntake(sql, customerContributor, submitPayload(fixture, intakeId), correlationId);
      expect(result).toEqual({ intakeId, organizationId: fixture.organizationId, status: "submitted",
        revision: 2, outcomeCode: "updated", correlationId });
      const [intake] = await sql<Record<string, unknown>[]>`
        SELECT status, revision, company_context, current_systems, compliance_needs, budget,
          timeline, stakeholders, decision_process, submitted_at
        FROM public.intakes WHERE id = ${intakeId}::uuid
      `;
      expect(intake).toMatchObject({ status: "submitted", revision: 2,
        company_context: { sector: "services" }, current_systems: ["payroll"],
        compliance_needs: ["soc2"], budget: { range: "mid" }, timeline: { months: 3 },
        stakeholders: ["owner"], decision_process: { process: "committee" } });
      expect(intake!.submitted_at).toEqual(expect.any(Date));
      const [history] = await sql<{ snapshot: Record<string, unknown> }[]>`
        SELECT snapshot FROM public.intake_history WHERE intake_id = ${intakeId}::uuid AND revision = 2
      `;
      const revisions = history!.snapshot.requirementRevisions as { requirementId: string; revision: number }[];
      expect(revisions).toEqual([
        { requirementId: first.requirementId, revision: 1 },
        { requirementId: second.requirementId, revision: 1 },
      ].sort((a, b) => a.requirementId.localeCompare(b.requirementId)));
      expect(await submitCounts(sql, intakeId)).toEqual({ history: 1, audits: 1, receipts: 1 });
      const [audit] = await sql<{ action: string; before_summary: unknown; after_summary: unknown }[]>`
        SELECT action, before_summary, after_summary FROM public.audit_events
        WHERE command = 'r3.customer.intake.submit' AND entity_id = ${intakeId}
      `;
      expect(audit).toEqual({ action: "customer.intake.submit", before_summary: { version: 1 }, after_summary: { version: 1 } });
    });
  }, 120_000);

  test("replays the exact request and rejects changed or new-key resubmission", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      const correlationId = randomUUID(); const idempotencyKey = randomUUID();
      const payload = submitPayload(fixture, intakeId);
      const submitted = await submitIntake(sql, customerContributor, payload, correlationId, idempotencyKey);
      await expect(submitIntake(sql, customerContributor, payload, correlationId, idempotencyKey))
        .resolves.toEqual({ ...submitted, outcomeCode: "replayed" });
      await expect(submitIntake(sql, customerContributor, { ...payload, expectedRevision: 2 }, correlationId, idempotencyKey))
        .rejects.toMatchObject({ code: "22023" });
      await expect(submitIntake(sql, customerContributor, payload, randomUUID(), randomUUID()))
        .rejects.toMatchObject({ code: "42501" });
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 1, audits: 1, receipts: 1 });
    });
  }, 120_000);

  test.each([
    ["empty", undefined],
    ["not applicable", { importance: "not_applicable" }],
    ["archived", { archived: true }],
  ] as const)("rejects a %s requirement set", async (_name, requirement) => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      if (requirement) {
        const created = await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId, {
          ...(("archived" in requirement) ? {} : requirement),
        }));
        if ("archived" in requirement) {
          await sql`UPDATE public.intake_requirements
            SET status = 'archived', revision = 2, updated_by_identity_id = ${customerContributor.identityId}::uuid,
                updated_at = now(), correlation_id = ${randomUUID()}::uuid
            WHERE id = ${created.requirementId}::uuid`;
        }
      }
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
        .rejects.toMatchObject({ code: "42501" });
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test.each(["submitted", "under_review", "completed", "archived"] as const)(
    "rejects an intake already in %s",
    async (status) => {
      await rollbackCase(context!, async (sql) => {
        const intakeId = await seedIntake(sql, fixture, customerContributor.identityId, status);
        await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
          .rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  test("rejects a stale revision without changing the intake", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId, "in_progress", 2);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId, 1)))
        .rejects.toMatchObject({ code: "42501" });
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test.each(["viewer", "cross-organization", "revoked", "portal-revoked", "invalid-session"] as const)(
    "denies %s callers",
    async (caseName) => {
      await rollbackCase(context!, async (sql) => {
        let principal = customerContributor;
        let organizationId = fixture.organizationId;
        if (caseName === "viewer") principal = fixture.target;
        if (caseName === "cross-organization") organizationId = randomUUID();
        if (caseName === "revoked") {
          await sql`UPDATE public.org_members SET status = 'revoked'::public.membership_status,
            revoked_at = now(), revoked_reason = 'Submit denial fixture'
            WHERE id = ${customerMembershipId}::uuid`;
        }
        if (caseName === "portal-revoked") {
          await sql`UPDATE public.portal_access_grants SET state = 'revoked'::public.security_record_state,
            revoked_at = now(), revoked_by_identity_id = ${fixture.pair[1].identityId}::uuid,
            revocation_reason = 'Submit denial fixture' WHERE id = ${customerPortalGrantId}::uuid`;
        }
        if (caseName === "invalid-session") {
          principal = await createSecurityPrincipal(sql);
          await addContributor(sql, fixture.organizationId, principal);
          await sql`UPDATE auth.sessions SET not_after = now() - interval '1 minute'
            WHERE id = ${principal.sessionId}::uuid`;
        }
        const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
        if (caseName !== "cross-organization") await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
        await expect(submitIntake(sql, principal, { ...submitPayload({ ...fixture, organizationId }, intakeId) }))
          .rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  test("rejects malformed payloads before any write", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      const valid = submitPayload(fixture, intakeId);
      for (const payload of [
        { ...valid, extra: true },
        { ...valid, actorIdentityId: customerContributor.identityId },
        { ...valid, intakeId: "not-a-uuid" },
        { ...valid, expectedRevision: 0 },
        { ...valid, expectedRevision: 2_147_483_647 },
        { ...valid, expectedRevision: -1 },
        { ...valid, expectedRevision: 1.5 },
        Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "intakeId")),
      ]) {
        await expect(submitIntake(sql, customerContributor, payload)).rejects.toMatchObject({ code: "22023" });
      }
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test("rolls back the submit when the audit row cannot be inserted", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      await sql`ALTER TABLE public.audit_events
        ADD CONSTRAINT r3_customer_intake_submit_audit_failure CHECK (false) NOT VALID`;
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
        .rejects.toMatchObject({ code: "23514", constraint_name: "r3_customer_intake_submit_audit_failure" });
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 0, audits: 0, receipts: 0 });
      const [intake] = await sql<{ status: string; revision: number }[]>`
        SELECT status, revision FROM public.intakes WHERE id = ${intakeId}::uuid
      `;
      expect(intake).toEqual({ status: "in_progress", revision: 1 });
    });
  }, 120_000);

  test("rejects a recovery-fenced caller", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId));
      await sql`UPDATE public.identities SET authorization_not_before = clock_timestamp()
        WHERE id = ${customerContributor.identityId}::uuid`;
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("serializes submission before a concurrent requirement save", async () => {
    const intakeId = await context!.client.begin(async (sql) => {
      const id = await seedIntake(sql, fixture, customerContributor.identityId);
      await saveRequirement(sql, customerContributor, requirementPayload(fixture, id));
      return id;
    });
    const firstReady = deferred<void>();
    const secondReady = deferred<number>();
    const blocked = deferred<void>();
    const releaseFirst = deferred<void>();
    void firstReady.promise.catch(() => undefined);
    void secondReady.promise.catch(() => undefined);
    void blocked.promise.catch(() => undefined);

    const first = context!.client.begin(async (sql) => {
      try {
        const result = await submitIntake(sql, customerContributor, submitPayload(fixture, intakeId));
        firstReady.resolve();
        const secondPid = await secondReady.promise;
        await waitForGuardWait(sql, secondPid);
        blocked.resolve();
        await releaseFirst.promise;
        return result;
      } catch (error) {
        firstReady.reject(error);
        blocked.reject(error);
        throw error;
      }
    });
    void first.catch(() => undefined);
    await firstReady.promise;

    const second = context!.client.begin(async (sql) => {
      try {
        const [backend] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::integer AS pid`;
        secondReady.resolve(backend!.pid);
        return await saveRequirement(sql, customerContributor, requirementPayload(fixture, intakeId, {
          requirementId: randomUUID(), expectedRevision: 0, label: "Must not save after submission",
        }));
      } catch (error) {
        secondReady.reject(error);
        throw error;
      }
    });
    void second.catch(() => undefined);
    try {
      await secondReady.promise;
      await blocked.promise;
    } finally {
      releaseFirst.resolve();
    }

    await expect(first).resolves.toMatchObject({ intakeId, status: "submitted", revision: 2 });
    await expect(second).rejects.toMatchObject({ code: "42501" });
    const [state] = await context!.client.begin((sql) => sql<{ status: string; revision: number }[]>`
      SELECT status, revision FROM public.intakes WHERE id = ${intakeId}::uuid
    `);
    expect(state).toEqual({ status: "submitted", revision: 2 });
    const [requirements] = await context!.client.begin((sql) => sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM public.intake_requirements WHERE intake_id = ${intakeId}::uuid
    `);
    expect(requirements).toEqual({ count: 1 });
  }, 120_000);

  test("backfills a missing requirement history row without inventing an actor", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      const requirementId = randomUUID();
      await sql`ALTER TABLE public.intake_requirements DISABLE TRIGGER intake_requirements_capture_history`;
      await sql`
        INSERT INTO public.intake_requirements (
          id, organization_id, intake_id, stable_key, label, importance, weight,
          response, status, requirement_type, evidence_references, vendor_response_links,
          revision, correlation_id, created_at, updated_at
        ) VALUES (
          ${requirementId}::uuid, ${fixture.organizationId}::uuid, ${intakeId}::uuid,
          'legacy_submit_requirement', 'Legacy requirement', 'must', 1,
          '{"value":"mid"}'::jsonb, 'active', 'structured', '[]'::jsonb, '[]'::jsonb,
          1, ${randomUUID()}::uuid, now(), now()
        )
      `;
      await sql`ALTER TABLE public.intake_requirements ENABLE TRIGGER intake_requirements_capture_history`;
      const [before] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM public.intake_requirement_history
        WHERE requirement_id = ${requirementId}::uuid
      `;
      expect(before).toEqual({ count: 0 });
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
        .resolves.toMatchObject({ status: "submitted", revision: 2, outcomeCode: "updated" });
      const [history] = await sql<{ snapshot_source: string; changed_by_identity_id: string | null }[]>`
        SELECT snapshot_source, changed_by_identity_id FROM public.intake_requirement_history
        WHERE requirement_id = ${requirementId}::uuid AND revision = 1
      `;
      expect(history).toEqual({ snapshot_source: "legacy_backfill", changed_by_identity_id: null });
    });
  }, 120_000);

  test("rejects an oversized submission snapshot without changing state", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture, customerContributor.identityId);
      await sql`
        INSERT INTO public.intake_requirements (
          organization_id, intake_id, stable_key, label, importance, weight, response,
          created_by_identity_id, updated_by_identity_id
        )
        SELECT ${fixture.organizationId}::uuid, ${intakeId}::uuid,
          'overflow_requirement_' || lpad(gs::text, 4, '0'), 'Overflow requirement',
          'must', 1, '{"value":"mid"}'::jsonb,
          ${customerContributor.identityId}::uuid, ${customerContributor.identityId}::uuid
        FROM generate_series(1, 2000) AS gs
      `;
      const [snapshot] = await sql<{ bytes: number }[]>`
        SELECT pg_column_size(jsonb_build_object(
          'status', 'submitted', 'companyContext', i.company_context,
          'currentSystems', i.current_systems, 'complianceNeeds', i.compliance_needs,
          'budget', i.budget, 'timeline', i.timeline, 'stakeholders', i.stakeholders,
          'decisionProcess', i.decision_process,
          'requirementRevisions', (
            SELECT jsonb_agg(jsonb_build_object('requirementId', r.id, 'revision', r.revision) ORDER BY r.id)
            FROM public.intake_requirements r
            WHERE r.intake_id = i.id AND r.organization_id = i.organization_id AND r.status = 'active'
          )
        ))::integer AS bytes
        FROM public.intakes i WHERE i.id = ${intakeId}::uuid
      `;
      expect(snapshot!.bytes).toBeGreaterThan(100_000);
      await expect(submitIntake(sql, customerContributor, submitPayload(fixture, intakeId)))
        .rejects.toMatchObject({ code: "42501", message: "Customer submission snapshot exceeds its storage boundary" });
      await expect(submitCounts(sql, intakeId)).resolves.toEqual({ history: 0, audits: 0, receipts: 0 });
      const [intake] = await sql<{ status: string; revision: number }[]>`
        SELECT status, revision FROM public.intakes WHERE id = ${intakeId}::uuid
      `;
      expect(intake).toEqual({ status: "in_progress", revision: 1 });
    });
  }, 120_000);

  test("keeps raw intake and history tables unavailable to the customer", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`
        SELECT count(*) FROM public.intakes
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`
        SELECT count(*) FROM public.intake_history
      `)).rejects.toMatchObject({ code: "42501" });
    });
  });
});
