import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, applyMigrationsBeforeFinanceCalculation, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";

describe("R7 invoice original action receipts", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture, eventId: string, vendorId: string;
  let beforeProperties: unknown;
  let historicalCommands: Record<string, unknown>[], historicalSnapshot: unknown;
  const base = (invoiceId: string = randomUUID()) => ({ invoiceId, organizationId: fixture.organizationId,
    actorIdentityId: fixture.pair[0].identityId, correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const draft = () => ({ ...base(), action: "create", commissionEventId: eventId, vendorOrganizationId: vendorId,
    currency: "USD", amountMinorUnits: 5000, supportingDocumentReferences: [], createdByIdentityId: fixture.pair[0].identityId });
  const issue = (invoiceId: string) => ({ ...base(invoiceId), action: "issue", invoiceNumber: "INV-SYNTHETIC",
    issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 86400000).toISOString() });
  async function invoke(sql: SecurityTransaction, payload: Record<string, unknown>, principal: SecurityPrincipal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2", request?: { correlationId: string; idempotencyKey: string }) {
    return asAuthenticated(sql, principal, async probe => {
      const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_invoice(
        ${JSON.stringify(payload)}::jsonb,${request?.correlationId ?? String(payload.correlationId)}::uuid,${request?.idempotencyKey ?? String(payload.idempotencyKey)}::uuid) AS result`;
      return row!.result;
    }, assurance);
  }
  async function snapshot(sql: SecurityTransaction, originalInvoiceFields = false) {
    const [row] = await sql`SELECT jsonb_build_object(
      'invoices',(SELECT coalesce(jsonb_agg(CASE WHEN ${originalInvoiceFields} THEN to_jsonb(i) - ARRAY['source_mode','invoice_revision','current_preparation_id'] ELSE to_jsonb(i) END ORDER BY id),'[]'::jsonb) FROM public.finance_invoices i WHERE commission_event_id=${eventId}::uuid),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r
        WHERE command='r7.invoice' AND entity_id IN (SELECT id FROM public.finance_invoices WHERE commission_event_id=${eventId}::uuid)),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a
        WHERE command='r7.invoice' AND entity_id IN (SELECT id::text FROM public.finance_invoices WHERE commission_event_id=${eventId}::uuid))) AS state`;
    return row!.state;
  }
  beforeAll(async () => {
    context = await startRehearsal("r7-invoice");
    await applyMigrationsBeforeFinanceCalculation(context);
    [beforeProperties] = await context.client`SELECT oid,proowner,proacl::text AS permissions,prosecdef,proconfig,
      provolatile,proparallel,prorettype,proretset,proargtypes::text AS argument_types FROM pg_proc
      WHERE oid='public.mmhr_record_invoice(jsonb,uuid,uuid)'::regprocedure`;
    fixture = await context.client.begin(async sql => {
      const fixture = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
        VALUES('Synthetic invoice vendor','vendor','active',now(),false) RETURNING id`;
      vendorId = vendor!.id;
      await createMembership(sql, vendorId, fixture.organizationAdmin, "organization_admin");
      const [deal] = await sql<{ id: string }[]>`INSERT INTO public.deals(organization_id,vendor_organization_id,owner_identity_id,stage,status)
        VALUES(${fixture.organizationId}::uuid,${vendorId}::uuid,${fixture.pair[0].identityId}::uuid,'won','won') RETURNING id`;
      const structureId = randomUUID();
      await sql`INSERT INTO public.commission_structures(id,organization_id,vendor_organization_id,effective_from,calculation_type,
        rate_basis_points,currency,source_agreement_id,revision,created_by_identity_id)
        VALUES(${structureId}::uuid,${fixture.organizationId}::uuid,${vendorId}::uuid,now()-interval '1 day',
          'contract_value_rate',500,'USD',${randomUUID()}::uuid,1,${fixture.pair[0].identityId}::uuid)`;
      eventId = randomUUID();
      await sql`INSERT INTO public.commission_events(id,organization_id,contract_id,deal_id,vendor_organization_id,structure_id,
        idempotency_key,signed_at,currency,contract_value_minor_units,commission_amount_minor_units,calculation_revision,state)
        VALUES(${eventId}::uuid,${fixture.organizationId}::uuid,${randomUUID()}::uuid,${deal!.id}::uuid,${vendorId}::uuid,
          ${structureId}::uuid,${randomUUID()}::uuid,now(),'USD',100000,5000,1,'approved')`;
      return fixture;
    });
    await context.client.begin(async sql => {
      const create = draft(), issued = issue(create.invoiceId), voided = { ...base(create.invoiceId), action: "void" };
      historicalCommands = [create, issued, voided];
      for (const [payload, status] of [[create, "draft"], [issued, "issued"], [voided, "voided"]] as const) {
        expect(await invoke(sql, payload)).toMatchObject({ invoiceId: create.invoiceId, status, outcomeCode: "recorded" });
      }
      historicalSnapshot = await snapshot(sql);
    });
    await applyAllMigrations(context);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("replays historical create, issue, and void receipts after migration without changing original records", async () => {
    await rollbackCase(context!, async sql => {
      const migratedSnapshot = await snapshot(sql);
      expect(await snapshot(sql, true)).toEqual(historicalSnapshot);
      const defaults = await sql`SELECT id, source_mode, invoice_revision, current_preparation_id
        FROM public.finance_invoices WHERE commission_event_id=${eventId}::uuid ORDER BY id`;
      expect(defaults).toEqual([{ id: historicalCommands[0]!.invoiceId, source_mode: "legacy",
        invoice_revision: 0, current_preparation_id: null }]);
      for (const [index, payload] of historicalCommands.entries()) {
        expect(await invoke(sql, payload)).toEqual({ invoiceId: payload.invoiceId, organizationId: fixture.organizationId,
          status: ["draft", "issued", "voided"][index], outcomeCode: "replayed", correlationId: payload.correlationId });
      }
      expect(await snapshot(sql)).toEqual(migratedSnapshot);
    });
  });

  test("retains the original create, issue, and void receipt after later invoice transitions", async () => {
    await rollbackCase(context!, async sql => {
      const create = draft(), issued = issue(create.invoiceId), voided = { ...base(create.invoiceId), action: "void" };
      expect(await invoke(sql, create)).toMatchObject({ invoiceId: create.invoiceId, status: "draft", outcomeCode: "recorded" });
      expect(await invoke(sql, issued)).toMatchObject({ status: "issued", outcomeCode: "recorded" });
      expect(await invoke(sql, create)).toMatchObject({ status: "draft", outcomeCode: "replayed" });
      expect(await invoke(sql, voided)).toMatchObject({ status: "voided", outcomeCode: "recorded" });
      const before = await snapshot(sql);
      for (const [payload, status] of [[create, "draft"], [issued, "issued"], [voided, "voided"]] as const) {
        expect(await invoke(sql, payload)).toEqual({ invoiceId: create.invoiceId, organizationId: fixture.organizationId,
          status, outcomeCode: "replayed", correlationId: payload.correlationId });
      }
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test("rejects changed-payload and changed-action retries without new financial records", async () => {
    await rollbackCase(context!, async sql => {
      const create = draft(); await invoke(sql, create);
      const before = await snapshot(sql);
      await expect(invoke(sql, { ...create, amountMinorUnits: 4999 })).rejects.toMatchObject({ code: "22023", message: "Invalid security command input" });
      await expect(invoke(sql, { ...issue(create.invoiceId), correlationId: create.correlationId, idempotencyKey: create.idempotencyKey })).rejects.toMatchObject({ code: "22023", message: "Invalid security command input" });
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test.each(["pending_review", "disputed", "adjusted", "voided", "written_off"])("denies invoice creation for %s", async state => {
    await rollbackCase(context!, async sql => {
      await sql`UPDATE public.commission_events SET state=${state} WHERE id=${eventId}::uuid`;
      const before = await snapshot(sql);
      await expect(invoke(sql, draft())).rejects.toMatchObject({ code: "42501", message: "Invoice event denied" });
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test.each(["customer", "vendor_admin", "foreign_scope", "aal1", "revoked_session"])("denies %s writes and replay", async restriction => {
    await rollbackCase(context!, async sql => {
      const original = draft(); await invoke(sql, original);
      const before = await snapshot(sql);
      if (restriction === "revoked_session") await sql`DELETE FROM auth.sessions WHERE id=${fixture.pair[0].sessionId}::uuid`;
      const principal = restriction === "customer" ? fixture.target : restriction === "vendor_admin" ? fixture.organizationAdmin : fixture.pair[0];
      for (const payload of [original, draft()]) {
        const attempt = { ...payload, actorIdentityId: principal.identityId, createdByIdentityId: principal.identityId,
          ...(restriction === "foreign_scope" ? { organizationId: vendorId } : {}) };
        await expect(invoke(sql, attempt, principal, restriction === "aal1" ? "aal1" : "aal2")).rejects.toMatchObject({ code: "42501" });
      }
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test("rejects invalid due dates and terminal-state mutations", async () => {
    await rollbackCase(context!, async sql => {
      const create = draft(); await invoke(sql, create);
      const before = await snapshot(sql);
      await expect(invoke(sql, { ...issue(create.invoiceId), dueDate: new Date(Date.now() - 86400000).toISOString() })).rejects.toMatchObject({ code: "22023" });
      expect(await snapshot(sql)).toEqual(before);
      await invoke(sql, { ...base(create.invoiceId), action: "void" });
      const terminal = await snapshot(sql);
      await expect(invoke(sql, issue(create.invoiceId))).rejects.toMatchObject({ code: "22023" });
      expect(await snapshot(sql)).toEqual(terminal);
    });
  });
  test.each(["correlationId", "idempotencyKey"].flatMap(field => ["altered", "missing"].map(mode => [field, mode] as const)))("denies %s %s for new writes and replay", async (field, mode) => {
    await rollbackCase(context!, async sql => {
      const original = draft(); await invoke(sql, original);
      const before = await snapshot(sql);
      for (const payload of [original, draft()]) {
        const altered: Record<string, unknown> = { ...payload };
        if (mode === "missing") delete altered[field]; else altered[field] = randomUUID();
        await expect(invoke(sql, altered, fixture.pair[0], "aal2", { correlationId: payload.correlationId, idempotencyKey: payload.idempotencyKey }))
          .rejects.toMatchObject({ code: "42501" });
      }
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test("denies caller-selected invoice creator for new writes and replay", async () => {
    await rollbackCase(context!, async sql => {
      const original = draft(); await invoke(sql, original);
      const before = await snapshot(sql);
      for (const payload of [original, draft()]) {
        await expect(invoke(sql, { ...payload, createdByIdentityId: fixture.target.identityId })).rejects.toMatchObject({ code: "42501" });
      }
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test("audit failure rolls back invoice and receipt", async () => {
    await rollbackCase(context!, async sql => {
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r7_invoice_audit_failure CHECK (false) NOT VALID`;
      const before = await snapshot(sql);
      await expect(invoke(sql, draft())).rejects.toMatchObject({ code: "23514", constraint_name: "r7_invoice_audit_failure" });
      expect(await snapshot(sql)).toEqual(before);
    });
  });
  test("preserves function identity, permissions, security mode, execution properties, and return type", async () => {
    const [properties] = await context!.client`SELECT oid,proowner,proacl::text AS permissions,prosecdef,proconfig,
      provolatile,proparallel,prorettype,proretset,proargtypes::text AS argument_types FROM pg_proc
      WHERE oid='public.mmhr_record_invoice(jsonb,uuid,uuid)'::regprocedure`;
    expect(properties).toEqual(beforeProperties);
  });
});
