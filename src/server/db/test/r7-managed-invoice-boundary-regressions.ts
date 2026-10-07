import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { elevatedClient, verifiedApiClaims, type SecurityApiPrincipal } from "@/server/auth/security-command-api-fixtures";
import { executeManagedInvoiceCommand, getManagedInvoiceDetail, getManagedInvoiceOwners, getManagedInvoiceSource } from "@/server/commands/managed-invoice";
import { managedInvoiceDetailRequestSchema, managedInvoiceOwnerRequestSchema, managedInvoiceSourceRequestSchema,
  verifyManagedInvoiceDetail, verifyManagedInvoiceOwners, verifyManagedInvoiceSource, verifyManagedInvoiceResult,
  type ManagedInvoiceCommand } from "@/lib/managed-invoice";
import { commandMetadata, type ManagedFinanceAuthFixture } from "./r7-managed-finance-auth-fixtures";

type Prepare = Extract<ManagedInvoiceCommand, { action: "prepare_invoice" }>;
type Scenario = { prepare: Prepare; pending: { context: { source: { vendorOrganizationId: string } } } };
type RpcCase = { name: string; input: Record<string, unknown>; sdk: (client: SupabaseClient) => Promise<unknown> };
type Dependencies = {
  context(): ManagedFinanceAuthFixture;
  scenario(): Promise<Scenario>;
  snapshot(): Promise<unknown>;
};

