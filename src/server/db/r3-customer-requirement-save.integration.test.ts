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

type RequirementResult = {
  requirementId: string;
  organizationId: string;
  intakeId: string;
  revision: number;
  correlationId: string;
  outcomeCode: "created" | "updated" | "replayed";
};

async function seedIntake(
  sql: SecurityTransaction,
  organizationId: string,
  identityId: string,
  status: "draft" | "in_progress" | "submitted" | "under_review" | "completed" | "archived" = "draft",
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intakes (
      organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id
    ) VALUES (
      ${organizationId}::uuid, ${status},
      CASE WHEN ${status} IN ('draft', 'in_progress') THEN NULL ELSE now() END,
      ${identityId}::uuid, ${identityId}::uuid
    ) RETURNING id
  `;
  return row!.id;
}

function customerPayload(
  fixture: SecurityCommandFixture,
  intakeId: string,
  requirementId = randomUUID(),
  overrides: Record<string, unknown> = {},
) {
  return {
    requirementId,
    organizationId: fixture.organizationId,
    intakeId,
    expectedRevision: 0,
    stableKey: "payroll",
    label: "Payroll platform",
    importance: "must",
    weight: 1,
    response: { value: "mid" },
    requirementType: "structured",
    ...overrides,
  };
}

function legacyPayload(
  fixture: SecurityCommandFixture,
  intakeId: string,
  requirementId = randomUUID(),
) {
  return {
    ...customerPayload(fixture, intakeId, requirementId),
    ownerIdentityId: fixture.pair[0].identityId,
    evidenceReferences: ["https://example.invalid/evidence"],
    vendorResponseLinks: ["https://example.invalid/vendor"],
    actorIdentityId: fixture.pair[0].identityId,
  };
}

async function saveCustomerRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RequirementResult }[]>`
      SELECT public.mmhr_save_customer_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function saveLegacyRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  assurance: "aal1" | "aal2" = "aal2",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Record<string, unknown> }[]>`
      SELECT public.mmhr_create_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${randomUUID()}::uuid,
        ${randomUUID()}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function updateLegacyRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  assurance: "aal1" | "aal2" = "aal2",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Record<string, unknown> }[]>`
      SELECT public.mmhr_update_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${randomUUID()}::uuid,
        ${randomUUID()}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

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
      ${issuedByIdentityId}::uuid, 'Customer requirement save integration fixture'
    ) RETURNING id
  `;
  return row!.id;
}

async function requirementCounts(sql: SecurityTransaction, organizationId: string, requirementId: string) {
  const [row] = await sql<{ requirements: number; history: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.intake_requirements
        WHERE organization_id = ${organizationId}::uuid AND id = ${requirementId}::uuid) AS requirements,
      (SELECT count(*)::integer FROM public.intake_requirement_history
        WHERE organization_id = ${organizationId}::uuid AND requirement_id = ${requirementId}::uuid) AS history,
      (SELECT count(*)::integer FROM public.audit_events
        WHERE command = 'r3.customer.requirement.save' AND entity_id = ${requirementId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts
        WHERE command = 'r3.customer.requirement.save' AND entity_id = ${requirementId}::uuid) AS receipts
  `;
  return row!;
}

