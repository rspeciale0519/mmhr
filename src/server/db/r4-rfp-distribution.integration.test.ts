import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, applyMigrationsBeforeRfpAuthorization, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createMembership, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";

describe("R4 RFP distribution RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-rfp-distribution");
    await applyMigrationsBeforeRfpAuthorization(context);
    fixture = await context.client.begin(async (sql) => {
      const result = await createCommandFixture(sql);
      await createMembership(sql, result.organizationId, result.pair[1]);
      await sql`INSERT INTO public.user_permission_overrides
        (identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason)
        VALUES (${result.pair[1].identityId}::uuid, 'workspace.access', 'organization',
          ${result.organizationId}::uuid, ${`organization:${result.organizationId}`}, 'allow',
          ${result.pair[0].identityId}::uuid, 'Isolated RFP reviewer workspace')`;
      return result;
    });
    // Upgrade an existing paired bootstrap and scoped assignments, not only an empty database.
    await applyAllMigrations(context);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function seed(sql: SecurityTransaction, legacy = false) {
    const intakeId = randomUUID();
    const rfpId = randomUUID();
    const vendorId = randomUUID();
    await sql`INSERT INTO public.intakes
      (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id)
      VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 1, clock_timestamp(),
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions
      (id, organization_id, rfp_id, source_intake_id, version, status, title, sections,
        approved_by_identity_id, approved_at, approval_reference, created_by_identity_id)
      VALUES (${rfpId}::uuid, ${fixture.organizationId}::uuid, ${rfpId}::uuid, ${intakeId}::uuid, 1,
        ${legacy ? "approved" : "draft"}, 'RFP', '[{"sectionKey":"fit","title":"Fit","questionCount":2}]'::jsonb,
        ${legacy ? fixture.organizationAdmin.identityId : null}::uuid,
        CASE WHEN ${legacy} THEN clock_timestamp() ELSE NULL END,
        ${legacy ? "approval:legacy" : null}, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.vendor_profiles
      (id, organization_id, status, created_by_identity_id, updated_by_identity_id)
      VALUES (${vendorId}::uuid, ${fixture.organizationId}::uuid, 'active',
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    if (legacy) await sql`INSERT INTO public.audit_events
      (actor_type, actor_identity_id, organization_id, command, action, entity_type, entity_id,
        reason, correlation_id, after_summary)
      VALUES ('user', ${fixture.organizationAdmin.identityId}::uuid, ${fixture.organizationId}::uuid,
        'r4.rfp.approve', 'rfp.approve', 'rfp_version', ${rfpId},
        'Preserved legacy approval fixture', ${randomUUID()}::uuid, '{"state":"approved","version":1}'::jsonb)`;
    return { rfpId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
      version: 1, recipients: [{ recipientId: randomUUID(), vendorProfileId: vendorId,
        deadlineAt: "2030-01-01T00:00:00Z", reminderAt: "2029-12-25T00:00:00Z", deliveryReference: "delivery:one" }],
      correlationId: randomUUID(), idempotencyKey: randomUUID() };
  }

  async function approve(sql: SecurityTransaction, rfpId: string) {
    const reviewer = fixture.pair[1];
    const payload = { rfpId, organizationId: fixture.organizationId, actorIdentityId: reviewer.identityId,
      version: 1, approvalReference: "approval:mmhr-review" };
    await asAuthenticated(sql, reviewer, async (probe) => {
      await probe`SELECT public.mmhr_approve_rfp_version(${JSON.stringify(payload)}::jsonb,
        ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
    });
  }

  async function distribute(sql: SecurityTransaction, payload: Awaited<ReturnType<typeof seed>>,
    principal: SecurityPrincipal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const input = { ...payload, actorIdentityId: principal.identityId };
      const [row] = await probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_distribute_rfp_version(${JSON.stringify(input)}::jsonb,
          ${payload.correlationId}::uuid, ${payload.idempotencyKey}::uuid) AS result
      `;
      return row!.result;
    }, assurance);
  }

  test("distributes an MMHR-approved RFP and replays it", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = await seed(sql);
      await approve(sql, payload.rfpId);
      await expect(distribute(sql, payload)).resolves.toMatchObject({
        rfpId: payload.rfpId, status: "distributed", outcomeCode: "distributed",
        recipients: [expect.objectContaining({ recipientId: payload.recipients[0].recipientId,
          state: "distributed", deliveryReference: "delivery:one" })],
      });
      await expect(distribute(sql, payload)).resolves.toMatchObject({ outcomeCode: "replayed" });
    });
  }, 120_000);

  test("denies an unapproved version", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(distribute(sql, await seed(sql))).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("keeps approval provenance private and bound to the exact version, organization, and reviewer", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = await seed(sql);
      await approve(sql, payload.rfpId);
      const [proof] = await sql`
        SELECT
          mmhr_private.r4_has_mmhr_rfp_approval(${payload.rfpId}::uuid,
            ${fixture.organizationId}::uuid, ${fixture.pair[1].identityId}::uuid) AS valid,
          mmhr_private.r4_has_mmhr_rfp_approval(${randomUUID()}::uuid,
            ${fixture.organizationId}::uuid, ${fixture.pair[1].identityId}::uuid) AS wrong_version,
          mmhr_private.r4_has_mmhr_rfp_approval(${payload.rfpId}::uuid,
            ${randomUUID()}::uuid, ${fixture.pair[1].identityId}::uuid) AS wrong_organization,
          mmhr_private.r4_has_mmhr_rfp_approval(${payload.rfpId}::uuid,
            ${fixture.organizationId}::uuid, ${fixture.pair[0].identityId}::uuid) AS wrong_reviewer
      `;
      expect(proof).toMatchObject({ valid: true, wrong_version: false,
        wrong_organization: false, wrong_reviewer: false });
      const grants = await sql<{ role_name: string; allowed: boolean }[]>`
        SELECT role_name, has_function_privilege(role_name,
          'mmhr_private.r4_has_mmhr_rfp_approval(uuid,uuid,uuid)', 'EXECUTE') AS allowed
        FROM unnest(ARRAY['anon','authenticated','service_role','mmhr_worker']) AS role_name
      `;
      expect(grants).toHaveLength(4);
      expect(grants.every((grant) => !grant.allowed)).toBe(true);
    });
  }, 120_000);

  test("requires MMHR review of legacy approval and preserves its audit record", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = await seed(sql, true);
      await expect(distribute(sql, payload)).rejects.toMatchObject({ code: "42501" });
      await approve(sql, payload.rfpId);
      await expect(distribute(sql, payload)).resolves.toMatchObject({ outcomeCode: "distributed" });
      const events = await sql<{ action: string }[]>`SELECT action FROM public.audit_events
        WHERE entity_id = ${payload.rfpId} AND action IN ('rfp.approve', 'rfp.mmhr_approve') ORDER BY action`;
      expect(events.map((event) => event.action)).toEqual(["rfp.approve", "rfp.mmhr_approve"]);
    });
  }, 120_000);

  test.each(["organizationAdmin", "target"] as const)("denies distribution by external %s", async (key) => {
    await rollbackCase(context!, async (sql) => {
      const payload = await seed(sql);
      await approve(sql, payload.rfpId);
      await expect(distribute(sql, payload, fixture[key])).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("denies distribution without MFA", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = await seed(sql);
      await approve(sql, payload.rfpId);
      await expect(distribute(sql, payload, fixture.pair[0], "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
