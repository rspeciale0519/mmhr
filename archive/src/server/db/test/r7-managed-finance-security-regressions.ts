import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { elevatedClient, verifiedApiClaims, type SecurityApiPrincipal } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { executeManagedFinanceCommand, getManagedFinancePage } from "@/server/commands/managed-finance";
import { commandMetadata, financeSnapshot, signedOwner, type ManagedFinanceAuthFixture } from "./r7-managed-finance-auth-fixtures";

export function registerManagedFinanceSecurityRegressions(getContext: () => ManagedFinanceAuthFixture) {
  async function staffPrincipal(context: ManagedFinanceAuthFixture, organizationId: string, finance: boolean) {
    const actor = await context.fixture.createSyntheticPrincipal({ mfa: true });
    await context.fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${organizationId}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false)`;
    const [assignment] = await context.fixture.owner`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
      VALUES(${actor.identityId}::uuid,'staff',clock_timestamp(),'Synthetic managed finance denial staff') RETURNING id`;
    await context.fixture.owner`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
      SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
      FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
      WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
    await context.grant(actor, organizationId, "workspace.access");
    if (finance) await context.grant(actor, organizationId, "finance.manage");
    return actor;
  }
  async function denyBoth(context: ManagedFinanceAuthFixture, actor: SecurityApiPrincipal,
    request: object & { correlationId: string; idempotencyKey: string }, aal1 = false) {
    const client = aal1 ? actor.aal1 : elevatedClient(actor);
    await verifiedApiClaims(client, aal1 ? "aal1" : "aal2");
    const before = await financeSnapshot(context.fixture);
    await expect(executeManagedFinanceCommand(request, { supabase: client as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
    const { correlationId, idempotencyKey, ...payload } = request;
    const direct = await client.rpc("mmhr_managed_finance_command", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
    expect(direct.error?.code).toBe("42501");
    expect(await financeSnapshot(context.fixture)).toEqual(before);
  }

  test("denies actual customer, vendor, scoped staff, foreign staff and eligible AAL1 sessions without writes", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase()), source = pending.context;
    const request = { ...pending.eligibility, ...commandMetadata() };
    expect(await executeManagedFinanceCommand(request, context.options(1))).toMatchObject({ entityId: pending.commissionEventId, outcomeCode: "replayed" });
    const scoped = await staffPrincipal(context, source.organizationId, false);
    const foreign = await staffPrincipal(context, context.internalOrg, true);
    // A fresh low-assurance session remains live after MFA enrollment.
    const aal1 = await staffPrincipal(context, source.organizationId, true);
    await denyBoth(context, context.fixture.organizationAdmin, request);
    const vendor = await context.fixture.createSyntheticPrincipal({ mfa: true });
    await context.fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${source.source.vendorOrganizationId}::uuid,${vendor.identityId}::uuid,${vendor.subjectId}::uuid,'contributor','contributor',false)`;
    await denyBoth(context, vendor, request);
    await denyBoth(context, scoped, request); await denyBoth(context, foreign, request); await denyBoth(context, aal1, request, true);
    const before = await financeSnapshot(context.fixture);
    const raw = await context.fixture.anonymous.rpc("mmhr_managed_finance_command", { payload: { organizationId: source.organizationId,
      action: "resolve_eligibility", contractId: source.source.contractId, handoffId: source.source.handoffId, reason: request.reason },
      correlation_id: request.correlationId, idempotency_key: request.idempotencyKey });
    expect(raw.error?.code).toBe("42501"); expect(await financeSnapshot(context.fixture)).toEqual(before);
  }, 180_000);

  test("requires current authority before exact receipt replay and does not trust a revoked genuine session", async () => {
    const context = getContext(), source = await context.createCase();
    const original = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId });
    const prepared = await context.agreement(source, original, { kind: "flat_amount", amountMinorUnits: 1, currency: "USD" });
    const actor = await staffPrincipal(context, context.internalOrg, true);
    const options = { supabase: elevatedClient(actor) as RequestSupabaseClient };
    const own = { ...prepared, versionId: randomUUID(), ...commandMetadata() };
    await executeManagedFinanceCommand(own, options);
    await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='deny'
      WHERE identity_id=${actor.identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`;
    try {
      const before = await financeSnapshot(context.fixture);
      await expect(executeManagedFinanceCommand(own, options)).rejects.toBeInstanceOf(AuthorizationError);
      const { correlationId, idempotencyKey, ...payload } = own;
      const denied = await elevatedClient(actor).rpc("mmhr_managed_finance_command", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
      expect(denied.error?.code).toBe("42501"); expect(await financeSnapshot(context.fixture)).toEqual(before);
    } finally { await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='allow'
      WHERE identity_id=${actor.identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`; }
    const claims = await verifiedApiClaims(elevatedClient(actor), "aal2");
    await context.fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    const before = await financeSnapshot(context.fixture);
    await expect(executeManagedFinanceCommand(own, options)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(getManagedFinancePage({ organizationId: context.internalOrg, view: "agreements", correlationId: randomUUID() }, options)).rejects.toBeInstanceOf(AuthorizationError);
    const { correlationId, idempotencyKey, ...payload } = own;
    const raw = await elevatedClient(actor).rpc("mmhr_managed_finance_command", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
    expect(raw.error?.code).toBe("42501"); expect(await financeSnapshot(context.fixture)).toEqual(before);
  }, 180_000);

  test("denies same-workspace crossed vendor originals and raw canonical money or unsupported currency writes", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
    const foreign = await context.createCase();
    const original = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: foreign.source.vendorOrganizationId });
    const before = await financeSnapshot(context.fixture);
    await expect(context.agreement(pending.context, original, { kind: "flat_amount", amountMinorUnits: 1, currency: "USD" },
      { expectedSeriesRevision: 1, predecessorVersionId: (await context.fixture.owner`SELECT agreement_version_id FROM public.managed_commission_sources
        WHERE commission_event_id=${pending.commissionEventId}::uuid`)[0]!.agreement_version_id as string,
        replacementSourceReference: "synthetic:crossed-source", effectiveFrom: new Date(Date.now() + 86_400_000).toISOString() }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(await financeSnapshot(context.fixture)).toEqual(before);
    await expect(signedOwner(context.fixture, elevatedClient(context.fixture.pair[1]), async sql => {
      const [authority] = await sql`SELECT mmhr_private.r7_finance_document_actor(${pending.organizationId}::uuid) actor`;
      expect(authority?.actor).toBe(context.fixture.pair[1].identityId);
      await sql`UPDATE public.commission_events SET commission_amount_minor_units=0,currency='USD' WHERE id=${pending.commissionEventId}::uuid`;
    })).rejects.toMatchObject({ code: "42501", message: "Managed event publication denied" });
    expect(await financeSnapshot(context.fixture)).toEqual(before);
    await expect(signedOwner(context.fixture, elevatedClient(context.fixture.pair[1]), async sql => {
      await sql`UPDATE public.finance_contract_facts_versions SET contract_currency='ZZZ' WHERE organization_id=${pending.organizationId}::uuid`;
    })).rejects.toMatchObject({ code: "42501", message: "Managed finance facts reference denied" });
    expect(await financeSnapshot(context.fixture)).toEqual(before);
  }, 240_000);

  for (const defect of ["receipt", "request", "digest", "time", "audit_reason", "audit_actor", "audit_time", "history"] as const)
    test(`rejects a forged owner ${defect} despite genuine decision authority and retains every row`, async () => {
      const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
      const before = await financeSnapshot(context.fixture), correlationId = randomUUID(), idempotencyKey = randomUUID();
      const request = { organizationId: pending.organizationId, action: "reject_calculation", commissionEventId: pending.commissionEventId,
        calculationId: pending.calculationId, expectedEventRevision: 1, expectedCalculationRevision: 1, expectedSourceDigest: pending.sourceDigest,
        reason: "Synthetic forged decision check", reviewReference: "synthetic:guard", ...(defect === "request" ? { forged: true } : {}) };
      await expect(signedOwner(context.fixture, elevatedClient(context.fixture.pair[1]), async sql => {
        const [authority] = await sql`SELECT mmhr_private.r7_finance_document_actor(${pending.organizationId}::uuid) actor`;
        expect(authority?.actor).toBe(context.fixture.pair[1].identityId);
        const [clock] = await sql`SELECT clock_timestamp()::text t`; const time = clock!.t as string;
        let receiptId: string;
        if (defect === "receipt") {
          const [receipt] = await sql`SELECT prepare_receipt_id FROM public.managed_commission_calculations WHERE id=${pending.calculationId}::uuid`;
          receiptId = receipt!.prepare_receipt_id as string;
        } else if (["audit_actor", "audit_time"].includes(defect)) {
          const auditId = randomUUID(); receiptId = randomUUID();
          await sql`INSERT INTO public.audit_events(id,actor_type,actor_reference,actor_identity_id,organization_id,command,action,entity_type,entity_id,
            reason,correlation_id,idempotency_key,before_summary,after_summary,occurred_at)
            VALUES(${auditId}::uuid,${defect === "audit_actor" ? "system" : "user"},${defect === "audit_actor" ? "synthetic:forged-system" : null},${context.fixture.pair[1].identityId}::uuid,
              ${pending.organizationId}::uuid,'r7.finance.managed.reject_calculation','finance.reject_calculation','managed_commission_calculation',
              ${pending.calculationId},${request.reason},${correlationId}::uuid,${idempotencyKey},jsonb_build_object('status','completed'),
              jsonb_build_object('status','completed'),${time}::timestamptz - ${defect === "audit_time" ? "1 second" : "0 seconds"}::interval)`;
          await sql`INSERT INTO public.security_command_receipts(id,actor_identity_id,command,idempotency_key,request_digest,entity_id,action,audit_event_id,created_at)
            VALUES(${receiptId}::uuid,${context.fixture.pair[1].identityId}::uuid,'r7.finance.managed.reject_calculation',${idempotencyKey}::uuid,
              mmhr_private.r7_managed_digest(${JSON.stringify(request)}::jsonb),${pending.calculationId}::uuid,'finance.reject_calculation',${auditId}::uuid,${time}::timestamptz)`;
        } else {
          const [receipt] = await sql`SELECT mmhr_private.r1_finish_security_command(${context.fixture.pair[1].identityId}::uuid,
            'r7.finance.managed.reject_calculation','finance.reject_calculation','managed_commission_calculation',${pending.calculationId}::uuid,
            ${pending.organizationId}::uuid,${defect === "audit_reason" ? "Different audit reason" : request.reason},${correlationId}::uuid,
            ${idempotencyKey}::uuid,${JSON.stringify(request)}::jsonb,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),${time}::timestamptz) result`;
          receiptId = (receipt!.result as { receipt_id: string }).receipt_id;
        }
        await sql`UPDATE public.managed_commission_calculations SET state='rejected',revision=2,
          decided_by_identity_id=${context.fixture.pair[1].identityId}::uuid,decided_at=${time}::timestamptz + ${defect === "time" ? "1 microsecond" : "0 seconds"}::interval,
          decision_reason=${request.reason},review_reference=${request.reviewReference},decision_receipt_id=${receiptId}::uuid,
          decision_request=${JSON.stringify(request)}::jsonb,decision_request_digest=CASE WHEN ${defect === "digest"} THEN repeat('0',64)
            ELSE mmhr_private.r7_managed_digest(${JSON.stringify(request)}::jsonb) END,
          decision_correlation_id=${correlationId}::uuid WHERE id=${pending.calculationId}::uuid`;
        // Use actual row evidence except for the one deliberately changed history snapshot.
        await sql`INSERT INTO public.managed_finance_events(organization_id,entity_type,entity_id,revision,action,actor_identity_id,receipt_id,correlation_id,snapshot,occurred_at)
          SELECT organization_id,'managed_commission_calculation',id,revision,'reject_calculation',decided_by_identity_id,decision_receipt_id,
            decision_correlation_id,CASE WHEN ${defect === "history"} THEN to_jsonb(c)||jsonb_build_object('source_digest',repeat('0',64)) ELSE to_jsonb(c) END,
            decided_at FROM public.managed_commission_calculations c WHERE id=${pending.calculationId}::uuid`;
        await sql`SET CONSTRAINTS ALL IMMEDIATE`;
      })).rejects.toMatchObject({ code: "42501", message: defect === "request" || defect === "digest"
        ? "Managed calculation decision request denied" : "Managed calculation receipt or history denied" });
      expect(await financeSnapshot(context.fixture)).toEqual(before);
    }, 180_000);

  test("rolls back a failed commercial audit and accepts the same unchanged request afterward", async () => {
    const context = getContext(), source = await context.createCase();
    const original = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId });
    const request = { organizationId: context.internalOrg, action: "prepare_agreement", agreementId: source.agreementId, versionId: randomUUID(),
      vendorOrganizationId: source.source.vendorOrganizationId, expectedSeriesRevision: 0, predecessorVersionId: null,
      source: { organizationId: original.organizationId, documentId: original.documentId, versionId: original.versionId, sha256: original.sha256 },
      effectiveFrom: "2020-01-01T00:00:00Z", statedEffectiveEnd: null, replacementSourceReference: null,
      rule: { kind: "flat_amount", amountMinorUnits: 1, currency: "USD" }, conditionReferences: [], ...commandMetadata() };
    await context.fixture.owner`CREATE FUNCTION mmhr_private.managed_finance_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.command='r7.finance.managed.prepare_agreement' THEN RAISE EXCEPTION 'Synthetic managed finance audit failure'; END IF;RETURN NEW;END $$`;
    await context.fixture.owner`CREATE TRIGGER managed_finance_test_audit_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.managed_finance_test_audit_failure()`;
    const before = await financeSnapshot(context.fixture);
    try { await expect(executeManagedFinanceCommand(request, context.options(0))).rejects.toThrow("Managed finance request failed");
      expect(await financeSnapshot(context.fixture)).toEqual(before);
    } finally { await context.fixture.owner`DROP TRIGGER managed_finance_test_audit_failure ON public.audit_events`;
      await context.fixture.owner`DROP FUNCTION mmhr_private.managed_finance_test_audit_failure()`; }
    expect(await executeManagedFinanceCommand(request, context.options(0))).toMatchObject({ revision: 1, outcomeCode: "recorded" });
  }, 180_000);

  test("forces RLS, denies direct raw role data and preserves exact public and private function grants", async () => {
    const context = getContext(), tables = ["finance_agreement_series", "finance_agreement_versions", "finance_agreement_applicability",
      "finance_contract_facts_versions", "managed_commission_sources", "managed_commission_calculations", "managed_finance_events"];
    const rows = await context.fixture.owner`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive) restrictive
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${tables}::text[])`;
    expect(rows).toHaveLength(7); for (const row of rows) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, restrictive: 1 });
    for (const role of ["anon", "authenticated", "service_role", "mmhr_worker", "mmhr_document_worker"])
      for (const table of tables) {
        const before = await financeSnapshot(context.fixture);
        await expect(context.fixture.owner.begin(async sql => { await sql`SET LOCAL ROLE ${sql(role)}`;
          await sql`SELECT * FROM public.${sql(table)} LIMIT 1`; })).rejects.toMatchObject({ code: "42501" });
        expect(await financeSnapshot(context.fixture)).toEqual(before);
      }
    const privileges = await context.fixture.owner`SELECT r.rolname,p.proname,n.nspname,
      has_function_privilege(r.oid,p.oid,'EXECUTE') allowed FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname IN ('anon','authenticated','service_role','mmhr_worker','mmhr_document_worker')
        AND ((n.nspname='public' AND p.proname IN ('mmhr_managed_finance_command','mmhr_get_managed_finance_page','mmhr_get_managed_finance_detail','mmhr_get_managed_finance_originals'))
          OR (n.nspname='mmhr_private' AND p.proname LIKE 'r7_managed_%'))`;
    expect(privileges.length).toBeGreaterThan(20);
    for (const row of privileges) expect(row.allowed).toBe(row.nspname === "public" && row.rolname === "authenticated");
    const definitions = await context.fixture.owner`SELECT p.proname,p.prosecdef,p.provolatile,p.proparallel,
      p.proretset,p.prorettype='jsonb'::regtype jsonb_result,
      EXISTS(SELECT 1 FROM unnest(p.proconfig) setting WHERE lower(setting) IN ('timezone=utc','timezone=UTC')) utc,
      EXISTS(SELECT 1 FROM unnest(p.proconfig) setting WHERE setting='search_path=""') empty_path
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('mmhr_managed_finance_command','mmhr_get_managed_finance_page',
        'mmhr_get_managed_finance_detail','mmhr_get_managed_finance_originals')`;
    expect(definitions).toHaveLength(4);
    for (const definition of definitions) expect(definition).toMatchObject({ prosecdef: true, provolatile: "v", proparallel: "u",
      proretset: false, jsonb_result: true, utc: true, empty_path: true });
  }, 120_000);
}
