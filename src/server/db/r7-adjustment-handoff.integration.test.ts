import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R7 adjustment and finance handoff RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let adjustmentEventId: string;
  let handoffEventId: string;

  beforeAll(async () => {
    context = await startRehearsal("r7-adjustment-handoff");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('Finance vendor', 'vendor', 'active', now(), false) RETURNING id
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
      const insertEvent = async (state: string) => {
        const id = randomUUID();
        await sql`
          INSERT INTO public.commission_events (
            id, organization_id, contract_id, deal_id, vendor_organization_id, structure_id,
            idempotency_key, signed_at, currency, contract_value_minor_units,
            commission_amount_minor_units, calculation_revision, state
          ) VALUES (${id}::uuid, ${f.organizationId}::uuid, ${randomUUID()}::uuid, ${deal!.id}::uuid,
            ${vendor!.id}::uuid, ${structureId}::uuid, ${randomUUID()}::uuid, now(), 'USD',
            100000, 5000, 1, ${state})
        `;
        return id;
      };
      adjustmentEventId = await insertEvent("approved");
      handoffEventId = await insertEvent("paid");
      return f;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records compensating adjustments and approved handoffs", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (name: string, payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = name === "mmhr_record_finance_adjustment"
          ? await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_finance_adjustment(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`
          : await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_finance_handoff(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const adjustment = {
        adjustmentId: randomUUID(), commissionEventId: adjustmentEventId, organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId, direction: "increase", amountMinorUnits: 250,
        reason: "Approved correction from the signed agreement.", approvedByIdentityId: fixture.pair[0].identityId,
        approvedAt: new Date().toISOString(), createdAt: new Date().toISOString(), correlationId: randomUUID(), idempotencyKey: randomUUID(),
      };
      await expect(invoke("mmhr_record_finance_adjustment", adjustment)).resolves.toMatchObject({ eventState: "adjusted", outcomeCode: "recorded" });
      await expect(invoke("mmhr_record_finance_adjustment", adjustment)).resolves.toMatchObject({ outcomeCode: "replayed" });
      const handoff = {
        handoffId: randomUUID(), organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
        destinationReference: "finance:month-end", sourceEventIds: [handoffEventId], approvedByIdentityId: fixture.pair[0].identityId,
        approvedAt: new Date().toISOString(), reason: "Approved monthly finance close.", correlationId: randomUUID(), idempotencyKey: randomUUID(),
      };
      await expect(invoke("mmhr_record_finance_handoff", handoff)).resolves.toMatchObject({ outcomeCode: "recorded" });
      await expect(invoke("mmhr_record_finance_handoff", handoff)).resolves.toMatchObject({ outcomeCode: "replayed" });
    });
  }, 120_000);
});
