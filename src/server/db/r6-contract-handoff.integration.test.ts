import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { applyMigrationsBeforeContractPortal } from "./test/r6-contract-migration-fixtures";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R6 contract handoff RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture; let dealId: string; let vendorId: string; const historicalId = randomUUID();
  beforeAll(async () => { context = await startRehearsal("r6-contract-handoff"); await applyMigrationsBeforeContractPortal(context); fixture = await context.client.begin(async (sql) => { const f = await createCommandFixture(sql); const [v] = await sql<{ id: string }[]>`INSERT INTO public.orgs (name,type,status,activated_at,migration_review_required) VALUES ('Handoff vendor','vendor','active',now(),false) RETURNING id`; vendorId = v!.id; await createMembership(sql, vendorId, f.organizationAdmin, "organization_admin"); const [d] = await sql<{ id: string }[]>`INSERT INTO public.deals (organization_id,vendor_organization_id,owner_identity_id,stage,status) VALUES (${f.organizationId}::uuid,${vendorId}::uuid,${f.pair[0].identityId}::uuid,'contracting','open') RETURNING id`; dealId = d!.id;
      await asAuthenticated(sql, f.pair[0], async probe => {
        const input = { action: "create", handoffId: historicalId, organizationId: f.organizationId,
          actorIdentityId: f.pair[0].identityId, dealId, customerOrganizationId: f.organizationId,
          vendorOrganizationId: vendorId, approvedAt: new Date().toISOString(), selectionReasons: ["Historical synthetic fit"],
          remainingRisks: ["Historical synthetic timing"], approvedByIdentityIds: [f.pair[0].identityId],
          correlationId: randomUUID(), idempotencyKey: randomUUID() };
        const [result] = await probe<{ result: Record<string, unknown> }[]>
          `SELECT public.mmhr_record_contract_handoff(${JSON.stringify(input)}::jsonb,
            ${input.correlationId}::uuid,${input.idempotencyKey}::uuid) AS result`;
        expect(result!.result).toMatchObject({ handoffId: historicalId, status: "introduction_pending", revision: 1 });
      }); return f; }); await applyAllMigrations(context); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("requires current staff authority for historical transitions", async () => {
    await rollbackCase(context!, async sql => {
      for (const [principal, assurance] of [
        [fixture.organizationAdmin, "aal2"], [fixture.pair[0], "aal1"],
      ] as const) {
        const input = { action: "transition", handoffId: historicalId, organizationId: fixture.organizationId,
          actorIdentityId: principal.identityId, fromStatus: "introduction_pending", toStatus: "introduced",
          expectedRevision: 1, reason: "Synthetic unauthorized historical transition", occurredAt: new Date().toISOString() };
        await expect(asAuthenticated(sql, principal, async probe => probe`
          SELECT public.mmhr_record_contract_handoff(${JSON.stringify(input)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)
        `, assurance)).rejects.toMatchObject({ code: "42501" });
      }
      const [record] = await sql`SELECT status, revision FROM public.contract_handoffs WHERE id=${historicalId}::uuid`;
      expect(record).toEqual({ status: "introduction_pending", revision: 1 });
    });
  });
  test("preserves historical records and their audited transitions", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_contract_handoff(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`; return row!.result; });
      const base = () => ({ organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, correlationId: randomUUID(), idempotencyKey: randomUUID() }); const id = historicalId;
      const create = { ...base(), action: "create", handoffId: id, dealId, customerOrganizationId: fixture.organizationId, vendorOrganizationId: vendorId, approvedAt: new Date().toISOString(), selectionReasons: ["approved fit"], remainingRisks: ["implementation timing"], approvedByIdentityIds: [fixture.pair[0].identityId] };
      await expect(invoke({ ...create, handoffId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
      const [historical] = await sql`SELECT status, revision FROM public.contract_handoffs WHERE id=${id}::uuid`;
      expect(historical).toEqual({ status: "introduction_pending", revision: 1 });
      await expect(invoke({ ...base(), action: "transition", handoffId: id, fromStatus: "introduction_pending", toStatus: "introduced", expectedRevision: 1, reason: "Introduce parties", occurredAt: new Date().toISOString() })).resolves.toMatchObject({ status: "introduced", revision: 2 });
      await expect(invoke({ ...base(), action: "transition", handoffId: id, fromStatus: "introduced", toStatus: "negotiating", expectedRevision: 2, reason: "Direct negotiation begins", occurredAt: new Date().toISOString() })).resolves.toMatchObject({ status: "negotiating", revision: 3 });
      await expect(invoke({ ...base(), action: "transition", handoffId: id, fromStatus: "negotiating", toStatus: "signed", expectedRevision: 3, reason: "Vendor and customer signed", occurredAt: new Date().toISOString() })).resolves.toMatchObject({ status: "signed", revision: 4 });
    });
  }, 120_000);
});