describe("R3 customer intake requirement save RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;
  let customerContributorMembershipId: string;
  let customerPortalGrantId: string;

  beforeAll(async () => {
    context = await startRehearsal("r3-customer-requirement-save");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const created = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      customerContributorMembershipId = await addContributor(sql, created.organizationId, customerContributor);
      customerPortalGrantId = await addCustomerPortalGrant(sql, created.organizationId, created.pair[1].identityId);
      return created;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, replays, updates, and returns a strict result", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId, "in_progress");
      const requirementId = randomUUID();
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = customerPayload(fixture, intakeId, requirementId);
      const created = await saveCustomerRequirement(sql, customerContributor, payload, correlationId, idempotencyKey);
      expect(Object.keys(created).sort()).toEqual([
        "correlationId", "intakeId", "organizationId", "outcomeCode", "requirementId", "revision",
      ]);
      expect(created).toEqual({ requirementId, organizationId: fixture.organizationId, intakeId,
        revision: 1, outcomeCode: "created", correlationId });
      const [stored] = await sql<{ owner_identity_id: string; evidence_references: string[]; vendor_response_links: string[] }[]>`
        SELECT owner_identity_id, evidence_references, vendor_response_links
        FROM public.intake_requirements WHERE id = ${requirementId}::uuid
      `;
      expect(stored).toEqual({ owner_identity_id: customerContributor.identityId,
        evidence_references: [], vendor_response_links: [] });
      await expect(saveCustomerRequirement(sql, customerContributor, payload, correlationId, idempotencyKey))
        .resolves.toEqual({ ...created, outcomeCode: "replayed" });
      const updated = await saveCustomerRequirement(sql, customerContributor, {
        ...payload, expectedRevision: 1, label: "Updated payroll platform", response: { value: "high" },
      });
      expect(updated).toMatchObject({ requirementId, organizationId: fixture.organizationId, intakeId,
        revision: 2, outcomeCode: "updated", correlationId: expect.any(String) });
      await sql`UPDATE public.intakes SET status = 'submitted', submitted_at = now()
        WHERE id = ${intakeId}::uuid`;
      await expect(saveCustomerRequirement(sql, customerContributor, payload, correlationId, idempotencyKey))
        .resolves.toEqual({ ...created, revision: 2, outcomeCode: "replayed" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId))
        .resolves.toEqual({ requirements: 1, history: 2, audits: 2, receipts: 2 });
    });
  }, 120_000);

  test("preserves server owned metadata on a customer update", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      await saveLegacyRequirement(sql, fixture.pair[0], legacyPayload(fixture, intakeId, requirementId));
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
        expectedRevision: 1, label: "Customer changed label", response: { answer: "saved" },
      }));
      const [row] = await sql<{
        owner_identity_id: string; evidence_references: string[]; vendor_response_links: string[];
      }[]>`
        SELECT owner_identity_id, evidence_references, vendor_response_links
        FROM public.intake_requirements WHERE id = ${requirementId}::uuid
      `;
      expect(row).toEqual({ owner_identity_id: fixture.pair[0].identityId,
        evidence_references: ["https://example.invalid/evidence"],
        vendor_response_links: ["https://example.invalid/vendor"] });
    });
  }, 120_000);

  test("rejects receipt reuse with a different request", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = customerPayload(fixture, intakeId);
      await saveCustomerRequirement(sql, customerContributor, payload, correlationId, idempotencyKey);
      await expect(saveCustomerRequirement(sql, customerContributor,
        { ...payload, label: "Different label" }, correlationId, idempotencyKey))
        .rejects.toMatchObject({ code: "22023" });
    });
  }, 120_000);

  test("rejects strict input before writing", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const payload = customerPayload(fixture, intakeId);
      const missing = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "label"));
      for (const invalid of [missing, { ...payload, actorIdentityId: customerContributor.identityId },
        { ...payload, expectedRevision: -1 }, { ...payload, weight: 101 }]) {
        await expect(saveCustomerRequirement(sql, customerContributor, invalid)).rejects.toMatchObject({ code: "22023" });
      }
      await expect(requirementCounts(sql, fixture.organizationId, payload.requirementId))
        .resolves.toEqual({ requirements: 0, history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test.each([
    "viewer", "cross-organization", "revoked", "action-denied", "portal-revoked", "portal-explicit-denied", "invalid-session",
  ] as const)("denies %s callers", async (caseName) => {
    await rollbackCase(context!, async (sql) => {
      let principal = fixture.target;
      let organizationId = fixture.organizationId;
      if (caseName === "cross-organization") {
        principal = customerContributor;
        organizationId = randomUUID();
      }
      if (caseName === "revoked") {
        await sql`UPDATE public.org_members SET status = 'revoked'::public.membership_status,
          revoked_at = now(), revoked_reason = 'Customer requirement denial fixture'
          WHERE id = ${customerContributorMembershipId}::uuid`;
        principal = customerContributor;
      }
      if (caseName === "action-denied") {
        await sql`INSERT INTO public.user_permission_overrides
          (identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason)
          VALUES (${customerContributor.identityId}::uuid, 'intake.requirement.save', 'organization',
          ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`}, 'deny',
          ${fixture.pair[1].identityId}::uuid, 'Customer requirement denial fixture')`;
        principal = customerContributor;
      }
      if (caseName === "portal-revoked") {
        await sql`UPDATE public.portal_access_grants SET state = 'revoked'::public.security_record_state,
          revoked_at = now(), revoked_by_identity_id = ${fixture.pair[1].identityId}::uuid,
          revocation_reason = 'Customer requirement denial fixture' WHERE id = ${customerPortalGrantId}::uuid`;
        principal = customerContributor;
      }
      if (caseName === "portal-explicit-denied") {
        await sql`INSERT INTO public.user_permission_overrides
          (identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason)
          VALUES (${customerContributor.identityId}::uuid, 'portal.customer.access', 'organization',
          ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`}, 'deny',
          ${fixture.pair[1].identityId}::uuid, 'Customer requirement denial fixture')`;
        principal = customerContributor;
      }
      if (caseName === "invalid-session") {
        principal = await createSecurityPrincipal(sql);
        await addContributor(sql, fixture.organizationId, principal);
        await sql`UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = ${principal.sessionId}::uuid`;
      }
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      await expect(saveCustomerRequirement(sql, principal, customerPayload({ ...fixture, organizationId }, intakeId)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("rejects a recovery-fenced caller", async () => {
    await rollbackCase(context!, async (sql) => {
      await sql`UPDATE public.identities SET authorization_not_before = clock_timestamp()
        WHERE id = ${customerContributor.identityId}::uuid`;
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      await expect(saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test.each(["submitted", "under_review", "completed", "archived"] as const)(
    "rejects an intake in %s lifecycle",
    async (status) => {
      await rollbackCase(context!, async (sql) => {
        const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId, status);
        await expect(saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId)))
          .rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  test("rejects an archived requirement without changing its history", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId));
      await sql`UPDATE public.intake_requirements
        SET status = 'archived', revision = 2, updated_by_identity_id = ${fixture.pair[0].identityId}::uuid,
            updated_at = now(), correlation_id = ${randomUUID()}::uuid
        WHERE id = ${requirementId}::uuid`;
      const before = await requirementCounts(sql, fixture.organizationId, requirementId);
      await expect(saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
        expectedRevision: 2, label: "Should not save",
      }))).rejects.toMatchObject({ code: "42501" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toEqual(before);
    });
  }, 120_000);

  test("records exact history and version one audit summaries", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      const correlationId = randomUUID();
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId), correlationId);
      const [history] = await sql<{ revision: number; snapshot: Record<string, unknown>; correlation_id: string }[]>`
        SELECT revision, snapshot, correlation_id FROM public.intake_requirement_history
        WHERE requirement_id = ${requirementId}::uuid ORDER BY revision
      `;
      expect(history).toMatchObject({ revision: 1, correlation_id: correlationId,
        snapshot: expect.objectContaining({ revision: 1, status: "active", label: "Payroll platform" }) });
      const [audit] = await sql<{ action: string; command: string; before_summary: unknown; after_summary: Record<string, unknown> }[]>`
        SELECT action, command, before_summary, after_summary FROM public.audit_events
        WHERE entity_type = 'intake_requirement' AND entity_id = ${requirementId} ORDER BY occurred_at
      `;
      expect(audit).toEqual({ action: "customer.requirement.save", command: "r3.customer.requirement.save",
        before_summary: { version: 1 }, after_summary: { version: 1 } });
    });
  }, 120_000);

  test("rolls back requirement, history, audit, and receipt when audit insertion fails", async () => {
    await rollbackCase(context!, async (sql) => {
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r3_customer_requirement_audit_failure CHECK (false) NOT VALID`;
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      await expect(saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId)))
        .rejects.toMatchObject({ code: "23514", constraint_name: "r3_customer_requirement_audit_failure" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId))
        .resolves.toEqual({ requirements: 0, history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test("keeps requirement history append only", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId));
      for (const statement of [
        `DELETE FROM public.intake_requirement_history WHERE requirement_id = '${requirementId}'::uuid`,
        `UPDATE public.intake_requirement_history SET revision = 2 WHERE requirement_id = '${requirementId}'::uuid`,
        "TRUNCATE public.intake_requirement_history",
      ]) {
        await expect(sql.savepoint((probe) => probe.unsafe(statement))).rejects.toMatchObject({ code: "P0001" });
      }
    });
  }, 120_000);

  test("rejects a stale writer without adding rows", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, customerContributor.identityId);
      const requirementId = randomUUID();
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId));
      await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
        expectedRevision: 1, label: "First update",
      }));
      const before = await requirementCounts(sql, fixture.organizationId, requirementId);
      await expect(saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
        expectedRevision: 1, label: "Stale update",
      }))).rejects.toMatchObject({ code: "42501" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toEqual(before);
    });
  }, 120_000);

  test("serializes concurrent saves and rejects the stale transaction", async () => {
    const intakeId = await context!.client.begin((sql) => seedIntake(sql, fixture.organizationId, customerContributor.identityId));
    const requirementId = randomUUID();
    await context!.client.begin((sql) => saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId)));
    const firstReady = deferred<void>();
    const blocked = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondReady = deferred<number>();
    void firstReady.promise.catch(() => undefined);
    void blocked.promise.catch(() => undefined);
    void secondReady.promise.catch(() => undefined);
    const first = context!.client.begin(async (sql) => {
      try {
        const result = await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
          expectedRevision: 1, label: "First concurrent update",
        }));
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
        return await saveCustomerRequirement(sql, customerContributor, customerPayload(fixture, intakeId, requirementId, {
          expectedRevision: 1, label: "Second concurrent update",
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
    await expect(first).resolves.toMatchObject({ requirementId, revision: 2, outcomeCode: "updated" });
    await expect(second).rejects.toMatchObject({ code: "42501" });
  }, 120_000);

  test("allows the internal AAL2 legacy writer and denies an external viewer", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const internal = await saveLegacyRequirement(sql, fixture.pair[0], legacyPayload(fixture, intakeId));
      expect(internal).toMatchObject({ organizationId: fixture.organizationId, intakeId, revision: 1, outcomeCode: "created" });
      const externalPayload = {
        ...legacyPayload(fixture, intakeId, randomUUID()),
        actorIdentityId: fixture.target.identityId,
        ownerIdentityId: fixture.target.identityId,
      };
      await expect(saveLegacyRequirement(sql, fixture.target, externalPayload, "aal2"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(updateLegacyRequirement(sql, fixture.target, {
        ...externalPayload,
        requirementId: String(internal.requirementId),
        expectedRevision: 1,
      }, "aal2")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("keeps raw requirement tables unavailable to an authenticated caller", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`
        SELECT count(*) FROM public.intake_requirements
      `, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, customerContributor, (probe) => probe`
        SELECT count(*) FROM public.intake_requirement_history
      `, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  });
});
