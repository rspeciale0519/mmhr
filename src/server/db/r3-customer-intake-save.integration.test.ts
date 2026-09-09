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

type SaveResult = {
  intakeId: string;
  organizationId: string;
  status: string;
  revision: number;
  outcomeCode: string;
  correlationId: string;
};

function newPayload(fixture: SecurityCommandFixture, data: Record<string, unknown> = {}) {
  return {
    intakeId: null,
    organizationId: fixture.organizationId,
    expectedRevision: 0,
    status: "draft",
    data,
  };
}

async function saveCustomerIntake(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: SaveResult }[]>`
      SELECT public.mmhr_save_customer_intake(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function rowCounts(sql: SecurityTransaction, intakeId: string) {
  const [row] = await sql<{ history: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.intake_history WHERE intake_id = ${intakeId}::uuid) AS history,
      (SELECT count(*)::integer FROM public.audit_events WHERE entity_type = 'intake' AND entity_id = ${intakeId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts WHERE entity_id = ${intakeId}::uuid) AS receipts
  `;
  return row!;
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

describe("R3 customer draft intake save RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let customerContributor: SecurityPrincipal;
  let customerContributorMembershipId: string;
  let customerPortalGrantId: string;

  beforeAll(async () => {
    context = await startRehearsal("r3-customer-intake-save");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const created = await createCommandFixture(sql);
      customerContributor = await createSecurityPrincipal(sql);
      customerContributorMembershipId = await addContributor(sql, created.organizationId, customerContributor);
      const [grant] = await sql<{ id: string }[]>`
        INSERT INTO public.portal_access_grants (
          organization_id, portal, issued_by_identity_id, issue_reason
        ) VALUES (
          ${created.organizationId}::uuid, 'customer'::public.portal_kind,
          ${created.pair[1].identityId}::uuid, 'Customer intake integration fixture'
        ) RETURNING id
      `;
      customerPortalGrantId = grant!.id;
      return created;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, replays, updates, and records one audit trail", async () => {
    await rollbackCase(context!, async (sql) => {
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = newPayload(fixture, { companyContext: { sector: "services" } });
      const created = await saveCustomerIntake(sql, customerContributor, payload, correlationId, idempotencyKey);
      expect(Object.keys(created).sort()).toEqual([
        "correlationId", "intakeId", "organizationId", "outcomeCode", "revision", "status",
      ]);
      expect(created).toEqual({
        intakeId: expect.any(String), organizationId: fixture.organizationId, status: "draft",
        revision: 1, outcomeCode: "created", correlationId,
      });

      const replayed = await saveCustomerIntake(sql, customerContributor, payload, correlationId, idempotencyKey);
      expect(replayed).toEqual({ ...created, outcomeCode: "replayed" });

      const updated = await saveCustomerIntake(sql, customerContributor, {
        ...payload, intakeId: created.intakeId, expectedRevision: 1,
        status: "in_progress", data: { timeline: { months: 3 } },
      });
      expect(updated).toEqual({
        intakeId: created.intakeId, organizationId: fixture.organizationId, status: "in_progress",
        revision: 2, outcomeCode: "updated", correlationId: expect.any(String),
      });
      await expect(rowCounts(sql, created.intakeId)).resolves.toEqual({ history: 2, audits: 2, receipts: 2 });
      const history = await sql<{ revision: number; snapshot: Record<string, unknown>; correlation_id: string }[]>`
        SELECT revision, snapshot, correlation_id
        FROM public.intake_history WHERE intake_id = ${created.intakeId}::uuid ORDER BY revision
      `;
      expect(history).toEqual([
        {
          revision: 1, correlation_id: correlationId,
          snapshot: expect.objectContaining({ status: "draft", companyContext: { sector: "services" } }),
        },
        {
          revision: 2, correlation_id: expect.any(String),
          snapshot: expect.objectContaining({ status: "in_progress", timeline: { months: 3 } }),
        },
      ]);
      const audits = await sql<{
        action: string; before_summary: Record<string, unknown> | null;
        after_summary: Record<string, unknown>; correlation_id: string;
      }[]>`
        SELECT action, before_summary, after_summary, correlation_id
        FROM public.audit_events
        WHERE command = 'r3.customer.intake.save' AND entity_id = ${created.intakeId}
        ORDER BY occurred_at
      `;
      expect(audits).toEqual([
        { action: "customer.intake.save", before_summary: { version: 1 },
          after_summary: { version: 1 }, correlation_id: correlationId },
        { action: "customer.intake.save", before_summary: { version: 1 },
          after_summary: { version: 1 }, correlation_id: expect.any(String) },
      ]);
    });
  }, 120_000);

  test("rejects strict input and stale or invalid lifecycle revisions before writing", async () => {
    await rollbackCase(context!, async (sql) => {
      const base = newPayload(fixture);
      const missingIntakeId = Object.fromEntries(
        Object.entries(base).filter(([key]) => key !== "intakeId"),
      );
      const invalidPayloads = [
        missingIntakeId,
        { ...base, actorIdentityId: customerContributor.identityId },
        { ...base, correlationId: randomUUID() },
        { ...base, idempotencyKey: randomUUID() },
        { ...base, status: "submitted" },
        { ...base, expectedRevision: 1 },
        { ...base, data: { unsupported: { nested: true } } },
      ];
      for (const payload of invalidPayloads) {
        await expect(saveCustomerIntake(sql, customerContributor, payload)).rejects.toMatchObject({ code: "22023" });
      }
      const created = await saveCustomerIntake(sql, customerContributor, base);
      await expect(saveCustomerIntake(sql, customerContributor, {
        ...base, intakeId: created.intakeId, expectedRevision: 0, status: "in_progress",
      })).rejects.toMatchObject({ code: "22023" });
      await expect(saveCustomerIntake(sql, customerContributor, {
        ...base, intakeId: created.intakeId, expectedRevision: 1, status: "submitted",
      })).rejects.toMatchObject({ code: "22023" });
      await expect(rowCounts(sql, created.intakeId)).resolves.toEqual({ history: 1, audits: 1, receipts: 1 });
    });
  }, 120_000);

  test("rejects receipt reuse with a different request", async () => {
    await rollbackCase(context!, async (sql) => {
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = newPayload(fixture, { budget: { range: "mid" } });
      await saveCustomerIntake(sql, customerContributor, payload, correlationId, idempotencyKey);
      await expect(saveCustomerIntake(sql, customerContributor, {
        ...payload, data: { budget: { range: "high" } },
      }, correlationId, idempotencyKey)).rejects.toMatchObject({ code: "22023" });
    });
  }, 120_000);

  test.each([
    "viewer", "vendor", "cross-organization", "revoked", "override-denied",
    "portal-revoked", "portal-explicit-denied", "invalid-session",
  ] as const)("denies %s callers", async (caseName) => {
    await rollbackCase(context!, async (sql) => {
      let principal: SecurityPrincipal = fixture.target;
      let organizationId = fixture.organizationId;
      if (caseName === "vendor") {
        principal = await createSecurityPrincipal(sql);
        const [organization] = await sql<{ id: string }[]>`
          INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
          VALUES ('Customer save vendor denial', 'vendor', 'active', now(), false) RETURNING id
        `;
        await addContributor(sql, organization!.id, principal);
        organizationId = organization!.id;
        await sql`
          INSERT INTO public.portal_access_grants (
            organization_id, portal, issued_by_identity_id, issue_reason
          ) VALUES (
            ${organizationId}::uuid, 'vendor'::public.portal_kind,
            ${fixture.pair[1].identityId}::uuid, 'Customer save vendor denial fixture'
          )
        `;
      } else if (caseName === "cross-organization") {
        principal = customerContributor;
      } else if (caseName === "revoked") {
        await sql`
          UPDATE public.org_members
          SET status = 'revoked'::public.membership_status,
              revoked_at = now(), revoked_reason = 'Customer save denial fixture'
          WHERE id = ${customerContributorMembershipId}::uuid
        `;
        principal = customerContributor;
      } else if (caseName === "portal-revoked") {
        await sql`
          UPDATE public.portal_access_grants
          SET state = 'revoked'::public.security_record_state,
              revoked_at = now(), revoked_by_identity_id = ${fixture.pair[1].identityId}::uuid,
              revocation_reason = 'Customer intake portal denial fixture'
          WHERE id = ${customerPortalGrantId}::uuid
        `;
        principal = customerContributor;
      } else if (caseName === "portal-explicit-denied") {
        await sql`
          INSERT INTO public.user_permission_overrides (
            identity_id, permission_key, scope_kind, organization_id, scope_key,
            effect, issued_by_identity_id, issue_reason
          ) VALUES (
            ${customerContributor.identityId}::uuid, 'portal.customer.access', 'organization',
            ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`},
            'deny', ${fixture.pair[1].identityId}::uuid, 'Customer intake portal denial fixture'
          )
        `;
        principal = customerContributor;
      } else if (caseName === "override-denied") {
        await sql`
          INSERT INTO public.user_permission_overrides (
            identity_id, permission_key, scope_kind, organization_id, scope_key,
            effect, issued_by_identity_id, issue_reason
          ) VALUES (
            ${customerContributor.identityId}::uuid, 'intake.draft.save', 'organization',
            ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`},
            'deny', ${fixture.pair[1].identityId}::uuid, 'Customer save denial fixture'
          )
        `;
        principal = customerContributor;
      } else if (caseName === "invalid-session") {
        principal = await createSecurityPrincipal(sql);
        await addContributor(sql, fixture.organizationId, principal);
        await sql`UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = ${principal.sessionId}::uuid`;
      }
      if (caseName === "cross-organization") organizationId = randomUUID();
      await expect(saveCustomerIntake(sql, principal, newPayload({ ...fixture, organizationId }))).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("preserves omitted intake fields during a patch", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveCustomerIntake(sql, customerContributor, newPayload(fixture, {
        companyContext: { sector: "services" },
        budget: { range: "mid" },
      }));
      await saveCustomerIntake(sql, customerContributor, {
        ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
        status: "in_progress", data: { timeline: { months: 3 } },
      });
      const [row] = await sql<{ company_context: unknown; budget: unknown; timeline: unknown }[]>`
        SELECT company_context, budget, timeline FROM public.intakes WHERE id = ${created.intakeId}::uuid
      `;
      expect(row).toEqual({
        company_context: { sector: "services" }, budget: { range: "mid" }, timeline: { months: 3 },
      });
    });
  }, 120_000);

  test("denies edits to a submitted intake without adding rows", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveCustomerIntake(sql, customerContributor, newPayload(fixture));
      await sql`
        UPDATE public.intakes SET status = 'submitted', submitted_at = now()
        WHERE id = ${created.intakeId}::uuid
      `;
      const before = await rowCounts(sql, created.intakeId);
      await expect(saveCustomerIntake(sql, customerContributor, {
        ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
        status: "in_progress", data: { timeline: { months: 6 } },
      })).rejects.toMatchObject({ code: "42501" });
      await expect(rowCounts(sql, created.intakeId)).resolves.toEqual(before);
    });
  }, 120_000);

  test("rejects a caller fenced after the session was issued", async () => {
    await rollbackCase(context!, async (sql) => {
      await sql`
        UPDATE public.identities SET authorization_not_before = clock_timestamp()
        WHERE id = ${customerContributor.identityId}::uuid
      `;
      await expect(saveCustomerIntake(sql, customerContributor, newPayload(fixture))).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("rolls back the intake, history, audit, and receipt when audit insertion fails", async () => {
    await rollbackCase(context!, async (sql) => {
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r3_customer_intake_audit_failure CHECK (false) NOT VALID`;
      await expect(saveCustomerIntake(sql, customerContributor, newPayload(fixture))).rejects.toMatchObject({
        code: "23514", constraint_name: "r3_customer_intake_audit_failure",
      });
      const [counts] = await sql<{ intakes: number; history: number; audits: number; receipts: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.intakes WHERE organization_id = ${fixture.organizationId}::uuid) AS intakes,
          (SELECT count(*)::integer FROM public.intake_history WHERE organization_id = ${fixture.organizationId}::uuid) AS history,
          (SELECT count(*)::integer FROM public.audit_events WHERE command = 'r3.customer.intake.save') AS audits,
          (SELECT count(*)::integer FROM public.security_command_receipts WHERE command = 'r3.customer.intake.save') AS receipts
      `;
      expect(counts).toEqual({ intakes: 0, history: 0, audits: 0, receipts: 0 });
    });
  }, 120_000);

  test("keeps intake history append-only", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveCustomerIntake(sql, customerContributor, newPayload(fixture));
      for (const statement of [
        `DELETE FROM public.intake_history WHERE intake_id = '${created.intakeId}'::uuid`,
        `UPDATE public.intake_history SET revision = 2 WHERE intake_id = '${created.intakeId}'::uuid`,
        "TRUNCATE public.intake_history",
      ]) {
        await expect(sql.savepoint((probe) => probe.unsafe(statement))).rejects.toMatchObject({ code: "P0001" });
      }
    });
  }, 120_000);

  test("rejects a stale writer without adding history or audit rows", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveCustomerIntake(sql, customerContributor, newPayload(fixture));
      await saveCustomerIntake(sql, customerContributor, {
        ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
        status: "in_progress", data: { timeline: { months: 6 } },
      });
      const before = await rowCounts(sql, created.intakeId);
      await expect(saveCustomerIntake(sql, customerContributor, {
        ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
        status: "draft", data: { timeline: { months: 12 } },
      })).rejects.toMatchObject({ code: "42501" });
      await expect(rowCounts(sql, created.intakeId)).resolves.toEqual(before);
    });
  }, 120_000);

  test("serializes concurrent saves and rejects the stale transaction", async () => {
    const created = await context!.client.begin((sql) =>
      saveCustomerIntake(sql, customerContributor, newPayload(fixture)),
    );
    const firstReady = deferred<void>();
    const blocked = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondReady = deferred<number>();
    void firstReady.promise.catch(() => undefined);
    void blocked.promise.catch(() => undefined);
    void secondReady.promise.catch(() => undefined);
    const first = context!.client.begin(async (sql) => {
      try {
        const result = await saveCustomerIntake(sql, customerContributor, {
          ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
          status: "in_progress", data: { timeline: { months: 6 } },
        });
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
        return await saveCustomerIntake(sql, customerContributor, {
          ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 1,
          status: "in_progress", data: { timeline: { months: 12 } },
        });
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
    await expect(first).resolves.toMatchObject({ intakeId: created.intakeId, revision: 2, outcomeCode: "updated" });
    await expect(second).rejects.toMatchObject({ code: "42501" });
    await expect(context!.client`SELECT revision, timeline FROM public.intakes WHERE id = ${created.intakeId}::uuid`)
      .resolves.toEqual([{ revision: 2, timeline: { months: 6 } }]);
  }, 120_000);

  test("keeps the legacy writer for internal AAL2 callers only", async () => {
    await rollbackCase(context!, async (sql) => {
      const internalPayload = { ...newPayload(fixture), actorIdentityId: fixture.pair[0].identityId };
      const internal = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: SaveResult }[]>`
          SELECT public.mmhr_save_intake(
            ${JSON.stringify(internalPayload)}::jsonb,
            ${randomUUID()}::uuid, ${randomUUID()}::uuid
          ) AS result
        `;
        return row!.result;
      }, "aal2");
      expect(internal).toMatchObject({
        organizationId: fixture.organizationId, status: "draft", revision: 1, outcomeCode: "created",
      });
      await expect(asAuthenticated(sql, fixture.target, (probe) => probe`
        SELECT public.mmhr_save_intake(
          ${JSON.stringify({ ...newPayload(fixture), actorIdentityId: fixture.target.identityId })}::jsonb,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid
        )
      `, "aal2")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test.each(["missing", "denied"] as const)("legacy external AAL2 callers remain denied with portal access %s", async (portalState) => {
    await rollbackCase(context!, async (sql) => {
      if (portalState === "missing") {
        await sql`
          UPDATE public.portal_access_grants
          SET state = 'revoked'::public.security_record_state,
              revoked_at = now(), revoked_by_identity_id = ${fixture.pair[1].identityId}::uuid,
              revocation_reason = 'Legacy writer denial fixture'
          WHERE id = ${customerPortalGrantId}::uuid
        `;
      } else {
        await sql`
          INSERT INTO public.user_permission_overrides (
            identity_id, permission_key, scope_kind, organization_id, scope_key,
            effect, issued_by_identity_id, issue_reason
          ) VALUES (
            ${fixture.target.identityId}::uuid, 'portal.customer.access', 'organization',
            ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`},
            'deny', ${fixture.pair[1].identityId}::uuid, 'Legacy writer denial fixture'
          )
        `;
      }
      await expect(asAuthenticated(sql, fixture.target, (probe) => probe`
        SELECT public.mmhr_save_intake(
          ${JSON.stringify({ ...newPayload(fixture), actorIdentityId: fixture.target.identityId })}::jsonb,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid
        )
      `, "aal2")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
