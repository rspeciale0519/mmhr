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
  rollbackCase,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";

describe("R2B CRM export command RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r2b-crm-export");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    await context.client.begin(async (sql) => {
      await sql`
        INSERT INTO public.org_members (org_id, identity_id, user_id, role, role_key, migration_review_required)
        VALUES (${fixture.organizationId}::uuid, ${fixture.pair[1].identityId}::uuid,
          ${fixture.pair[1].subject}::uuid, 'admin'::public.org_role, 'organization_admin', false)
      `;
      await sql`
        INSERT INTO public.user_permission_overrides (
          identity_id, permission_key, scope_kind, organization_id, scope_key,
          effect, issued_by_identity_id, issue_reason
        ) VALUES (
          ${fixture.pair[1].identityId}::uuid, 'workspace.access', 'organization',
          ${fixture.organizationId}::uuid, ${`organization:${fixture.organizationId}`},
          'allow', ${fixture.pair[0].identityId}::uuid, 'Export rehearsal reviewer scope'
        )
      `;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, replays, and approves an export with immutable audit records", async () => {
    await rollbackCase(context!, async (sql) => {
      const exportId = randomUUID();
      const requestedAt = new Date().toISOString();
      const request = {
        exportId,
        organizationId: fixture.organizationId,
        requestedByIdentityId: fixture.pair[0].identityId,
        resource: "contact",
        fields: ["recordId", "status"],
        purpose: "Approved CRM migration",
        requestedAt,
      };
      const created = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_create_crm_export_request(${JSON.stringify(request)}::jsonb,
            ${exportId}::uuid, ${exportId}::uuid) AS result
        `;
        return row!.result;
      });
      expect(created).toMatchObject({ exportId, organizationId: fixture.organizationId, state: "pending", outcomeCode: "created" });
      const replayed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_create_crm_export_request(${JSON.stringify(request)}::jsonb,
            ${exportId}::uuid, ${exportId}::uuid) AS result
        `;
        return row!.result;
      });
      expect(replayed).toMatchObject({ exportId, state: "pending", outcomeCode: "replayed" });

      const selfDecision = { decisionId: randomUUID(), exportId, organizationId: fixture.organizationId,
        reviewerIdentityId: fixture.pair[0].identityId, decision: "approved", decidedAt: new Date().toISOString(), reason: null };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_decide_crm_export(${JSON.stringify(selfDecision)}::jsonb,
          ${selfDecision.decisionId}::uuid, ${selfDecision.decisionId}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });

      const decision = { ...selfDecision, decisionId: randomUUID(), reviewerIdentityId: fixture.pair[1].identityId,
        decidedAt: new Date().toISOString() };
      const approved = await asAuthenticated(sql, fixture.pair[1], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_decide_crm_export(${JSON.stringify(decision)}::jsonb,
            ${decision.decisionId}::uuid, ${decision.decisionId}::uuid) AS result
        `;
        return row!.result;
      });
      expect(approved).toMatchObject({ exportId, organizationId: fixture.organizationId, state: "approved", outcomeCode: "decided" });
      const [requestRow] = await sql<{ state: string; decision_id: string }[]>`
        SELECT state, decision_id FROM public.crm_export_requests WHERE id = ${exportId}::uuid
      `;
      expect(requestRow!.state).toBe("approved");
      expect(requestRow!.decision_id).toBe(decision.decisionId);
      const receipts = await sql`SELECT id FROM public.security_command_receipts WHERE idempotency_key IN (${exportId}, ${decision.decisionId})`;
      const events = await sql`SELECT id FROM public.audit_events WHERE command IN ('crm.export.request', 'crm.export.decision')`;
      expect(receipts).toHaveLength(2);
      expect(events).toHaveLength(2);
    });
  }, 120_000);
});
