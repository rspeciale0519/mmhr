import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { executeManagedFinanceCommand, getManagedFinanceDetail } from "@/server/commands/managed-finance";
import { executeManagedInvoiceCommand, getManagedInvoiceOwners, getManagedInvoiceSource, getManagedInvoiceDetail } from "@/server/commands/managed-invoice";
import { createManagedFinanceAuthFixture, commandMetadata, financeSnapshot, reference, signedOwner,
  type ManagedFinanceAuthFixture } from "@/server/db/test/r7-managed-finance-auth-fixtures";
import type { ManagedInvoiceCommand } from "@/lib/managed-invoice";
import { compareManagedFinanceInstants } from "@/lib/managed-finance-workflow";
import { AuthorizationError } from "@/server/auth/authorization";
import { downloadManagedInvoiceOriginal, ManagedInvoiceOriginalAccessExpiredError } from "@/server/commands/managed-invoice-original";
import { FinanceDocumentConflictError } from "@/server/commands/finance-document-errors";
import { registerManagedInvoiceBoundaryRegressions } from "@/server/db/test/r7-managed-invoice-boundary-regressions";
import { registerInvoiceDateAlignmentRegressions } from "@/server/db/test/r7-invoice-date-alignment-regressions";

describe("Managed invoice readiness through genuine isolated Auth and approved Storage originals", () => {
  let context: ManagedFinanceAuthFixture;
  beforeAll(async () => { context = await createManagedFinanceAuthFixture(); }, 420_000);
  afterAll(async () => { if (context) await context.close(); }, 180_000);
  async function snapshot() {
    const [row] = await context.fixture.owner`SELECT jsonb_build_object(
      'invoices',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.finance_invoices x),
      'preparations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.managed_invoice_preparations x),
      'accessGrants',(SELECT coalesce(jsonb_agg((to_jsonb(x)-'access_token') || jsonb_build_object('tokenDigest',
        mmhr_private.r7_managed_digest(jsonb_build_object('token',x.access_token))) ORDER BY id),'[]') FROM mmhr_private.finance_document_access_grants x),
      'invoiceHistory',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.managed_invoice_events x)) proof`;
    return { finance: await financeSnapshot(context.fixture), invoice: row!.proof as unknown };
  }
  async function denied(run: () => Promise<unknown>) { const before = await snapshot(); await expect(run()).rejects.toBeInstanceOf(AuthorizationError); expect(await snapshot()).toEqual(before); }
  async function zeroCalculation() {
    const source = await context.createCase();
    const agreementOriginal = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId });
    await context.sourceDecision(await context.agreement(source, agreementOriginal, { kind: "flat_amount", amountMinorUnits: 0, currency: "USD" }), agreementOriginal, true);
    const contractOriginal = await context.original(source.organizationId, source.source);
    await context.sourceDecision(await context.facts(source, contractOriginal, { amountMinorUnits: null, currency: null }), contractOriginal, true);
    const eligibility = { organizationId: source.organizationId, action: "resolve_eligibility" as const, contractId: source.source.contractId,
      handoffId: source.source.handoffId, ...commandMetadata() };
    const event = await executeManagedFinanceCommand(eligibility, context.options(0));
    const detail_ = await getManagedFinanceDetail({ organizationId: source.organizationId, entityId: source.source.contractId,
      view: "contract", correlationId: randomUUID() }, context.options(0));
    if (detail_.view !== "contract" || !detail_.contract.currentSourceDigest) throw new Error("Actual zero source missing");
    const request = { organizationId: source.organizationId, action: "prepare_calculation" as const, commissionEventId: event.entityId,
      calculationId: randomUUID(), expectedEventRevision: 1, expectedSourceDigest: detail_.contract.currentSourceDigest, ...commandMetadata() };
    await executeManagedFinanceCommand(request, context.options(0));
    return { context: source, contractOriginal, agreementOriginal, request, eligibility, calculationId: request.calculationId,
      commissionEventId: event.entityId, organizationId: source.organizationId, sourceDigest: request.expectedSourceDigest, eventRevision: 1 };
  }
  async function scenario(zero = false) {
    const pending = zero ? await zeroCalculation() : await context.pendingCalculation(await context.createCase());
    await executeManagedFinanceCommand({ organizationId: pending.organizationId, action: "approve_calculation", commissionEventId: pending.commissionEventId,
      calculationId: pending.calculationId, expectedEventRevision: 1, expectedCalculationRevision: 1, expectedSourceDigest: pending.sourceDigest,
      reviewReference: "Synthetic independently approved invoice basis", ...commandMetadata() }, context.options(1));
    const source = await getManagedInvoiceSource({ organizationId: pending.organizationId, correlationId: randomUUID(),
      commissionEventId: pending.commissionEventId, calculationId: pending.calculationId,
      supportingSources: [reference(pending.agreementOriginal), reference(pending.contractOriginal)] }, context.options(0));
    const prepare: Extract<ManagedInvoiceCommand, { action: "prepare_invoice" }> = { organizationId: pending.organizationId, action: "prepare_invoice",
      invoiceId: randomUUID(), preparationId: randomUUID(), commissionEventId: pending.commissionEventId, calculationId: pending.calculationId,
      expectedEventRevision: source.eventRevision, expectedInvoiceRevision: 0, expectedSourceDigest: source.sourceDigest,
      ownerIdentityId: context.fixture.pair[0].identityId, invoiceNumber: `SYN-${randomUUID()}`, issueDate: new Date(Date.now() - 60_000).toISOString(),
      dueDate: new Date(Date.now() + 86_400_000).toISOString(), collectionTerms: "Synthetic collection due on recorded date",
      supportingSources: source.supportingSources, ...commandMetadata() };
    return { pending, source, prepare };
  }
  async function review(s: Awaited<ReturnType<typeof scenario>>, action: "approve_invoice" | "reject_invoice" = "approve_invoice") {
    return { organizationId: s.prepare.organizationId, action, invoiceId: s.prepare.invoiceId, preparationId: s.prepare.preparationId,
      commissionEventId: s.prepare.commissionEventId, expectedEventRevision: s.prepare.expectedEventRevision,
      expectedInvoiceRevision: s.prepare.expectedInvoiceRevision + 1, expectedPreparationRevision: 1 as const,
      expectedSourceDigest: s.prepare.expectedSourceDigest, contentsReviewed: true as const, reviewReference: "Synthetic exact invoice support review",
      reviewedSources: [{ ...reference(s.pending.agreementOriginal), reviewedAccessId: await context.originalAccess(s.pending.agreementOriginal, 1) },
        { ...reference(s.pending.contractOriginal), reviewedAccessId: await context.originalAccess(s.pending.contractOriginal, 1) }], ...commandMetadata() };
  }
  const issue = (s: Awaited<ReturnType<typeof scenario>>) => ({ organizationId: s.prepare.organizationId, action: "issue_invoice" as const,
    invoiceId: s.prepare.invoiceId, preparationId: s.prepare.preparationId, commissionEventId: s.prepare.commissionEventId,
    expectedEventRevision: s.prepare.expectedEventRevision, expectedInvoiceRevision: s.prepare.expectedInvoiceRevision + 2,
    expectedPreparationRevision: 2 as const, expectedSourceDigest: s.prepare.expectedSourceDigest, ...commandMetadata() });
  const detail = (s: Awaited<ReturnType<typeof scenario>>) => getManagedInvoiceDetail({ organizationId: s.prepare.organizationId,
    commissionEventId: s.prepare.commissionEventId, invoiceId: s.prepare.invoiceId, correlationId: randomUUID() }, context.options(1));
  const invoiceSource = ({ organizationId, documentId, versionId, sha256 }: Awaited<ReturnType<typeof getManagedInvoiceDetail>>["mandatorySources"][number]) =>
    ({ organizationId, documentId, versionId, sha256 });

  test("prepares, independently approves and issues one exact full-amount invoice with original retry outputs", async () => {
    const s = await scenario();
    s.prepare = { ...s.prepare,
      issueDate: `${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}T23:59:59.999999Z`,
      dueDate: `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000001Z` };
    const prepared = await executeManagedInvoiceCommand(s.prepare, context.options(0));
    expect(prepared).toMatchObject({ status: "draft", invoiceRevision: 1, eventRevision: 2, preparationRevision: 1 });
    const storedDates = (await detail(s)).invoice!;
    expect(compareManagedFinanceInstants(storedDates.issueDate, s.prepare.issueDate)).toBe(0);
    expect(compareManagedFinanceInstants(storedDates.dueDate, s.prepare.dueDate)).toBe(0);
    const beforeCalendarAttack = await snapshot();
    for (const column of ["issue_date", "due_date"] as const) {
      await expect(signedOwner(context.fixture, context.options(0).supabase, async sql => {
        if (column === "issue_date") await sql`UPDATE public.finance_invoices SET issue_date=issue_date+1 WHERE id=${s.prepare.invoiceId}::uuid`;
        else await sql`UPDATE public.finance_invoices SET due_date=due_date+1 WHERE id=${s.prepare.invoiceId}::uuid`;
      })).rejects.toMatchObject({ code: "42501" });
      expect(await snapshot()).toEqual(beforeCalendarAttack);
    }
    const decision = await review(s);
    await denied(() => executeManagedInvoiceCommand(decision, context.options(0)));
    const approved = await executeManagedInvoiceCommand(decision, context.options(1));
    const request = issue(s), issued = await executeManagedInvoiceCommand(request, context.options(0));
    expect(approved).toMatchObject({ status: "ready", invoiceRevision: 2, eventRevision: 2 });
    expect(issued).toMatchObject({ status: "issued", invoiceRevision: 3, eventRevision: 3 });
    expect((await detail(s)).currentPreparation?.supportingOriginals.map(({ organizationId, documentId, versionId, sha256 }) =>
      ({ organizationId, documentId, versionId, sha256 }))).toEqual(s.prepare.supportingSources);
    const before = await snapshot();
    for (const [request_, result_, index] of [[s.prepare, prepared, 0], [decision, approved, 1], [request, issued, 0]] as const)
      expect(await executeManagedInvoiceCommand(request_, context.options(index))).toEqual({ ...result_, outcomeCode: "replayed" });
    expect(await snapshot()).toEqual(before);
    const [proof] = await context.fixture.owner`SELECT e.state,e.event_revision,i.amount_minor_units::text amount,
      pg_typeof(i.issue_date)::text issue_type,pg_typeof(i.due_date)::text due_type,
      i.issue_date::text issue_day,i.due_date::text due_day,
      (SELECT count(*)::integer FROM public.finance_invoices x WHERE x.commission_event_id=e.id) invoices,
      (SELECT count(*)::integer FROM public.managed_invoice_events h WHERE h.invoice_id=i.id) history
      FROM public.commission_events e JOIN public.finance_invoices i ON i.commission_event_id=e.id WHERE e.id=${s.prepare.commissionEventId}::uuid`;
    expect(proof).toEqual({ state: "invoiced", event_revision: 3, amount: "100", invoices: 1, history: 3,
      issue_type: "date", due_type: "date", issue_day: s.prepare.issueDate.slice(0, 10), due_day: s.prepare.dueDate.slice(0, 10) });
  }, 300_000);

  test("rejects changed payload and correlation retries without mutation", async () => {
    const s = await scenario(), recorded = await executeManagedInvoiceCommand(s.prepare, context.options(0));
    const before = await snapshot();
    expect(await executeManagedInvoiceCommand(s.prepare, context.options(0))).toEqual({ ...recorded, outcomeCode: "replayed" });
    expect(await snapshot()).toEqual(before);
    for (const changed of [{ ...s.prepare, invoiceNumber: "Changed synthetic number" }, { ...s.prepare, correlationId: randomUUID() }]) {
      await expect(executeManagedInvoiceCommand(changed, context.options(0))).rejects.toBeInstanceOf(FinanceDocumentConflictError);
      expect(await snapshot()).toEqual(before);
      const { correlationId, idempotencyKey, ...payload } = changed;
      const raw = await context.options(0).supabase.rpc("mmhr_managed_invoice_command", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
      expect(raw.error).toMatchObject({ code: "40001", message: "Managed invoice retry identifiers differ" });
      expect(raw.data).toBeNull(); expect(await snapshot()).toEqual(before);
    }
    const { correlationId, idempotencyKey, ...payload } = s.prepare;
    const malformed = await context.options(0).supabase.rpc("mmhr_managed_invoice_command", {
      payload: { ...payload, unexpectedFlag: true }, correlation_id: correlationId, idempotency_key: idempotencyKey });
    expect(malformed.error).toMatchObject({ code: "22023", message: "Invalid managed invoice command" });
    expect(malformed.data).toBeNull(); expect(await snapshot()).toEqual(before);
    const customer = await s.pending.context.customer.aal1.rpc("mmhr_managed_invoice_command", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
    expect(customer.error).toMatchObject({ code: "42501" });
    expect(customer.data).toBeNull(); expect(await snapshot()).toEqual(before);
    expect(await executeManagedInvoiceCommand(s.prepare, context.options(0))).toEqual({ ...recorded, outcomeCode: "replayed" });
    expect(await snapshot()).toEqual(before);
  }, 300_000);

  test("derives actual owner choices and denies foreign owners and crossed sources", async () => {
    const s = await scenario();
    const page = await getManagedInvoiceOwners({ organizationId: s.prepare.organizationId, commissionEventId: s.prepare.commissionEventId,
      correlationId: randomUUID() }, context.options(0));
    expect(page.owners.map(owner => owner.identityId)).toEqual(expect.arrayContaining(context.fixture.pair.map(actor => actor.identityId)));
    expect(page.owners.some(owner => owner.identityId === context.fixture.organizationAdmin.identityId)).toBe(false);
    await denied(() => executeManagedInvoiceCommand({ ...s.prepare, ownerIdentityId: context.fixture.organizationAdmin.identityId }, context.options(0)));
    await denied(() => executeManagedInvoiceCommand({ ...s.prepare, supportingSources: s.prepare.supportingSources.map((source, index) =>
      index === 0 ? { ...source, organizationId: s.prepare.organizationId } : source) }, context.options(0)));
  }, 300_000);

  test("downloads exact customer and internal originals through genuine invoice access with unchanged retries", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0));
    const stored = await detail(s);
    expect(new Set(stored.currentPreparation!.supportingOriginals.map(original => original.organizationId))).toEqual(
      new Set([s.prepare.organizationId, context.internalOrg]));
    const reviewedSources: Extract<ManagedInvoiceCommand, { action: "approve_invoice" | "reject_invoice" }>["reviewedSources"] = [];
    for (const original of stored.currentPreparation!.supportingOriginals) {
      const request = { organizationId: s.prepare.organizationId, commissionEventId: s.prepare.commissionEventId,
        invoiceId: s.prepare.invoiceId, preparationId: s.prepare.preparationId, source: invoiceSource(original),
        expectedRevision: original.document.revision, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      const downloaded = await downloadManagedInvoiceOriginal(request, context.options(1));
      expect(createHash("sha256").update(downloaded.bytes).digest("hex")).toBe(original.sha256);
      expect(downloaded.manifest).toMatchObject({ organizationId: original.organizationId, documentId: original.documentId,
        versionId: original.versionId, revision: original.document.revision, byteSize: original.document.byteSize,
        fileName: original.fileName, contentType: original.document.contentType, purpose: "finance_original", accessId: downloaded.reviewedAccessId });
      expect(downloaded).not.toHaveProperty("accessToken");
      const before = await snapshot();
      const replayed = await downloadManagedInvoiceOriginal(request, context.options(1));
      expect(replayed.reviewedAccessId).toBe(downloaded.reviewedAccessId);
      expect(replayed.bytes).toEqual(downloaded.bytes); expect(await snapshot()).toEqual(before);
      reviewedSources.push({ ...invoiceSource(original), reviewedAccessId: downloaded.reviewedAccessId });
    }
    await executeManagedInvoiceCommand({ ...await review(s), reviewedSources }, context.options(1));
    expect((await detail(s)).invoice?.status).toBe("ready");
  }, 360_000);

  test("denies crossed invoice originals, replaced preparations, and revoked internal source access", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0));
    const original = (await detail(s)).currentPreparation!.supportingOriginals.find(source => source.organizationId === context.internalOrg)!;
    const request = { organizationId: s.prepare.organizationId, commissionEventId: s.prepare.commissionEventId,
      invoiceId: s.prepare.invoiceId, preparationId: s.prepare.preparationId, source: invoiceSource(original),
      expectedRevision: original.document.revision, correlationId: randomUUID(), idempotencyKey: randomUUID() };
    await downloadManagedInvoiceOriginal(request, context.options(1));
    for (const crossed of [{ ...request, invoiceId: randomUUID() }, { ...request, preparationId: randomUUID() },
      { ...request, source: { ...request.source, documentId: randomUUID() } },
      { ...request, source: { ...request.source, sha256: "f".repeat(64) } },
      { ...request, expectedRevision: original.document.revision + 1 }])
      await denied(() => downloadManagedInvoiceOriginal(crossed, context.options(1)));
    const changed = await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='deny'
      WHERE identity_id=${context.fixture.pair[1].identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'
      RETURNING id`;
    expect(changed).toHaveLength(1);
    try {
      const client = context.options(1).supabase;
      const internal = await client.rpc("mmhr_authorize", { permission_key: "finance.manage", organization_id: context.internalOrg });
      expect(internal.error).toBeNull(); expect(internal.data).toEqual([]);
      const customer = await client.rpc("mmhr_authorize", { permission_key: "finance.manage", organization_id: s.prepare.organizationId });
      expect(customer.error).toBeNull(); expect(customer.data).toHaveLength(1);
      await denied(() => downloadManagedInvoiceOriginal(request, context.options(1)));
      await denied(() => downloadManagedInvoiceOriginal({ ...request, correlationId: randomUUID(), idempotencyKey: randomUUID() }, context.options(1)));
    }
    finally { await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='allow'
      WHERE identity_id=${context.fixture.pair[1].identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`; }
    await executeManagedInvoiceCommand({ ...s.prepare, preparationId: randomUUID(), expectedInvoiceRevision: 1, ...commandMetadata() }, context.options(0));
    await denied(() => downloadManagedInvoiceOriginal(request, context.options(1)));
  }, 360_000);

  test("waits for genuine original-access expiry, preserves exact retry evidence, and requires explicit fresh access", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0));
    const original = (await detail(s)).currentPreparation!.supportingOriginals.find(source => source.organizationId === context.internalOrg)!;
    const request = { organizationId: s.prepare.organizationId, commissionEventId: s.prepare.commissionEventId,
      invoiceId: s.prepare.invoiceId, preparationId: s.prepare.preparationId, source: invoiceSource(original),
      expectedRevision: original.document.revision, correlationId: randomUUID(), idempotencyKey: randomUUID() };
    const first = await downloadManagedInvoiceOriginal(request, context.options(1));
    const [expiry] = await context.fixture.owner<{ remaining_ms: number }[]>`SELECT greatest(0,
      extract(epoch FROM expires_at-clock_timestamp())*1000)::double precision remaining_ms
      FROM mmhr_private.finance_document_access_grants WHERE id=${first.reviewedAccessId}::uuid`;
    expect(expiry).toBeDefined(); expect(expiry!.remaining_ms).toBeGreaterThanOrEqual(0); expect(expiry!.remaining_ms).toBeLessThanOrEqual(60_000);
    await new Promise(resolve => setTimeout(resolve, expiry!.remaining_ms + 150));
    const before = await snapshot();
    await expect(downloadManagedInvoiceOriginal(request, context.options(1))).rejects.toBeInstanceOf(ManagedInvoiceOriginalAccessExpiredError);
    expect(await snapshot()).toEqual(before);
    const fresh = await downloadManagedInvoiceOriginal({ ...request, correlationId: randomUUID(), idempotencyKey: randomUUID() }, context.options(1));
    expect(fresh.reviewedAccessId).not.toBe(first.reviewedAccessId); expect(fresh.bytes).toEqual(first.bytes);
    const changed = await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='deny'
      WHERE identity_id=${context.fixture.pair[1].identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage' RETURNING id`;
    expect(changed).toHaveLength(1);
    try { await denied(() => downloadManagedInvoiceOriginal(request, context.options(1))); }
    finally { await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='allow'
      WHERE identity_id=${context.fixture.pair[1].identityId}::uuid AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`; }
  }, 420_000);

  test("rejects unapproved calculation and unknown commission money without invoice mutations", async () => {
    const pending = await context.pendingCalculation(await context.createCase());
    const request = { organizationId: pending.organizationId, commissionEventId: pending.commissionEventId, calculationId: pending.calculationId,
      supportingSources: [reference(pending.agreementOriginal), reference(pending.contractOriginal)], correlationId: randomUUID() };
    await denied(() => getManagedInvoiceSource(request, context.options(0)));
    const direct = { ...request, correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "prepare_invoice", reason: "Synthetic unapproved basis",
      invoiceId: randomUUID(), preparationId: randomUUID(), expectedEventRevision: 1, expectedInvoiceRevision: 0, expectedSourceDigest: pending.sourceDigest,
      ownerIdentityId: context.fixture.pair[0].identityId, invoiceNumber: "Synthetic unapproved invoice", issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86_400_000).toISOString(), collectionTerms: "Synthetic collection terms" };
    await denied(() => executeManagedInvoiceCommand(direct, context.options(0)));
  }, 300_000);

  test("serializes competing invoice identities and concurrent preparation revisions", async () => {
    const s = await scenario();
    const competing = { ...s.prepare, invoiceId: randomUUID(), preparationId: randomUUID(), ...commandMetadata() };
    const results = await Promise.allSettled([executeManagedInvoiceCommand(s.prepare, context.options(0)), executeManagedInvoiceCommand(competing, context.options(0))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? s.prepare : competing;
    const updates = [0, 1].map(() => ({ ...winner, preparationId: randomUUID(), expectedInvoiceRevision: 1, ...commandMetadata() }));
    const corrected = await Promise.allSettled(updates.map(request => executeManagedInvoiceCommand(request, context.options(0))));
    expect(corrected.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [count] = await context.fixture.owner`SELECT count(*)::integer total FROM public.finance_invoices WHERE commission_event_id=${s.prepare.commissionEventId}::uuid`;
    expect(count!.total).toBe(1);
  }, 300_000);

  test("blocks replacement approval, permits stale rejection, and uses fresh historical-original readiness", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0));
    await context.original(s.pending.organizationId, s.pending.context.source, s.pending.contractOriginal);
    const approval = await review(s); await denied(() => executeManagedInvoiceCommand(approval, context.options(1)));
    expect((await detail(s)).currentPreparation).toMatchObject({ canApprove: false, canReject: true, sourceCurrent: false });
    await executeManagedInvoiceCommand({ ...approval, action: "reject_invoice", ...commandMetadata() }, context.options(1));
    const source = await getManagedInvoiceSource({ organizationId: s.prepare.organizationId, correlationId: randomUUID(), commissionEventId: s.prepare.commissionEventId,
      calculationId: s.prepare.calculationId, supportingSources: s.prepare.supportingSources }, context.options(0));
    s.prepare = { ...s.prepare, preparationId: randomUUID(), expectedInvoiceRevision: 1, expectedSourceDigest: source.sourceDigest, ...commandMetadata() };
    await executeManagedInvoiceCommand(s.prepare, context.options(0)); await executeManagedInvoiceCommand(await review(s), context.options(1));
    expect((await detail(s)).invoice).toMatchObject({ status: "ready", invoiceRevision: 3 });
  }, 360_000);

  test("new approved facts invalidate readiness even when money stays equal", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0)); await executeManagedInvoiceCommand(await review(s), context.options(1));
    const [old] = await context.fixture.owner<{ id: string; version: number }[]>`SELECT id,version FROM public.finance_contract_facts_versions
      WHERE organization_id=${s.pending.organizationId}::uuid AND contract_id=${s.pending.context.source.contractId}::uuid AND state='approved' ORDER BY version DESC LIMIT 1`;
    const next = await context.facts(s.pending.context, s.pending.contractOriginal, { amountMinorUnits: null, currency: null },
      { predecessorVersionId: old!.id, expectedFactsRevision: old!.version });
    await context.sourceDecision(next, s.pending.contractOriginal, true);
    await denied(() => executeManagedInvoiceCommand(issue(s), context.options(0)));
    await denied(() => getManagedInvoiceSource({ organizationId: s.prepare.organizationId, correlationId: randomUUID(), commissionEventId: s.prepare.commissionEventId,
      calculationId: s.prepare.calculationId, supportingSources: s.prepare.supportingSources }, context.options(0)));
  }, 360_000);

  test("replacement of ready proposal preserves approval but prevents issue through old readiness", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0)); const approval = await review(s);
    await executeManagedInvoiceCommand(approval, context.options(1)); const oldIssue = issue(s);
    await executeManagedInvoiceCommand({ ...s.prepare, preparationId: randomUUID(), expectedInvoiceRevision: 2,
      invoiceNumber: "Synthetic corrected readiness", ...commandMetadata() }, context.options(0));
    await denied(() => executeManagedInvoiceCommand(oldIssue, context.options(0)));
    expect(await executeManagedInvoiceCommand(approval, context.options(1))).toMatchObject({ outcomeCode: "replayed", invoiceRevision: 2, status: "ready" });
    const [old] = await context.fixture.owner`SELECT state,revision FROM public.managed_invoice_preparations WHERE id=${s.prepare.preparationId}::uuid`;
    expect(old).toEqual({ state: "approved", revision: 2 });
  }, 300_000);

  test.each([0, 1] as const)("current revoked owner or reviewer %s prevents issue and restores after permission recovery", async index => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0)); await executeManagedInvoiceCommand(await review(s), context.options(1));
    await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE identity_id=${context.fixture.pair[index].identityId}::uuid
      AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`;
    try { await denied(() => executeManagedInvoiceCommand(issue(s), context.options(index === 0 ? 1 : 0))); }
    finally { await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE identity_id=${context.fixture.pair[index].identityId}::uuid
      AND organization_id=${context.internalOrg}::uuid AND permission_key='finance.manage'`; }
    expect((await detail(s)).currentPreparation?.canIssue).toBe(true);
  }, 300_000);

  test("waits for the proposed issue date without auto-setting payment state", async () => {
    const s = await scenario(); s.prepare = { ...s.prepare, issueDate: new Date(Date.now() + 86_400_000).toISOString(), dueDate: new Date(Date.now() + 172_800_000).toISOString() };
    await executeManagedInvoiceCommand(s.prepare, context.options(0)); await executeManagedInvoiceCommand(await review(s), context.options(1));
    await denied(() => executeManagedInvoiceCommand(issue(s), context.options(0)));
    expect((await detail(s)).currentPreparation?.canIssue).toBe(false);
  }, 300_000);

  test("issues a known zero commission without fabricating a payment or paid event", async () => {
    const s = await scenario(true); expect(s.source.amountMinorUnits).toBe(0);
    await executeManagedInvoiceCommand(s.prepare, context.options(0)); await executeManagedInvoiceCommand(await review(s), context.options(1));
    await executeManagedInvoiceCommand(issue(s), context.options(0));
    const [proof] = await context.fixture.owner`SELECT e.state,i.amount_minor_units::text amount,
      (SELECT count(*)::integer FROM public.commission_payments p WHERE p.commission_event_id=e.id) payments
      FROM public.commission_events e JOIN public.finance_invoices i ON i.commission_event_id=e.id WHERE e.id=${s.prepare.commissionEventId}::uuid`;
    expect(proof).toEqual({ state: "invoiced", amount: "0", payments: 0 });
  }, 360_000);

  test("audit failure rolls back invoice preparation and retains a safe retry", async () => {
    const s = await scenario();
    await context.fixture.owner`CREATE FUNCTION mmhr_private.synthetic_invoice_audit_failure() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN IF NEW.command='r7.invoice.managed.prepare_invoice' THEN RAISE EXCEPTION 'Synthetic invoice audit failure'; END IF; RETURN NEW; END $$`;
    await context.fixture.owner`CREATE TRIGGER synthetic_invoice_audit_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.synthetic_invoice_audit_failure()`;
    const before = await snapshot();
    try {
      const { correlationId, idempotencyKey, ...payload } = s.prepare;
      const raw = await context.options(0).supabase.rpc("mmhr_managed_invoice_command", {
        payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
      });
      expect(raw.error).toMatchObject({ code: "P0001", message: "Synthetic invoice audit failure" });
      expect(await snapshot()).toEqual(before);
      await expect(executeManagedInvoiceCommand(s.prepare, context.options(0))).rejects.toThrow("Managed invoice request failed");
      expect(await snapshot()).toEqual(before);
    }
    finally { await context.fixture.owner`DROP TRIGGER synthetic_invoice_audit_failure ON public.audit_events`;
      await context.fixture.owner`DROP FUNCTION mmhr_private.synthetic_invoice_audit_failure()`; }
    expect(await executeManagedInvoiceCommand(s.prepare, context.options(0))).toMatchObject({ status: "draft", outcomeCode: "recorded" });
  }, 300_000);

  test("denies owner direct issue, forged history and forged request digest with no retained mutation", async () => {
    const s = await scenario(); await executeManagedInvoiceCommand(s.prepare, context.options(0)); await detail(s);
    const before = await snapshot();
    for (const attack of ["issue", "digest", "history"] as const) {
      await expect(signedOwner(context.fixture, context.options(0).supabase, async sql => {
        if (attack === "issue") await sql`UPDATE public.finance_invoices SET status='issued',invoice_revision=invoice_revision+1 WHERE id=${s.prepare.invoiceId}::uuid`;
        else if (attack === "digest") await sql`UPDATE public.managed_invoice_preparations SET prepare_request_digest=${"f".repeat(64)} WHERE id=${s.prepare.preparationId}::uuid`;
        else {
          const forged = issue(s), { correlationId, idempotencyKey, ...payload } = forged;
          const [receipt] = await sql<{ id: string; checked_at: string }[]>`WITH now_value AS (SELECT clock_timestamp() checked_at)
            SELECT (mmhr_private.r1_finish_security_command(${context.fixture.pair[0].identityId}::uuid,'r7.invoice.managed.issue_invoice',
              'finance.issue_invoice','finance_invoice',${s.prepare.invoiceId}::uuid,${s.prepare.organizationId}::uuid,${payload.reason},${correlationId}::uuid,
              ${idempotencyKey}::uuid,${JSON.stringify(payload)}::jsonb,jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),checked_at)->>'receipt_id') id,
              checked_at::text FROM now_value`;
          await sql`INSERT INTO public.managed_invoice_events(organization_id,invoice_id,preparation_id,action,actor_identity_id,receipt_id,correlation_id,
            request,request_digest,invoice_snapshot,preparation_snapshot,result,occurred_at)
            SELECT h.organization_id,h.invoice_id,h.preparation_id,'issue_invoice',h.actor_identity_id,${receipt!.id}::uuid,${correlationId}::uuid,
              ${JSON.stringify(payload)}::jsonb,mmhr_private.r7_managed_digest(${JSON.stringify(payload)}::jsonb),h.invoice_snapshot,h.preparation_snapshot,h.result,${receipt!.checked_at}::timestamptz
            FROM public.managed_invoice_events h WHERE h.invoice_id=${s.prepare.invoiceId}::uuid LIMIT 1`;
        }
      })).rejects.toMatchObject({ code: "42501" });
      expect(await snapshot()).toEqual(before);
    }
  }, 300_000);

  test("forces raw table denial and preserves public RPC identity and function properties", async () => {
    const rows = await context.fixture.owner<{ name: string; rls: boolean; forced: boolean; restrictive: boolean }[]>`SELECT c.relname name,
      c.relrowsecurity rls,c.relforcerowsecurity forced,EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive) restrictive
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
        AND c.relname IN ('managed_invoice_preparations','managed_invoice_events') ORDER BY c.relname`;
    expect(rows).toHaveLength(2); for (const row of rows) expect(row).toMatchObject({ rls: true, forced: true, restrictive: true });
    for (const role of ["anon", "authenticated", "service_role", "mmhr_worker", "mmhr_document_worker"])
      for (const table of ["managed_invoice_preparations", "managed_invoice_events"])
        for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          const [proof] = await context.fixture.owner`SELECT has_table_privilege(${role},${`public.${table}`},${operation}) allowed`;
          expect(proof!.allowed).toBe(false);
        }
    for (const signature of ["public.mmhr_managed_invoice_command(jsonb,uuid,uuid)", "public.mmhr_get_managed_invoice_owners(jsonb,uuid)",
      "public.mmhr_get_managed_invoice_source(jsonb,uuid)", "public.mmhr_get_managed_invoice_detail(jsonb,uuid)"]) {
      const [row] = await context.fixture.owner`SELECT p.provolatile volatility,p.proparallel parallel,p.prosecdef definer,
        p.proconfig settings,pg_get_function_result(p.oid) result FROM pg_proc p WHERE p.oid=${signature}::regprocedure`;
      expect(row).toMatchObject({ volatility: "v", parallel: "u", definer: true, result: "jsonb" });
      expect((row!.settings as string[]).some(setting => /^search_path=""$/.test(setting))).toBe(true);
      expect((row!.settings as string[]).some(setting => /^timezone=UTC$/i.test(setting))).toBe(true);
      for (const role of ["anon", "authenticated", "service_role", "mmhr_worker", "mmhr_document_worker"]) {
        const [proof] = await context.fixture.owner`SELECT has_function_privilege(${role},${signature},'EXECUTE') allowed`;
        expect(proof!.allowed).toBe(role === "authenticated");
      }
    }
  }, 60_000);
  registerManagedInvoiceBoundaryRegressions({ context: () => context, scenario, snapshot });
  registerInvoiceDateAlignmentRegressions({ context: () => context, snapshot });
});