/** Register inside the existing genuine invoice suite; this does not open another fixture. */
export function registerManagedInvoiceBoundaryRegressions(dependencies: Dependencies) {
  let source: Scenario;
  let assigned: SecurityApiPrincipal;
  let unrelated: SecurityApiPrincipal;
  let vendor: SecurityApiPrincipal;
  let membershipId: string;
  let originalResult: Awaited<ReturnType<typeof executeManagedInvoiceCommand>>;
  const options = (supabase: SupabaseClient) => ({ supabase: supabase as RequestSupabaseClient });
  const context = () => dependencies.context();

  function cases(prepare = source.prepare): RpcCase[] {
    const { organizationId, commissionEventId, calculationId, invoiceId, supportingSources } = prepare;
    const owners = managedInvoiceOwnerRequestSchema.parse({ organizationId, commissionEventId, correlationId: randomUUID() });
    const detail = managedInvoiceDetailRequestSchema.parse({ organizationId, commissionEventId, invoiceId, correlationId: randomUUID() });
    const basis = managedInvoiceSourceRequestSchema.parse({ organizationId, commissionEventId, calculationId, supportingSources,
      correlationId: randomUUID() });
    return [
      { name: "mmhr_get_managed_invoice_owners", input: owners, sdk: client => getManagedInvoiceOwners(owners, options(client)) },
      { name: "mmhr_get_managed_invoice_detail", input: detail, sdk: client => getManagedInvoiceDetail(detail, options(client)) },
      { name: "mmhr_get_managed_invoice_source", input: basis, sdk: client => getManagedInvoiceSource(basis, options(client)) },
      { name: "mmhr_managed_invoice_command", input: prepare, sdk: client => executeManagedInvoiceCommand(prepare, options(client)) },
    ];
  }

  async function direct(client: SupabaseClient, entry: RpcCase) {
    const { correlationId, idempotencyKey, ...payload } = entry.input;
    return client.rpc(entry.name, { payload, correlation_id: correlationId,
      ...(idempotencyKey === undefined ? {} : { idempotency_key: idempotencyKey }) });
  }

  async function positive() {
    if (!source || !assigned || !originalResult) throw new Error("Invoice boundary positive setup did not finish");
    const client = elevatedClient(assigned);
    await verifiedApiClaims(client, "aal2");
    const before = await dependencies.snapshot();
    for (const entry of cases()) {
      const sdk = await entry.sdk(client);
      const raw = await direct(client, entry);
      expect(raw.error, `${entry.name} valid staff direct RPC`).toBeNull();
      if (entry.name === "mmhr_get_managed_invoice_owners") {
        expect(verifyManagedInvoiceOwners(raw.data, entry.input).owners.map(row => row.identityId)).toContain(assigned.identityId);
        expect(sdk).toMatchObject({ organizationId: source.prepare.organizationId, commissionEventId: source.prepare.commissionEventId });
      } else if (entry.name === "mmhr_get_managed_invoice_source") {
        expect(verifyManagedInvoiceSource(raw.data, entry.input)).toMatchObject({ calculationId: source.prepare.calculationId,
          currency: "USD" });
        expect(sdk).toMatchObject({ commissionEventId: source.prepare.commissionEventId, amountMinorUnits: 100 });
      } else if (entry.name === "mmhr_get_managed_invoice_detail") {
        expect(verifyManagedInvoiceDetail(raw.data, entry.input, assigned.identityId).invoice?.invoiceId).toBe(source.prepare.invoiceId);
        expect(sdk).toMatchObject({ currentActorIdentityId: assigned.identityId });
      } else {
        expect(verifyManagedInvoiceResult(raw.data, entry.input)).toEqual({ ...originalResult, outcomeCode: "replayed" });
        expect(sdk).toEqual({ ...originalResult, outcomeCode: "replayed" });
      }
    }
    expect(await dependencies.snapshot()).toEqual(before);
  }

  async function denied(client: SupabaseClient, entries = cases()) {
    const before = await dependencies.snapshot();
    for (const entry of entries) {
      await expect(entry.sdk(client), `${entry.name} SDK denial`).rejects.toBeInstanceOf(AuthorizationError);
      const raw = await direct(client, entry);
      expect(raw.error, `${entry.name} direct RPC denial`).toMatchObject({ code: "42501" });
      expect(raw.data).toBeNull();
      expect(await dependencies.snapshot()).toEqual(before);
    }
  }

  async function member(actor: SecurityApiPrincipal, org: string) {
    const [row] = await context().fixture.owner<{ id: string }[]>`INSERT INTO public.org_members
      (org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${org}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false) RETURNING id`;
    expect(row).toBeDefined(); return row!.id;
  }

  async function staff(actor: SecurityApiPrincipal) {
    await context().fixture.owner.begin(async sql => {
      const [assignment] = await sql<{ id: string }[]>`INSERT INTO public.platform_role_assignments
        (identity_id,role_key,assigned_at,assignment_reason)
        VALUES(${actor.identityId}::uuid,'staff',clock_timestamp(),'Synthetic invoice boundary staff') RETURNING id`;
      expect(assignment).toBeDefined();
      const authority = await sql`INSERT INTO public.role_authority_records
        (record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
        SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
        FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
        WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active' RETURNING id`;
      expect(authority).toHaveLength(1);
    });
    const decision = await elevatedClient(actor).rpc("mmhr_authorize", { permission_key: "admin.access", organization_id: null });
    expect(decision.error).toBeNull(); expect(decision.data).toHaveLength(1);
  }

  test("proves assigned genuine AAL2 staff through every invoice SDK and direct RPC before role denials", async () => {
    source = await dependencies.scenario();
    assigned = await context().fixture.createSyntheticPrincipal({ mfa: true });
    unrelated = await context().fixture.createSyntheticPrincipal({ mfa: true });
    vendor = await context().fixture.createSyntheticPrincipal({ mfa: true });
    await staff(assigned); await staff(unrelated);
    membershipId = await member(assigned, context().internalOrg);
    await member(assigned, source.prepare.organizationId);
    await member(unrelated, context().internalOrg);
    await member(vendor, source.pending.context.source.vendorOrganizationId);
    for (const org of [context().internalOrg, source.prepare.organizationId]) {
      for (const permission of ["workspace.access", "finance.manage"]) await context().grant(assigned, org, permission);
      await context().grant(unrelated, org, "workspace.access");
    }
    await verifiedApiClaims(assigned.aal1, "aal1");
    await verifiedApiClaims(elevatedClient(assigned), "aal2");
    const before = await dependencies.snapshot();
    originalResult = await executeManagedInvoiceCommand(source.prepare, options(elevatedClient(assigned)));
    expect(originalResult).toMatchObject({ status: "draft", outcomeCode: "recorded", invoiceRevision: 1, preparationRevision: 1 });
    expect(await dependencies.snapshot()).not.toEqual(before);
    await positive();
  }, 360_000);

  test.each(["customer", "vendor", "unassigned_staff", "anonymous", "assigned_aal1"] as const)(
    "denies %s through all four invoice SDK and direct RPC boundaries without retained writes", async kind => {
      await positive();
      const principal = kind === "customer" ? context().fixture.organizationAdmin : kind === "vendor" ? vendor
        : kind === "unassigned_staff" ? unrelated : assigned;
      const client = kind === "anonymous" ? context().fixture.anonymous : kind === "assigned_aal1" ? assigned.aal1 : elevatedClient(principal);
      if (kind !== "anonymous") {
        await verifiedApiClaims(client, kind === "assigned_aal1" ? "aal1" : "aal2");
        const [proof] = await context().fixture.owner<{ present: boolean; assigned: boolean }[]>`SELECT
          EXISTS(SELECT 1 FROM public.org_members m JOIN public.orgs o ON o.id=m.org_id
            WHERE m.identity_id=${principal.identityId}::uuid AND m.status='active' AND NOT m.migration_review_required
              AND o.type=${kind === "vendor" ? "vendor" : kind === "customer" ? "customer" : "internal"}) present,
          mmhr_private.r1_evaluate_permission(${principal.identityId}::uuid,'finance.manage',${context().internalOrg}::uuid,
            'aal2',clock_timestamp(),false) assigned`;
        expect(proof).toEqual({ present: true, assigned: kind === "assigned_aal1" });
      }
      await denied(client);
    }, 180_000);

  test("denies wrong same-scope event, calculation, invoice, preparation and source bindings", async () => {
    await positive();
    const client = elevatedClient(assigned);
    const other = await dependencies.scenario();
    const readEntries = cases().filter(entry => entry.name !== "mmhr_managed_invoice_command");
    for (const entry of readEntries) {
      const input = { ...entry.input, commissionEventId: source.prepare.invoiceId };
      const crossed: RpcCase = { ...entry, input, sdk: current => entry.name === "mmhr_get_managed_invoice_owners"
        ? getManagedInvoiceOwners(input, options(current)) : entry.name === "mmhr_get_managed_invoice_source"
          ? getManagedInvoiceSource(input, options(current)) : getManagedInvoiceDetail(input, options(current)) };
      await denied(client, [crossed]);
    }
    // A valid other event can be read. Crossed identity pairs must fail instead.
    const ownerRequest = { organizationId: other.prepare.organizationId, commissionEventId: other.prepare.commissionEventId, correlationId: randomUUID() };
    expect(await getManagedInvoiceOwners(ownerRequest, context().options(0))).toMatchObject(ownerRequest);
    const wrongSameScopeSource = { organizationId: source.prepare.organizationId, commissionEventId: source.prepare.commissionEventId,
      calculationId: source.prepare.preparationId, supportingSources: source.prepare.supportingSources, correlationId: randomUUID() };
    const crossedSource = { organizationId: source.prepare.organizationId, commissionEventId: source.prepare.commissionEventId,
      calculationId: other.prepare.calculationId, supportingSources: source.prepare.supportingSources, correlationId: randomUUID() };
    const alteredSource = { ...crossedSource, calculationId: source.prepare.calculationId,
      supportingSources: source.prepare.supportingSources.map((original, index) => index === 0 ? { ...original, sha256: "f".repeat(64) } : original) };
    for (const input of [wrongSameScopeSource, crossedSource, alteredSource]) await denied(client, [{ name: "mmhr_get_managed_invoice_source", input,
      sdk: current => getManagedInvoiceSource(input, options(current)) }]);
    for (const invoiceId of [source.prepare.preparationId, other.prepare.invoiceId]) {
      const crossedDetail = { organizationId: source.prepare.organizationId, commissionEventId: source.prepare.commissionEventId,
        invoiceId, correlationId: randomUUID() };
      await denied(client, [{ name: "mmhr_get_managed_invoice_detail", input: crossedDetail,
        sdk: current => getManagedInvoiceDetail(crossedDetail, options(current)) }]);
    }
    for (const changed of [{ commissionEventId: randomUUID() }, { calculationId: other.prepare.calculationId },
      { supportingSources: alteredSource.supportingSources }]) {
      const input: Prepare = { ...source.prepare, ...changed, preparationId: randomUUID(), expectedInvoiceRevision: 1, ...commandMetadata() };
      await denied(client, [{ name: "mmhr_managed_invoice_command", input, sdk: current => executeManagedInvoiceCommand(input, options(current)) }]);
    }
    const wrongPreparation = { organizationId: source.prepare.organizationId, action: "reject_invoice" as const,
      invoiceId: source.prepare.invoiceId, preparationId: source.prepare.invoiceId, commissionEventId: source.prepare.commissionEventId,
      expectedEventRevision: source.prepare.expectedEventRevision, expectedInvoiceRevision: 1, expectedPreparationRevision: 1,
      expectedSourceDigest: source.prepare.expectedSourceDigest, contentsReviewed: true,
      reviewedSources: source.prepare.supportingSources.map(original => ({ ...original, reviewedAccessId: randomUUID() })),
      reviewReference: "Synthetic mismatched preparation", ...commandMetadata() };
    await denied(elevatedClient(context().fixture.pair[1]), [{ name: "mmhr_managed_invoice_command", input: wrongPreparation,
      sdk: current => executeManagedInvoiceCommand(wrongPreparation, options(current)) }]);
  }, 360_000);

  test.each(["permission", "membership", "organization", "expired_session"] as const)(
    "reauthorizes original invoice retries and every read after current %s revocation", async kind => {
      await positive();
      const fixture = context().fixture, org = context().internalOrg;
      const claims = await verifiedApiClaims(elevatedClient(assigned), "aal2");
      const previousMembershipId = membershipId;
      const [session] = await fixture.owner<{ not_after: string | null }[]>`SELECT not_after::text FROM auth.sessions
        WHERE id=${claims.sessionId}::uuid AND user_id=${assigned.subjectId}::uuid`;
      expect(session).toBeDefined();
      let changed: readonly unknown[];
      if (kind === "permission") changed = await fixture.owner`UPDATE public.user_permission_overrides SET effect='deny'
        WHERE identity_id=${assigned.identityId}::uuid AND organization_id=${org}::uuid AND permission_key='finance.manage' RETURNING id`;
      else if (kind === "membership") changed = await fixture.owner`UPDATE public.org_members SET status='revoked',
        revoked_at=clock_timestamp(),revoked_by_identity_id=${fixture.pair[1].identityId}::uuid,revoked_reason='Synthetic invoice boundary revocation'
        WHERE id=${membershipId}::uuid AND status='active' RETURNING id`;
      else if (kind === "organization") changed = await fixture.owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp()
        WHERE id=${source.prepare.organizationId}::uuid AND status='active' RETURNING id`;
      else changed = await fixture.owner`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute'
        WHERE id=${claims.sessionId}::uuid AND user_id=${assigned.subjectId}::uuid RETURNING id`;
      expect(changed).toHaveLength(1);
      try { await denied(elevatedClient(assigned)); }
      finally {
        if (kind === "permission") await fixture.owner`UPDATE public.user_permission_overrides SET effect='allow'
          WHERE identity_id=${assigned.identityId}::uuid AND organization_id=${org}::uuid AND permission_key='finance.manage'`;
        else if (kind === "membership") {
          // Revocation is terminal. Recovery creates a new current membership and retains the old evidence.
          membershipId = await member(assigned, org);
          expect(membershipId).not.toBe(previousMembershipId);
          const [historical] = await fixture.owner<{ status: string; reason: string; has_time: boolean }[]>`SELECT status,
            revoked_reason reason,revoked_at IS NOT NULL has_time FROM public.org_members WHERE id=${previousMembershipId}::uuid`;
          expect(historical).toEqual({ status: "revoked", reason: "Synthetic invoice boundary revocation", has_time: true });
        }
        else if (kind === "organization") await fixture.owner`UPDATE public.orgs SET status='active',suspended_at=NULL
          WHERE id=${source.prepare.organizationId}::uuid`;
        else await fixture.owner`UPDATE auth.sessions SET not_after=${session!.not_after}::timestamptz
          WHERE id=${claims.sessionId}::uuid AND user_id=${assigned.subjectId}::uuid`;
      }
      await positive();
    }, 240_000);

  test("rejects original invoice retries and every read after genuine assigned session deletion", async () => {
    await positive();
    const claims = await verifiedApiClaims(elevatedClient(assigned), "aal2");
    const deleted = await context().fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid
      AND user_id=${assigned.subjectId}::uuid RETURNING id`;
    expect(deleted).toHaveLength(1);
    await denied(elevatedClient(assigned));
  }, 180_000);
}
