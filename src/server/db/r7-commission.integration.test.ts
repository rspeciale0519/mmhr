import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R7 commission RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture; let dealId: string; let vendorId: string;
  beforeAll(async () => { context = await startRehearsal("r7-commission"); await applyAllMigrations(context); fixture = await context.client.begin(async (sql) => { const f = await createCommandFixture(sql); const [v] = await sql<{ id: string }[]>`INSERT INTO public.orgs (name,type,status,activated_at,migration_review_required) VALUES ('Commission vendor','vendor','active',now(),false) RETURNING id`; vendorId = v!.id; await createMembership(sql, vendorId, f.organizationAdmin, "organization_admin"); const [d] = await sql<{ id: string }[]>`INSERT INTO public.deals (organization_id,vendor_organization_id,owner_identity_id,stage,status) VALUES (${f.organizationId}::uuid,${vendorId}::uuid,${f.pair[0].identityId}::uuid,'won','won') RETURNING id`; dealId = d!.id; return f; }); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("all seven finance RPCs require finance authority", async () => {
    const names = ["mmhr_record_commission", "mmhr_record_commission_payment", "mmhr_record_invoice",
      "mmhr_record_commission_dispute", "mmhr_record_finance_adjustment",
      "mmhr_record_finance_handoff", "mmhr_record_finance_reconciliation"];
    const definitions = await context!.client<{ name: string; definition: string }[]>`
      SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY(${names}::text[])
    `;
    expect(definitions).toHaveLength(7);
    for (const { definition } of definitions) {
      expect(definition).toContain("r1_start_security_command('finance.manage'");
      expect(definition).not.toContain("r1_start_security_command('workspace.access'");
    }
  });
  test("denies finance writes without MFA", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = { action: "create_structure", organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`SELECT public.mmhr_record_commission(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      }, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
  test.each(["organizationAdmin", "target"] as const)("denies commission writes by an external %s", async (principalKey) => {
    await rollbackCase(context!, async (sql) => {
      const principal = fixture[principalKey];
      const payload = {
        organizationId: fixture.organizationId, actorIdentityId: principal.identityId,
        action: "create_structure", structureId: randomUUID(), vendorOrganizationId: vendorId,
        effectiveFrom: new Date().toISOString(), effectiveTo: null,
        calculationType: "contract_value_rate", rateBasisPoints: 500,
        flatAmountMinorUnits: null, currency: "USD", sourceAgreementId: randomUUID(), revision: 1,
      };
      await expect(asAuthenticated(sql, principal, async (probe) => {
        await probe`SELECT public.mmhr_record_commission(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      })).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
  test("records a rate structure and idempotent event", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_commission(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`; return row!.result; });
      const base = () => ({ organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, correlationId: randomUUID(), idempotencyKey: randomUUID() }); const structureId = randomUUID();
      const structure = { ...base(), action: "create_structure", structureId, vendorOrganizationId: vendorId, effectiveFrom: new Date().toISOString(), effectiveTo: null, calculationType: "contract_value_rate", rateBasisPoints: 500, flatAmountMinorUnits: null, currency: "USD", sourceAgreementId: randomUUID(), revision: 1 };
      await expect(invoke(structure)).resolves.toMatchObject({ entityId: structureId, status: "active" });
      const event = { ...base(), action: "create_event", eventId: randomUUID(), contractId: randomUUID(), dealId, vendorOrganizationId: vendorId, structureId, eventIdempotencyKey: randomUUID(), signedAt: new Date().toISOString(), currency: "USD", contractValueMinorUnits: 100000, commissionAmountMinorUnits: 5000, calculationRevision: 1 };
      await expect(invoke(event)).resolves.toMatchObject({ status: "pending_review" }); await expect(invoke(event)).resolves.toMatchObject({ outcomeCode: "replayed" });
    });
  }, 120_000);
});
