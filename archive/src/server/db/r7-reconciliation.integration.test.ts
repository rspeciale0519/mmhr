import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R7 reconciliation RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let eventId: string;

  beforeAll(async () => {
    context = await startRehearsal("r7-reconciliation");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('Reconciliation vendor', 'vendor', 'active', now(), false) RETURNING id
      `;
      await createMembership(sql, vendor!.id, f.organizationAdmin, "organization_admin");
      const [deal] = await sql<{ id: string }[]>`
        INSERT INTO public.deals (organization_id, vendor_organization_id, owner_identity_id, stage, status)
        VALUES (${f.organizationId}::uuid, ${vendor!.id}::uuid, ${f.pair[0].identityId}::uuid, 'won', 'won') RETURNING id
      `;
      const structureId = randomUUID();
      await sql`
        INSERT INTO public.commission_structures (
          id, organization_id, vendor_organization_id, effective_from, calculation_type,
          rate_basis_points, currency, source_agreement_id, revision, created_by_identity_id
        ) VALUES (${structureId}::uuid, ${f.organizationId}::uuid, ${vendor!.id}::uuid,
          now() - interval '1 day', 'contract_value_rate', 500, 'USD', ${randomUUID()}::uuid, 1,
          ${f.pair[0].identityId}::uuid)
      `;
      eventId = randomUUID();
      await sql`
        INSERT INTO public.commission_events (
          id, organization_id, contract_id, deal_id, vendor_organization_id, structure_id,
          idempotency_key, signed_at, currency, contract_value_minor_units,
          commission_amount_minor_units, calculation_revision, state
        ) VALUES (${eventId}::uuid, ${f.organizationId}::uuid, ${randomUUID()}::uuid, ${deal!.id}::uuid,
          ${vendor!.id}::uuid, ${structureId}::uuid, ${randomUUID()}::uuid, now(), 'USD',
          100000, 5000, 1, 'approved')
      `;
      await sql`
        INSERT INTO public.finance_invoices (
          id, organization_id, commission_event_id, vendor_organization_id, currency,
          amount_minor_units, status, invoice_number, issue_date, due_date,
          supporting_document_references, created_by_identity_id
        ) VALUES (${randomUUID()}::uuid, ${f.organizationId}::uuid, ${eventId}::uuid,
          ${vendor!.id}::uuid, 'USD', 5000, 'issued', 'INV-RECON', now(), now() + interval '30 days',
          '[]'::jsonb, ${f.pair[0].identityId}::uuid)
      `;
      return f;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records and replays a source-reconciled report", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_finance_reconciliation(
            ${JSON.stringify(payload)}::jsonb,
            ${String(payload.correlationId)}::uuid,
            ${String(payload.idempotencyKey)}::uuid
          ) AS result
        `;
        return row!.result;
      });
      const report = {
        reportId: randomUUID(), organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
        periodStart: new Date(Date.now() - 86_400_000).toISOString(), periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
        reportRows: [{ commissionEventId: eventId, currency: "USD", earnedMinorUnits: 5000, invoicedMinorUnits: 5000, receivedMinorUnits: 0, balanceMinorUnits: 5000 }],
        correlationId: randomUUID(), idempotencyKey: randomUUID(),
      };
      await expect(invoke(report)).resolves.toMatchObject({ reportId: report.reportId, rowCount: 1, outcomeCode: "recorded" });
      await expect(invoke(report)).resolves.toMatchObject({ reportId: report.reportId, outcomeCode: "replayed" });
    });
  }, 120_000);
});
