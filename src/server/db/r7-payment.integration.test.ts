import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, applyMigrationsBeforeFinanceCalculation, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";

describe("R7 payment approval and original receipts", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture, eventId: string, vendorId: string, dealId: string, structureId: string;
  let historicalPayment: Record<string, unknown>, historicalSnapshot: unknown, beforeProperties: unknown;
  const payment = (amount = 2500, targetEvent = eventId) => ({ paymentId: randomUUID(), commissionEventId: targetEvent,
    organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, amountMinorUnits: amount,
    receivedAt: new Date().toISOString(), state: "received", correlationId: randomUUID(), idempotencyKey: randomUUID() });
  async function invoke(sql: SecurityTransaction, payload: Record<string, unknown>, principal: SecurityPrincipal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2", request?: { correlationId: string; idempotencyKey: string }) {
    return asAuthenticated(sql, principal, async probe => {
      const [row] = await probe<{ result: Record<string, unknown> }[]>
        `SELECT public.mmhr_record_commission_payment(${JSON.stringify(payload)}::jsonb,
          ${request?.correlationId ?? String(payload.correlationId)}::uuid,${request?.idempotencyKey ?? String(payload.idempotencyKey)}::uuid) AS result`;
      return row!.result;
    }, assurance);
  }
  async function seedEvent(sql: SecurityTransaction) {
    const id = randomUUID();
    await sql`INSERT INTO public.commission_events(id,organization_id,contract_id,deal_id,vendor_organization_id,
      structure_id,idempotency_key,signed_at,currency,contract_value_minor_units,commission_amount_minor_units,calculation_revision,state)
      VALUES(${id}::uuid,${fixture.organizationId}::uuid,${randomUUID()}::uuid,${dealId}::uuid,${vendorId}::uuid,
      ${structureId}::uuid,${randomUUID()}::uuid,now(),'USD',100000,5000,1,'approved')`;
    return id;
  }
  async function snapshot(sql: SecurityTransaction, targetEvent: string) {
    const [row] = await sql`SELECT jsonb_build_object(
      'event',(SELECT to_jsonb(e) FROM public.commission_events e WHERE id=${targetEvent}::uuid),
      'payments',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.commission_payments p WHERE commission_event_id=${targetEvent}::uuid),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r
        WHERE command='r7.payment' AND entity_id IN (SELECT id FROM public.commission_payments WHERE commission_event_id=${targetEvent}::uuid)),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a
        WHERE command='r7.payment' AND entity_id IN (SELECT id::text FROM public.commission_payments WHERE commission_event_id=${targetEvent}::uuid))) AS state`;
    return row!.state;
  }
  beforeAll(async () => {
    context = await startRehearsal("r7-payment");
    await applyMigrationsBeforeFinanceCalculation(context);
    beforeProperties = await context.client`SELECT oid,proowner,proacl::text AS permissions,prosecdef,proconfig,
      provolatile,proparallel,prorettype,proretset,proargtypes::text AS argument_types FROM pg_proc
      WHERE oid IN ('public.mmhr_record_commission_payment(jsonb,uuid,uuid)'::regprocedure,
        'mmhr_private.r1_audit_summary_is_safe(jsonb)'::regprocedure) ORDER BY oid`;
    await context.client.begin(async sql => {
      fixture = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
        VALUES('Synthetic payment vendor','vendor','active',now(),false) RETURNING id`;
      vendorId = vendor!.id;
      await createMembership(sql, vendorId, fixture.organizationAdmin, "organization_admin");
      const [deal] = await sql<{ id: string }[]>`INSERT INTO public.deals(organization_id,vendor_organization_id,owner_identity_id,stage,status)
        VALUES(${fixture.organizationId}::uuid,${vendorId}::uuid,${fixture.pair[0].identityId}::uuid,'won','won') RETURNING id`;
      dealId = deal!.id; structureId = randomUUID();
      await sql`INSERT INTO public.commission_structures(id,organization_id,vendor_organization_id,effective_from,calculation_type,
        rate_basis_points,currency,source_agreement_id,revision,created_by_identity_id)
        VALUES(${structureId}::uuid,${fixture.organizationId}::uuid,${vendorId}::uuid,now()-interval '1 day',
          'contract_value_rate',500,'USD',${randomUUID()}::uuid,1,${fixture.pair[0].identityId}::uuid)`;
      eventId = await seedEvent(sql);
      historicalPayment = payment(1000, await seedEvent(sql));
      expect(await invoke(sql, historicalPayment)).toMatchObject({ eventState: "partially_paid", outcomeCode: "recorded" });
      historicalSnapshot = await snapshot(sql, String(historicalPayment.commissionEventId));
    });
    await applyAllMigrations(context);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("preserves historical financial rows and fails closed when original outcome evidence is absent", async () => {
    await rollbackCase(context!, async sql => {
      expect(await snapshot(sql, String(historicalPayment.commissionEventId))).toEqual(historicalSnapshot);
      await expect(invoke(sql, historicalPayment)).rejects.toMatchObject({ code: "42501", message: "Original payment receipt unavailable" });
      expect(await snapshot(sql, String(historicalPayment.commissionEventId))).toEqual(historicalSnapshot);
    });
  });
  test("preserves function identity, permissions, security mode, execution properties, and return type", async () => {
    const properties = await context!.client`SELECT oid,proowner,proacl::text AS permissions,prosecdef,proconfig,
      provolatile,proparallel,prorettype,proretset,proargtypes::text AS argument_types FROM pg_proc
      WHERE oid IN ('public.mmhr_record_commission_payment(jsonb,uuid,uuid)'::regprocedure,
        'mmhr_private.r1_audit_summary_is_safe(jsonb)'::regprocedure) ORDER BY oid`;
    expect(properties).toEqual(beforeProperties);
  });
  test.each(["pending_review", "disputed", "adjusted", "voided", "written_off", "paid"].flatMap(state => ["received", "reversed"].map(paymentState => [state, paymentState] as const)))("denies %s event for new %s payment without writes", async (state, paymentState) => {
    await rollbackCase(context!, async sql => {
      await sql`UPDATE public.commission_events SET state=${state} WHERE id=${eventId}::uuid`;
      const before = await snapshot(sql, eventId);
      await expect(invoke(sql, { ...payment(), state: paymentState })).rejects.toMatchObject({ code: "42501", message: "Payment event denied" });
      expect(await snapshot(sql, eventId)).toEqual(before);
    });
  });
  test.each(["approved", "invoiced"])("records partial and full payments from %s with immutable original replay", async state => {
    await rollbackCase(context!, async sql => {
      await sql`UPDATE public.commission_events SET state=${state} WHERE id=${eventId}::uuid`;
      const first = payment(), second = payment();
      expect(await invoke(sql, first)).toMatchObject({ paymentId: first.paymentId, commissionEventId: eventId, eventState: "partially_paid", outcomeCode: "recorded" });
      expect(await invoke(sql, second)).toMatchObject({ eventState: "paid", outcomeCode: "recorded" });
      const before = await snapshot(sql, eventId);
      expect(await invoke(sql, first)).toMatchObject({ paymentId: first.paymentId, commissionEventId: eventId, eventState: "partially_paid", outcomeCode: "replayed" });
      expect(await invoke(sql, second)).toMatchObject({ eventState: "paid", outcomeCode: "replayed" });
      expect(await snapshot(sql, eventId)).toEqual(before);
      const [audits] = await sql`SELECT jsonb_agg(after_summary ORDER BY occurred_at) AS summaries FROM public.audit_events
        WHERE command='r7.payment' AND entity_id IN (${first.paymentId},${second.paymentId})`;
      expect(audits!.summaries).toEqual([{ status: "completed", finance_state: "partially_paid" }, { status: "completed", finance_state: "paid" }]);
    });
  });
  test("rejects overpayment and changed-payload retries without duplicating writes", async () => {
    await rollbackCase(context!, async sql => {
      const first = payment(); await invoke(sql, first);
      const before = await snapshot(sql, eventId);
      await expect(invoke(sql, { ...first, amountMinorUnits: 1000 })).rejects.toMatchObject({ code: "22023", message: "Invalid security command input" });
      await expect(invoke(sql, payment(3000))).rejects.toMatchObject({ code: "22023", message: "Payment exceeds commission balance" });
      expect(await snapshot(sql, eventId)).toEqual(before);
    });
  });
  test.each(["customer", "vendor_admin", "foreign_scope", "aal1", "revoked_session"])("denies %s for original writes and replay", async restriction => {
    await rollbackCase(context!, async sql => {
      const original = payment(); await invoke(sql, original);
      const before = await snapshot(sql, eventId);
      if (restriction === "revoked_session") await sql`DELETE FROM auth.sessions WHERE id=${fixture.pair[0].sessionId}::uuid`;
      const principal = restriction === "customer" ? fixture.target : restriction === "vendor_admin" ? fixture.organizationAdmin : fixture.pair[0];
      for (const payload of [original, payment()]) {
        const attempt = { ...payload, actorIdentityId: principal.identityId,
          ...(restriction === "foreign_scope" ? { organizationId: vendorId } : {}) };
        await expect(invoke(sql, attempt, principal, restriction === "aal1" ? "aal1" : "aal2")).rejects.toMatchObject({ code: "42501" });
      }
      expect(await snapshot(sql, eventId)).toEqual(before);
    });
  });
  test.each(["correlationId", "idempotencyKey"].flatMap(field => ["altered", "missing"].map(mode => [field, mode] as const)))("denies %s %s for new writes and replay", async (field, mode) => {
    await rollbackCase(context!, async sql => {
      const original = payment(); await invoke(sql, original);
      const before = await snapshot(sql, eventId);
      for (const payload of [original, payment()]) {
        const altered: Record<string, unknown> = { ...payload };
        if (mode === "missing") delete altered[field]; else altered[field] = randomUUID();
        await expect(invoke(sql, altered, fixture.pair[0], "aal2", { correlationId: payload.correlationId, idempotencyKey: payload.idempotencyKey }))
          .rejects.toMatchObject({ code: "42501" });
      }
      expect(await snapshot(sql, eventId)).toEqual(before);
    });
  });
  test("audit failure rolls back payment, event state, and receipt", async () => {
    await rollbackCase(context!, async sql => {
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r7_payment_audit_failure CHECK (false) NOT VALID`;
      const before = await snapshot(sql, eventId);
      await expect(invoke(sql, payment())).rejects.toMatchObject({ code: "23514", constraint_name: "r7_payment_audit_failure" });
      expect(await snapshot(sql, eventId)).toEqual(before);
    });
  });
  test.each(["approved", "invoiced", "partially_paid", "paid"])("permits bounded finance_state %s only", async financeState => {
    const [result] = await context!.client`SELECT mmhr_private.r1_audit_summary_is_safe(${JSON.stringify({ status: "completed", finance_state: financeState })}::jsonb) AS safe`;
    expect(result!.safe).toBe(true);
  });
  test.each([{ finance_state: "pending_review" }, { finance_state: "disputed" }, { finance_state: "adjusted" },
    { finance_state: "voided" }, { finance_state: "written_off" }, { finance_state: 5000 },
    { finance_state: "paid", amountMinorUnits: 5000 }, { finance_state: "paid", money: "5000" }, { finance_state: "unknown" },
    { finance_state: null }, { finance_state: ["paid"] }, { finance_state: { state: "paid" } }])(
    "rejects unsafe audit summary %j", async summary => {
      const [result] = await context!.client`SELECT mmhr_private.r1_audit_summary_is_safe(${JSON.stringify(summary)}::jsonb) AS safe`;
      expect(result!.safe).toBe(false);
    });
});
