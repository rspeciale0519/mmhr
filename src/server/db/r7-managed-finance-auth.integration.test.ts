import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { executeManagedFinanceCommand, getManagedFinanceDetail } from "@/server/commands/managed-finance";
import { FinanceDocumentInputError } from "@/server/commands/finance-document-errors";
import { AuthorizationError } from "@/server/auth/authorization";
import { createManagedFinanceAuthFixture, commandMetadata, financeSnapshot, type ManagedFinanceAuthFixture } from "./test/r7-managed-finance-auth-fixtures";
import { registerManagedFinanceSecurityRegressions } from "./test/r7-managed-finance-security-regressions";
import { registerManagedFinanceReadRegressions } from "./test/r7-managed-finance-read-regressions";
import { registerManagedCalculationRejectionRegressions } from "./test/r7-managed-calculation-rejection-regressions";

describe("Managed finance through genuine disposable Auth, Storage and signed portal sources", () => {
  let context: ManagedFinanceAuthFixture;
  const replaced = new Map<string, Awaited<ReturnType<ManagedFinanceAuthFixture["pendingCalculation"]>>>();
  beforeAll(async () => { context = await createManagedFinanceAuthFixture(); }, 420_000);
  afterAll(async () => { if (context) await context.close(); }, 180_000);
  // Budgets cover complete Auth/Storage journeys. Each RPC keeps its normal deadline.
  const journey = (name: string, run: () => Promise<void>, budget = 180_000) => test(name, run, budget);

  journey("publishes independently approved flat commission with genuinely unknown contract money and immutable exact retries", async () => {
    const pending = await context.pendingCalculation(await context.createCase());
    const decision = { organizationId: pending.organizationId, action: "approve_calculation", commissionEventId: pending.commissionEventId,
      calculationId: pending.calculationId, expectedEventRevision: 1, expectedCalculationRevision: 1,
      expectedSourceDigest: pending.sourceDigest, reviewReference: "synthetic:known-flat-fee", ...commandMetadata() };
    const before = await financeSnapshot(context.fixture);
    await expect(executeManagedFinanceCommand(decision, context.options(0))).rejects.toBeInstanceOf(AuthorizationError);
    expect(await financeSnapshot(context.fixture)).toEqual(before);
    const accepted = await executeManagedFinanceCommand(decision, context.options(1));
    expect(accepted).toMatchObject({ entityId: pending.calculationId, revision: 2, outcomeCode: "recorded" });
    const [event] = await context.fixture.owner`SELECT state,event_revision,calculation_revision,commission_amount_minor_units::text amount,
      currency,contract_value_minor_units,contract_currency FROM public.commission_events WHERE id=${pending.commissionEventId}::uuid`;
    expect(event).toEqual({ state: "approved", event_revision: 2, calculation_revision: 1, amount: "100", currency: "USD",
      contract_value_minor_units: null, contract_currency: null });
    const saved = await financeSnapshot(context.fixture);
    expect(await executeManagedFinanceCommand(decision, context.options(1))).toEqual({ ...accepted, outcomeCode: "replayed" });
    expect(await executeManagedFinanceCommand(pending.request, context.options(0))).toMatchObject({ revision: 1, outcomeCode: "replayed" });
    expect(await executeManagedFinanceCommand(pending.eligibility, context.options(0))).toMatchObject({ entityId: pending.commissionEventId, revision: 1, outcomeCode: "replayed" });
    expect(await financeSnapshot(context.fixture)).toEqual(saved);
    await expect(executeManagedFinanceCommand({ ...decision, correlationId: randomUUID() }, context.options(1))).rejects.toBeInstanceOf(FinanceDocumentInputError);
    await expect(executeManagedFinanceCommand({ ...decision, reason: "Changed retry reason" }, context.options(1))).rejects.toBeInstanceOf(FinanceDocumentInputError);
    expect(await financeSnapshot(context.fixture)).toEqual(saved);
    const secondKey = { ...pending.eligibility, ...commandMetadata() };
    const second = await executeManagedFinanceCommand(secondKey, context.options(1));
    expect(second).toMatchObject({ entityId: pending.commissionEventId, revision: 1, outcomeCode: "replayed" });
    const [proof] = await context.fixture.owner`SELECT
      (SELECT count(*)::int FROM public.commission_events WHERE contract_id=${pending.context.source.contractId}::uuid) events,
      (SELECT count(*)::int FROM public.managed_commission_sources WHERE commission_event_id=${pending.commissionEventId}::uuid) sources,
      (SELECT count(*)::int FROM public.managed_finance_events WHERE entity_type='commission_event' AND entity_id=${pending.commissionEventId}::uuid) history`;
    expect(proof).toEqual({ events: 1, sources: 1, history: 1 });
    const ownReceipt = await financeSnapshot(context.fixture);
    expect(await executeManagedFinanceCommand(secondKey, context.options(1))).toEqual(second);
    expect(await financeSnapshot(context.fixture)).toEqual(ownReceipt);
    const detail = await getManagedFinanceDetail({ organizationId: pending.organizationId, view: "calculation",
      entityId: pending.calculationId, correlationId: randomUUID() }, context.options(1));
    expect(detail.view).toBe("calculation");
    if (detail.view !== "calculation") throw new Error("Actual calculation detail missing");
    expect(detail.calculation).toMatchObject({ state: "approved", canApprove: false, canReject: false,
      amountMinorUnits: 100, contractValue: { amountMinorUnits: null, currency: null }, agreementOrganizationId: context.internalOrg });
  });

  for (const mode of ["zero", "rate", "rate_missing", "rate_fx", "unsupported", "conditional"] as const) journey(`keeps ${mode} rules explicit without inferred quote totals or currencies`, async () => {
    const source = await context.createCase();
    const agreementOriginal = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId });
    const rule = mode === "zero" || mode === "conditional" ? { kind: "flat_amount" as const, amountMinorUnits: 0, currency: "USD" as const }
      : mode.startsWith("rate") ? { kind: "contract_value_rate" as const, rateBasisPoints: 100, currency: "USD" as const }
        : { kind: "unsupported" as const, sourceTermReference: "synthetic:unsupported-rule" };
    const agreement = await context.agreement(source, agreementOriginal, rule,
      mode === "conditional" ? { conditionReferences: ["synthetic:unimplemented-condition"] } : {});
    const approved = await context.sourceDecision(agreement, agreementOriginal, true);
    expect(approved.result).toMatchObject({ revision: 2, outcomeCode: "recorded" });
    expect(await executeManagedFinanceCommand(agreement, context.options(0))).toMatchObject({ revision: 1, outcomeCode: "replayed" });
    const contractOriginal = await context.original(source.organizationId, source.source);
    const facts = await context.facts(source, contractOriginal, mode === "rate" || mode === "rate_fx"
      ? { amountMinorUnits: 10050, currency: mode === "rate_fx" ? "EUR" : "USD" } : { amountMinorUnits: null, currency: mode === "zero" ? "USD" : null });
    await context.sourceDecision(facts, contractOriginal, true);
    const eligibility = await executeManagedFinanceCommand({ organizationId: source.organizationId, action: "resolve_eligibility",
      contractId: source.source.contractId, handoffId: source.source.handoffId, ...commandMetadata() }, context.options(0));
    const [initial] = await context.fixture.owner`SELECT structure_id,currency,commission_amount_minor_units,contract_value_minor_units,
      event_revision,calculation_revision FROM public.commission_events WHERE id=${eligibility.entityId}::uuid`;
    expect(initial).toMatchObject({ commission_amount_minor_units: null, contract_value_minor_units: null, event_revision: 1, calculation_revision: 0 });
    if (mode === "unsupported") expect(initial).toMatchObject({ structure_id: null, currency: null });
    const detail = await getManagedFinanceDetail({ organizationId: source.organizationId, view: "contract",
      entityId: source.source.contractId, correlationId: randomUUID() }, context.options(0));
    if (detail.view !== "contract" || !detail.contract.currentSourceDigest) throw new Error("Actual contract projection missing");
    const prepare = { organizationId: source.organizationId, action: "prepare_calculation", calculationId: randomUUID(),
      commissionEventId: eligibility.entityId, expectedEventRevision: 1, expectedSourceDigest: detail.contract.currentSourceDigest, ...commandMetadata() };
    await executeManagedFinanceCommand(prepare, context.options(0));
    const projection = await getManagedFinanceDetail({ organizationId: source.organizationId, view: "calculation",
      entityId: prepare.calculationId, correlationId: randomUUID() }, context.options(1));
    if (projection.view !== "calculation") throw new Error("Actual calculation projection missing");
    expect(projection.calculation.amountMinorUnits).toBe(mode === "zero" ? 0 : mode === "rate" ? 101 : null);
    const calculated = mode === "zero" || mode === "rate";
    expect(projection.calculation.canApprove).toBe(calculated);
    if (mode === "rate_missing") expect(projection.calculation.blockerCodes).toEqual(["contract_value_missing", "contract_currency_missing"]);
    if (mode === "rate_fx") expect(projection.calculation.blockerCodes).toEqual(["currency_conversion_unsupported"]);
    if (mode === "conditional") expect(projection.calculation.blockerCodes).toEqual(["conditions_unsupported"]);
    expect(projection.calculation.canReject).toBe(true);
    const decision = { ...prepare, action: calculated ? "approve_calculation" : "reject_calculation",
      expectedCalculationRevision: 1, reviewReference: "synthetic:exact-minor-units", ...commandMetadata() };
    if (!calculated) {
      const before = await financeSnapshot(context.fixture);
      await expect(executeManagedFinanceCommand({ ...decision, action: "approve_calculation", ...commandMetadata() }, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
      expect(await financeSnapshot(context.fixture)).toEqual(before);
    }
    await executeManagedFinanceCommand(decision, context.options(1));
    const [final] = await context.fixture.owner`SELECT state,event_revision,calculation_revision,commission_amount_minor_units::text amount
      FROM public.commission_events WHERE id=${eligibility.entityId}::uuid`;
    expect(final).toEqual(!calculated ? { state: "pending_review", event_revision: 1, calculation_revision: 0, amount: null }
      : { state: "approved", event_revision: 2, calculation_revision: 1, amount: String(mode === "zero" ? 0 : 101) });
  });

  journey("rejects stale agreement and facts sources while denying their stale approvals without writes", async () => {
    const source = await context.createCase();
    for (const kind of ["agreement", "contract"] as const) {
      const original = await context.original(kind === "agreement" ? context.internalOrg : source.organizationId,
        kind === "agreement" ? { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId } : source.source);
      const request = kind === "agreement" ? await context.agreement(source, original, { kind: "flat_amount", amountMinorUnits: 4, currency: "USD" })
        : await context.facts(source, original, { amountMinorUnits: 0, currency: "USD" });
      await context.original(original.organizationId, original.source, original);
      const [prepared] = await context.fixture.owner`SELECT source_digest FROM (
        SELECT id,source_digest FROM public.finance_agreement_versions UNION ALL SELECT id,source_digest FROM public.finance_contract_facts_versions
      ) versions WHERE id=${request.versionId}::uuid`;
      const reviewedAccessId = await context.originalAccess(original, 1);
      const decision = { organizationId: request.organizationId, versionId: request.versionId, expectedRevision: 1,
        expectedSourceDigest: prepared!.source_digest, reviewedAccessId, contentsReviewed: true,
        reviewReference: "synthetic:stale-original", ...commandMetadata(),
        ...(request.action === "prepare_agreement" ? { action: "approve_agreement", agreementId: request.agreementId,
          expectedSeriesRevision: request.expectedSeriesRevision, predecessorVersionId: request.predecessorVersionId }
          : { action: "approve_contract_facts", contractId: request.contractId, expectedFactsRevision: request.expectedFactsRevision,
            predecessorVersionId: request.predecessorVersionId }) };
      const before = await financeSnapshot(context.fixture);
      await expect(executeManagedFinanceCommand(decision, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
      expect(await financeSnapshot(context.fixture)).toEqual(before);
      const rejected = await context.sourceDecision(request, original, false);
      expect(rejected.result).toMatchObject({ revision: 2, outcomeCode: "recorded" });
      expect(await executeManagedFinanceCommand(rejected.request, context.options(1))).toEqual({ ...rejected.result, outcomeCode: "replayed" });
      const [published] = kind === "agreement" ? await context.fixture.owner`SELECT count(*)::int count FROM public.finance_agreement_applicability WHERE version_id=${request.versionId}::uuid`
        : await context.fixture.owner`SELECT count(*)::int count FROM public.finance_contract_facts_versions WHERE id=${request.versionId}::uuid AND state='approved'`;
      expect(published?.count).toBe(0);
    }
  }, 240_000);

  journey("selects the stored signing-time agreement at an exact cutover and preserves it after a future amendment", async () => {
    const source = await context.createCase();
    const [signature] = await context.fixture.owner`SELECT to_jsonb(signed_at)#>>'{}' signed_at FROM public.portal_contract_handoff_details WHERE contract_id=${source.source.contractId}::uuid`;
    const original = await context.original(context.internalOrg, { sourceClass: "agreement", vendorOrganizationId: source.source.vendorOrganizationId });
    const first = await context.agreement(source, original, { kind: "flat_amount", amountMinorUnits: 1, currency: "USD" }, { effectiveFrom: signature!.signed_at as string });
    await context.sourceDecision(first, original, true);
    const next = await context.agreement(source, original, { kind: "flat_amount", amountMinorUnits: 999, currency: "USD" },
      { effectiveFrom: new Date(Date.now() + 86_400_000).toISOString(), expectedSeriesRevision: 1,
        predecessorVersionId: first.versionId, replacementSourceReference: "synthetic:future-amendment" });
    await context.sourceDecision(next, original, true);
    const resolve = { organizationId: source.organizationId, action: "resolve_eligibility", contractId: source.source.contractId,
      handoffId: source.source.handoffId, ...commandMetadata() };
    const [left, right] = await Promise.all([executeManagedFinanceCommand(resolve, context.options(0)),
      executeManagedFinanceCommand({ ...resolve, ...commandMetadata() }, context.options(1))]);
    expect(left.entityId).toBe(right.entityId);
    expect([left.outcomeCode, right.outcomeCode].sort()).toEqual(["recorded", "replayed"]);
    const [saved] = await context.fixture.owner`SELECT s.agreement_version_id,s.source_snapshot->>'signedAt' signed_at,
      (SELECT count(*)::int FROM public.commission_events WHERE organization_id=${source.organizationId}::uuid) events
      FROM public.managed_commission_sources s WHERE s.commission_event_id=${left.entityId}::uuid`;
    expect(saved).toEqual({ agreement_version_id: first.versionId, signed_at: signature!.signed_at, events: 1 });
  });

  registerManagedFinanceSecurityRegressions(() => context);
  registerManagedFinanceReadRegressions(() => context);
  registerManagedCalculationRejectionRegressions(() => ({ fixture: context.fixture,
    async preparePendingCalculation() {
      const pending = await context.pendingCalculation(await context.createCase()); replaced.set(pending.calculationId, pending); return pending;
    },
    async replacePreparedOriginal(calculation) {
      const pending = replaced.get(calculation.calculationId);
      if (!pending) throw new Error("Actual prepared source missing");
      await context.original(pending.organizationId, pending.contractOriginal.source, pending.contractOriginal);
    } }));
});
