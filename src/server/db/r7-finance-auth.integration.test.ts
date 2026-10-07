import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { recordCommissionPayment } from "@/server/commands/commission-payment";
import { recordInvoice } from "@/server/commands/invoice";

describe("R7 finance commands with genuine signed Auth sessions", () => {
  let fixture: SecurityCommandApiFixtures;
  let staff: SecurityApiPrincipal, vendorId: string, dealId: string, structureId: string;
  const actor = () => fixture.pair[0];
  const client = () => elevatedClient(actor());
  const metadata = () => ({ organizationId: fixture.organizationId, actorIdentityId: actor().identityId,
    correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const payment = (eventId: string, amountMinorUnits = 2500) => ({ ...metadata(), paymentId: randomUUID(),
    commissionEventId: eventId, amountMinorUnits, receivedAt: new Date().toISOString(), state: "received" });
  const draft = (eventId: string) => ({ ...metadata(), action: "create", invoiceId: randomUUID(),
    commissionEventId: eventId, vendorOrganizationId: vendorId, currency: "USD", amountMinorUnits: 5000,
    supportingDocumentReferences: [], createdByIdentityId: actor().identityId });
  const issue = (invoiceId: string) => ({ ...metadata(), action: "issue", invoiceId, invoiceNumber: "INV-SYNTHETIC-AUTH",
    issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 86400000).toISOString() });
  const invokePayment = (payload: unknown, supabase = client()) => recordCommissionPayment(payload, { supabase });
  const invokeInvoice = (payload: unknown, supabase = client()) => recordInvoice(payload, { supabase });

  async function seedEvent(state = "approved") {
    const id = randomUUID();
    await fixture.owner`INSERT INTO public.commission_events(id,organization_id,contract_id,deal_id,vendor_organization_id,
      structure_id,idempotency_key,signed_at,currency,contract_value_minor_units,commission_amount_minor_units,calculation_revision,state)
      VALUES(${id}::uuid,${fixture.organizationId}::uuid,${randomUUID()}::uuid,${dealId}::uuid,${vendorId}::uuid,
      ${structureId}::uuid,${randomUUID()}::uuid,now(),'USD',100000,5000,1,${state})`;
    return id;
  }
  async function snapshot() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM public.commission_events e),
      'payments',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.commission_payments p),
      'invoices',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) FROM public.finance_invoices i),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r
        WHERE command IN ('r7.payment','r7.invoice')),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a
        WHERE command IN ('r7.payment','r7.invoice'))) AS state`;
    return row!.state;
  }
  async function rpc(supabase: SupabaseClient, name: string, payload: Record<string, unknown>, original = payload) {
    return supabase.rpc(name, { payload, correlation_id: original.correlationId, idempotency_key: original.idempotencyKey });
  }
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    staff = await fixture.createSyntheticPrincipal({ mfa: true });
    await fixture.owner.begin(async sql => {
      const [assignment] = await sql<{ id: string }[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
        VALUES(${staff.identityId}::uuid,'staff',clock_timestamp(),'Synthetic finance Auth verification') RETURNING id`;
      await sql`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
        SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
        FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
        WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
      await sql`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${staff.identityId}::uuid,${staff.subjectId}::uuid,'contributor','contributor',false),
          (${fixture.organizationId}::uuid,${actor().identityId}::uuid,${actor().subjectId}::uuid,'contributor','contributor',false)`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${staff.identityId}::uuid,'finance.manage','organization',${fixture.organizationId}::uuid,
          ${`organization:${fixture.organizationId}`},'allow',${actor().identityId}::uuid,'Synthetic finance Auth verification')`;
      for (const principal of [actor(), staff]) {
        await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
          VALUES(${principal.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,
            ${`organization:${fixture.organizationId}`},'allow',${fixture.pair[1].identityId}::uuid,'Synthetic scoped finance Auth verification')`;
      }
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
        VALUES('Synthetic finance Auth vendor','vendor','active',now(),false) RETURNING id`;
      vendorId = vendor!.id;
      await sql`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${vendorId}::uuid,${fixture.organizationAdmin.identityId}::uuid,${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false),
          (${vendorId}::uuid,${actor().identityId}::uuid,${actor().subjectId}::uuid,'contributor','contributor',false)`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${actor().identityId}::uuid,'workspace.access','organization',${vendorId}::uuid,${`organization:${vendorId}`},
          'allow',${fixture.pair[1].identityId}::uuid,'Synthetic authorized foreign-scope association denial')`;
      const [deal] = await sql<{ id: string }[]>`INSERT INTO public.deals(organization_id,vendor_organization_id,owner_identity_id,stage,status)
        VALUES(${fixture.organizationId}::uuid,${vendorId}::uuid,${actor().identityId}::uuid,'won','won') RETURNING id`;
      dealId = deal!.id; structureId = randomUUID();
      await sql`INSERT INTO public.commission_structures(id,organization_id,vendor_organization_id,effective_from,calculation_type,
        rate_basis_points,currency,source_agreement_id,revision,created_by_identity_id)
        VALUES(${structureId}::uuid,${fixture.organizationId}::uuid,${vendorId}::uuid,now()-interval '1 day',
          'contract_value_rate',500,'USD',${randomUUID()}::uuid,1,${actor().identityId}::uuid)`;
    });
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    const [migrationCount] = await fixture.owner`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    const migrationHashes = await fixture.owner`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 2`;
    console.info("Finance Auth applied migration evidence", { count: migrationCount!.count,
      lastTwoHashes: migrationHashes.map(row => row.hash) });
    for (const principal of [actor(), staff]) {
      const claims = await verifiedApiClaims(elevatedClient(principal), "aal2");
      const [session] = await fixture.owner`SELECT s.aal,s.factor_id,f.status FROM auth.sessions s
        JOIN auth.mfa_factors f ON f.id=s.factor_id AND f.user_id=s.user_id
        WHERE s.id=${claims.sessionId}::uuid AND s.user_id=${principal.subjectId}::uuid`;
      expect(session).toMatchObject({ aal: "aal2", status: "verified" });
      expect(session!.factor_id).toBeTruthy();
      expect(await authorizePermission("finance.manage", { kind: "organization", organizationId: fixture.organizationId },
        { supabase: elevatedClient(principal) })).toMatchObject({ identityId: principal.identityId, assurance: "aal2" });
    }
  }, 420000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180000);

  test("records invoice transitions and returns original action outcomes through application commands", async () => {
    const create = draft(await seedEvent()), issued = issue(create.invoiceId), voided = { ...metadata(), action: "void", invoiceId: create.invoiceId };
    expect(await invokeInvoice(create)).toMatchObject({ status: "draft", outcomeCode: "recorded" });
    expect(await invokeInvoice(issued)).toMatchObject({ status: "issued", outcomeCode: "recorded" });
    expect(await invokeInvoice(voided)).toMatchObject({ status: "voided", outcomeCode: "recorded" });
    const before = await snapshot();
    for (const [payload, status] of [[create, "draft"], [issued, "issued"], [voided, "voided"]] as const) {
      expect(await invokeInvoice(payload)).toEqual({ invoiceId: create.invoiceId, organizationId: fixture.organizationId,
        status, outcomeCode: "replayed", correlationId: payload.correlationId });
    }
    await expect(invokeInvoice({ ...create, amountMinorUnits: 4999 })).rejects.toThrow("Invoice unavailable");
    expect(await snapshot()).toEqual(before);
  });
  test.each(["approved", "invoiced"])("records partial and full %s payments and retains exact original outcomes", async state => {
    const eventId = await seedEvent(state), first = payment(eventId), second = payment(eventId);
    expect(await invokePayment(first)).toMatchObject({ eventState: "partially_paid", outcomeCode: "recorded" });
    expect(await invokePayment(second)).toMatchObject({ eventState: "paid", outcomeCode: "recorded" });
    const before = await snapshot();
    for (const [payload, eventState] of [[first, "partially_paid"], [second, "paid"]] as const) {
      expect(await invokePayment(payload)).toEqual({ paymentId: payload.paymentId, commissionEventId: eventId,
        organizationId: fixture.organizationId, eventState, outcomeCode: "replayed", correlationId: payload.correlationId });
    }
    await expect(invokePayment({ ...first, amountMinorUnits: 1000 })).rejects.toThrow("Payment unavailable");
    expect(await snapshot()).toEqual(before);
    const summaries = await fixture.owner`SELECT after_summary FROM public.audit_events
      WHERE command='r7.payment' AND entity_id IN (${first.paymentId},${second.paymentId}) ORDER BY occurred_at`;
    expect(summaries.map(row => row.after_summary)).toEqual([
      { status: "completed", finance_state: "partially_paid" }, { status: "completed", finance_state: "paid" },
    ]);
  });
  test.each(["pending_review", "disputed", "adjusted", "voided", "written_off", "paid"].flatMap(state =>
    ["received", "reversed"].map(paymentState => [state, paymentState] as const)))("denies new %s / %s payments without writes", async (state, paymentState) => {
    const payload = { ...payment(await seedEvent(state)), state: paymentState }, before = await snapshot();
    await expect(invokePayment(payload)).rejects.toThrow("Payment unavailable");
    expect(await snapshot()).toEqual(before);
  });
  test.each(["pending_review", "disputed", "adjusted", "voided", "written_off"])("denies invoice creation from %s without writes", async state => {
    const payload = draft(await seedEvent(state)), before = await snapshot();
    await expect(invokeInvoice(payload)).rejects.toThrow("Invoice unavailable");
    expect(await snapshot()).toEqual(before);
  });
  test.each(["anonymous", "outsider", "customer_admin", "vendor_admin", "low_assurance_staff"])("denies %s application writes and original retries", async restriction => {
    const eventId = await seedEvent(), paid = payment(eventId), invoice = draft(await seedEvent());
    await invokePayment(paid); await invokeInvoice(invoice);
    const supabase = restriction === "anonymous" ? fixture.anonymous : restriction === "outsider" ? fixture.outsider.aal1
      : restriction === "low_assurance_staff" ? staff.aal1 : elevatedClient(fixture.organizationAdmin);
    if (restriction === "low_assurance_staff") {
      const claims = await verifiedApiClaims(staff.aal1, "aal1");
      const [proof] = await fixture.owner`SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=${claims.sessionId}::uuid
        AND user_id=${staff.subjectId}::uuid) AS session,
        mmhr_private.r1_evaluate_permission(${staff.identityId}::uuid,'finance.manage',${fixture.organizationId}::uuid,'aal2',clock_timestamp(),false) AS assigned`;
      expect(proof).toEqual({ session: true, assigned: true });
    }
    const targetActor = restriction === "low_assurance_staff" ? staff.identityId : restriction === "outsider"
      ? fixture.outsider.identityId : fixture.organizationAdmin.identityId;
    const before = await snapshot();
    for (const payload of [paid, payment(eventId)]) {
      const attempt = { ...payload, actorIdentityId: targetActor,
        ...(restriction === "vendor_admin" ? { organizationId: vendorId } : {}) };
      await expect(invokePayment(attempt, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      expect((await rpc(supabase, "mmhr_record_commission_payment", attempt)).error?.code).toBe("42501");
    }
    for (const payload of [invoice, { ...invoice, invoiceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
      const attempt = { ...payload, actorIdentityId: targetActor, createdByIdentityId: targetActor,
        ...(restriction === "vendor_admin" ? { organizationId: vendorId } : {}) };
      await expect(invokeInvoice(attempt, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      expect((await rpc(supabase, "mmhr_record_invoice", attempt)).error?.code).toBe("42501");
    }
    expect(await snapshot()).toEqual(before);
  });
  test("binds genuine actors and scoped entities at application and RPC boundaries", async () => {
    const paid = payment(await seedEvent()), invoice = draft(await seedEvent());
    await invokePayment(paid); await invokeInvoice(invoice);
    const before = await snapshot();
    await expect(invokePayment({ ...paid, actorIdentityId: fixture.outsider.identityId })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(invokeInvoice({ ...invoice, createdByIdentityId: fixture.outsider.identityId })).rejects.toBeInstanceOf(AuthorizationError);
    for (const [name, original] of [["mmhr_record_commission_payment", paid], ["mmhr_record_invoice", invoice]] as const) {
      for (const payload of [original, { ...original, correlationId: randomUUID(), idempotencyKey: randomUUID(),
        ...(name === "mmhr_record_invoice" ? { invoiceId: randomUUID() } : { paymentId: randomUUID() }) }]) {
        expect((await rpc(client(), name, { ...payload, actorIdentityId: fixture.outsider.identityId })).error?.code).toBe("42501");
        // An existing key rejects altered scope as a payload conflict before association lookup.
        expect((await rpc(client(), name, { ...payload, organizationId: vendorId })).error?.code)
          .toBe(payload === original ? "22023" : "42501");
        if (name === "mmhr_record_invoice") expect((await rpc(client(), name,
          { ...payload, createdByIdentityId: fixture.outsider.identityId })).error?.code).toBe("42501");
      }
    }
    await expect(invokePayment({ ...paid, organizationId: vendorId })).rejects.toThrow("Payment unavailable");
    await expect(invokeInvoice({ ...invoice, organizationId: vendorId })).rejects.toThrow("Invoice unavailable");
    expect(await snapshot()).toEqual(before);
  });
  test.each(["correlationId", "idempotencyKey"].flatMap(field => ["altered", "missing"].map(mode => [field, mode] as const)))(
    "binds %s %s to exact RPC arguments for fresh writes and retries", async (field, mode) => {
      const originals = [payment(await seedEvent()), draft(await seedEvent())];
      await invokePayment(originals[0]); await invokeInvoice(originals[1]);
      const before = await snapshot();
      for (const [index, name] of ["mmhr_record_commission_payment", "mmhr_record_invoice"].entries()) {
        const original = originals[index]!;
        for (const payload of [original, { ...original, correlationId: randomUUID(), idempotencyKey: randomUUID(),
          ...(index === 0 ? { paymentId: randomUUID() } : { invoiceId: randomUUID() }) }]) {
          const altered: Record<string, unknown> = { ...payload };
          if (mode === "missing") delete altered[field]; else altered[field] = randomUUID();
          expect((await rpc(client(), name, altered, payload)).error?.code).toBe("42501");
        }
      }
      expect(await snapshot()).toEqual(before);
    });
  test.each(["payment", "invoice"])("rolls back %s data and receipt when required audit storage fails", async kind => {
    const eventId = await seedEvent(), before = await snapshot();
    await fixture.owner`ALTER TABLE public.audit_events ADD CONSTRAINT r7_finance_auth_audit_failure
      CHECK (command NOT IN ('r7.payment','r7.invoice')) NOT VALID`;
    try {
      if (kind === "payment") await expect(invokePayment(payment(eventId))).rejects.toThrow("Payment unavailable");
      else await expect(invokeInvoice(draft(eventId))).rejects.toThrow("Invoice unavailable");
    } finally { await fixture.owner`ALTER TABLE public.audit_events DROP CONSTRAINT r7_finance_auth_audit_failure`; }
    expect(await snapshot()).toEqual(before);
  });
  test("denies raw financial REST access for anonymous, external, and finance staff sessions", async () => {
    for (const supabase of [fixture.anonymous, fixture.outsider.aal1, elevatedClient(fixture.organizationAdmin), elevatedClient(staff)]) {
      for (const table of ["commission_events", "commission_payments", "finance_invoices"]) {
        const result = await supabase.from(table).select("*");
        expect(result.error?.code).toBe("42501"); expect(result.data).toBeNull();
      }
    }
  });
  test("reauthorizes staff writes and original retries after finance authority is denied", async () => {
    const supabase = elevatedClient(staff);
    const paid = { ...payment(await seedEvent()), actorIdentityId: staff.identityId };
    const invoice = { ...draft(await seedEvent()), actorIdentityId: staff.identityId, createdByIdentityId: staff.identityId };
    await invokePayment(paid, supabase); await invokeInvoice(invoice, supabase);
    const before = await snapshot();
    await fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE identity_id=${staff.identityId}::uuid
      AND permission_key='finance.manage' AND organization_id=${fixture.organizationId}::uuid`;
    try {
      for (const payload of [paid, { ...paid, paymentId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
        await expect(invokePayment(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      }
      for (const payload of [invoice, { ...invoice, invoiceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
        await expect(invokeInvoice(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      }
    } finally {
      await fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE identity_id=${staff.identityId}::uuid
        AND permission_key='finance.manage' AND organization_id=${fixture.organizationId}::uuid`;
    }
    expect(await snapshot()).toEqual(before);
  });
  test("reauthorizes exact original retries after stale and revoked signed staff sessions", async () => {
    const supabase = elevatedClient(staff), claims = await verifiedApiClaims(supabase, "aal2");
    const paid = { ...payment(await seedEvent()), actorIdentityId: staff.identityId };
    const invoice = { ...draft(await seedEvent()), actorIdentityId: staff.identityId, createdByIdentityId: staff.identityId };
    await invokePayment(paid, supabase); await invokeInvoice(invoice, supabase);
    const before = await snapshot();
    const [session] = await fixture.owner`SELECT not_after FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${staff.subjectId}::uuid`;
    await fixture.owner`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id=${claims.sessionId}::uuid AND user_id=${staff.subjectId}::uuid`;
    try {
      expect((await supabase.auth.getClaims()).error).toBeNull();
      for (const payload of [paid, { ...paid, paymentId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
        await expect(invokePayment(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      }
      for (const payload of [invoice, { ...invoice, invoiceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
        await expect(invokeInvoice(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
      }
    } finally { await fixture.owner`UPDATE auth.sessions SET not_after=${session!.not_after} WHERE id=${claims.sessionId}::uuid AND user_id=${staff.subjectId}::uuid`; }
    expect(await invokePayment(paid, supabase)).toMatchObject({ outcomeCode: "replayed" });
    expect(await invokeInvoice(invoice, supabase)).toMatchObject({ outcomeCode: "replayed" });
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${staff.subjectId}::uuid`;
    expect((await supabase.auth.getClaims()).error).toBeNull();
    for (const payload of [paid, { ...paid, paymentId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
      await expect(invokePayment(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
    }
    for (const payload of [invoice, { ...invoice, invoiceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() }]) {
      await expect(invokeInvoice(payload, supabase)).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(await snapshot()).toEqual(before);
  });
});
