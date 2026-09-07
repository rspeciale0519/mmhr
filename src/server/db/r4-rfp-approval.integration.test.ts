import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createMembership, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";

describe("R4 RFP approval RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-rfp-approval");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const result = await createCommandFixture(sql);
      await createMembership(sql, result.organizationId, result.pair[1]);
      await sql`INSERT INTO public.user_permission_overrides
        (identity_id, permission_key, scope_kind, organization_id, scope_key,
          effect, issued_by_identity_id, issue_reason)
        VALUES (${result.pair[1].identityId}::uuid, 'workspace.access', 'organization',
          ${result.organizationId}::uuid, ${`organization:${result.organizationId}`},
          'allow', ${result.pair[0].identityId}::uuid, 'Isolated RFP reviewer workspace')`;
      return result;
    });
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function draft(sql: SecurityTransaction) {
    const intakeId = randomUUID();
    const rfpId = randomUUID();
    await sql`INSERT INTO public.intakes
      (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id)
      VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 1, clock_timestamp(),
        ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions
      (id, organization_id, rfp_id, source_intake_id, version, title, sections, created_by_identity_id)
      VALUES (${rfpId}::uuid, ${fixture.organizationId}::uuid, ${rfpId}::uuid, ${intakeId}::uuid,
        1, 'RFP', '[{"sectionKey":"fit","title":"Fit","questionCount":2}]'::jsonb,
        ${fixture.pair[0].identityId}::uuid)`;
    return rfpId;
  }

  function command(rfpId: string, principal: SecurityPrincipal) {
    return { rfpId, organizationId: fixture.organizationId, actorIdentityId: principal.identityId,
      version: 1, approvalReference: "approval:review-1",
      correlationId: randomUUID(), idempotencyKey: randomUUID() };
  }

  async function invoke(sql: SecurityTransaction, principal: SecurityPrincipal,
    payload: ReturnType<typeof command>, assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_approve_rfp_version(${JSON.stringify(payload)}::jsonb,
          ${payload.correlationId}::uuid, ${payload.idempotencyKey}::uuid) AS result
      `;
      return row!.result;
    }, assurance);
  }

  test("approves a draft with a distinct MMHR reviewer and replays it", async () => {
    await rollbackCase(context!, async (sql) => {
      const rfpId = await draft(sql);
      const reviewer = fixture.pair[1];
      const payload = command(rfpId, reviewer);
      await expect(invoke(sql, reviewer, payload)).resolves.toMatchObject({
        rfpId, organizationId: fixture.organizationId, version: 1, status: "approved",
        approvedByIdentityId: reviewer.identityId, approvalReference: "approval:review-1", outcomeCode: "approved",
      });
      await expect(invoke(sql, reviewer, payload)).resolves.toMatchObject({ rfpId, outcomeCode: "replayed" });
    });
  }, 120_000);

  test.each(["organizationAdmin", "target"] as const)("denies approval by an external %s", async (key) => {
    await rollbackCase(context!, async (sql) => {
      const principal = fixture[key];
      await expect(invoke(sql, principal, command(await draft(sql), principal)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("denies self-approval", async () => {
    await rollbackCase(context!, async (sql) => {
      const author = fixture.pair[0];
      await expect(invoke(sql, author, command(await draft(sql), author)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("denies external approval even with an explicit permission override", async () => {
    await rollbackCase(context!, async (sql) => {
      const principal = fixture.organizationAdmin;
      await sql`INSERT INTO public.user_permission_overrides
        (identity_id, permission_key, scope_kind, organization_id, scope_key,
          effect, issued_by_identity_id, issue_reason)
        VALUES (${principal.identityId}::uuid, 'rfp.approve', 'organization',
          ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`},
          'allow', ${fixture.pair[0].identityId}::uuid, 'Isolated external override denial')`;
      await expect(invoke(sql, principal, command(await draft(sql), principal)))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("denies approval without MFA", async () => {
    await rollbackCase(context!, async (sql) => {
      const reviewer = fixture.pair[1];
      await expect(invoke(sql, reviewer, command(await draft(sql), reviewer), "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
