import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R7 dispute RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let eventId: string;

  beforeAll(async () => {
    context = await startRehearsal("r7-dispute");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('Dispute vendor', 'vendor', 'active', now(), false)
        RETURNING id
      `;
      await createMembership(sql, vendor!.id, f.organizationAdmin, "organization_admin");
      const [deal] = await sql<{ id: string }[]>`
        INSERT INTO public.deals (organization_id, vendor_organization_id, owner_identity_id, stage, status)
        VALUES (${f.organizationId}::uuid, ${vendor!.id}::uuid, ${f.pair[0].identityId}::uuid, 'won', 'won')
        RETURNING id
      `;
      const structureId = randomUUID();
      await sql`
        INSERT INTO public.commission_structures (
          id, organization_id, vendor_organization_id, effective_from, calculation_type,
          rate_basis_points, currency, source_agreement_id, revision, created_by_identity_id
        ) VALUES (
          ${structureId}::uuid, ${f.organizationId}::uuid, ${vendor!.id}::uuid,
          now() - interval '1 day', 'contract_value_rate', 500, 'USD', ${randomUUID()}::uuid,
          1, ${f.pair[0].identityId}::uuid
        )
      `;
      eventId = randomUUID();
      await sql`
        INSERT INTO public.commission_events (
          id, organization_id, contract_id, deal_id, vendor_organization_id, structure_id,
          idempotency_key, signed_at, currency, contract_value_minor_units,
          commission_amount_minor_units, calculation_revision, state
        ) VALUES (
          ${eventId}::uuid, ${f.organizationId}::uuid, ${randomUUID()}::uuid, ${deal!.id}::uuid,
          ${vendor!.id}::uuid, ${structureId}::uuid, ${randomUUID()}::uuid, now(), 'USD',
          100000, 5000, 1, 'approved'
        )
      `;
      return f;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("opens, resolves, and replays a scoped dispute", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_commission_dispute(
            ${JSON.stringify(payload)}::jsonb,
            ${String(payload.correlationId)}::uuid,
            ${String(payload.idempotencyKey)}::uuid
          ) AS result
        `;
        return row!.result;
      });
      const disputeId = randomUUID();
      const opened = {
        disputeId,
        commissionEventId: eventId,
        organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId,
        action: "open",
        openedAt: new Date().toISOString(),
        reasonCode: "amount",
        reason: "Verify the commission amount against the signed agreement.",
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
      };
      await expect(invoke(opened)).resolves.toMatchObject({ disputeId, status: "open", outcomeCode: "recorded" });
      await expect(invoke(opened)).resolves.toMatchObject({ disputeId, outcomeCode: "replayed" });
      const resolved = {
        disputeId,
        organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId,
        action: "resolve",
        resolvedByIdentityId: fixture.pair[0].identityId,
        resolvedAt: new Date().toISOString(),
        resolution: "Confirmed the amount and closed the dispute.",
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
      };
      await expect(invoke(resolved)).resolves.toMatchObject({ disputeId, status: "resolved", outcomeCode: "recorded" });
      const [event] = await sql<{ state: string }[]>`SELECT state FROM public.commission_events WHERE id = ${eventId}::uuid`;
      expect(event!.state).toBe("approved");
    });
  }, 120_000);
});
