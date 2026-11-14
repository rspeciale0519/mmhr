import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { executeManagedFinanceCommand, getManagedFinanceDetail, getManagedFinancePage, getManagedFinanceOriginals } from "@/server/commands/managed-finance";
import { AuthorizationError } from "@/server/auth/authorization";
import { elevatedClient } from "@/server/auth/security-command-api-fixtures";
import { commandMetadata, financeSnapshot, type ManagedFinanceAuthFixture } from "./r7-managed-finance-auth-fixtures";

export function registerManagedFinanceReadRegressions(getContext: () => ManagedFinanceAuthFixture) {
  test("returns actual exact original metadata, preserves inactive vendor history and excludes new choices", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
    const request = { organizationId: context.internalOrg, source: pending.agreementOriginal.source, correlationId: randomUUID() };
    const choices = await getManagedFinanceOriginals(request, context.options(1));
    expect(choices.items).toHaveLength(1);
    expect(choices.items[0]?.original).toEqual({ organizationId: context.internalOrg, documentId: pending.agreementOriginal.documentId,
      versionId: pending.agreementOriginal.versionId, sha256: pending.agreementOriginal.sha256 });
    expect(choices.items[0]?.document).toMatchObject({ isCurrent: true, state: "approved", fileName: "synthetic-managed.pdf" });
    const contracts = await getManagedFinancePage({ organizationId: pending.organizationId, view: "contracts", correlationId: randomUUID() }, context.options(1));
    expect(contracts.view).toBe("contracts");
    if (contracts.view !== "contracts") throw new Error("Actual contract page missing");
    expect(contracts.items.some(item => item.contractId === pending.context.source.contractId)).toBe(true);
    const agreements = await getManagedFinancePage({ organizationId: context.internalOrg, view: "agreements", correlationId: randomUUID() }, context.options(1));
    expect(agreements.view).toBe("agreements");
    const signedChoices = await getManagedFinanceOriginals({ organizationId: pending.organizationId,
      source: pending.context.source, correlationId: randomUUID() }, context.options(1));
    expect(signedChoices.items[0]?.original.versionId).toBe(pending.contractOriginal.versionId);
    expect(signedChoices.items[0]?.dealLabel).not.toBeNull();
    await context.fixture.owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp() WHERE id=${pending.context.source.vendorOrganizationId}::uuid`;
    try {
      const before = await financeSnapshot(context.fixture);
      const detail = await getManagedFinanceDetail({ organizationId: context.internalOrg, entityId: pending.context.agreementId,
        view: "agreement", correlationId: randomUUID() }, context.options(1));
      if (detail.view !== "agreement") throw new Error("Actual agreement detail missing");
      expect(detail.versions[0]?.original).toMatchObject({ versionId: pending.agreementOriginal.versionId, sha256: pending.agreementOriginal.sha256 });
      await context.originalAccess(pending.agreementOriginal, 1);
      // Access has its own receipt. Take the no-mutation baseline after the actual download.
      const downloaded = await financeSnapshot(context.fixture);
      await expect(getManagedFinanceOriginals(request, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
      expect(await financeSnapshot(context.fixture)).toEqual(downloaded);
      expect(before.sources).toEqual(downloaded.sources);
    } finally { await context.fixture.owner`UPDATE public.orgs SET status='active',suspended_at=NULL WHERE id=${pending.context.source.vendorOrganizationId}::uuid`; }
  }, 180_000);

  test("shows stale calculation approval and rejection separately and denies public stale approval without writes", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
    await context.original(pending.organizationId, pending.contractOriginal.source, pending.contractOriginal);
    const read = { organizationId: pending.organizationId, entityId: pending.calculationId, view: "calculation", correlationId: randomUUID() };
    const projection = await getManagedFinanceDetail(read, context.options(1));
    if (projection.view !== "calculation") throw new Error("Actual calculation detail missing");
    expect(projection.calculation).toMatchObject({ canApprove: false, canReject: true, canDecide: true });
    expect(projection.calculation.blockerCodes).toContain("source_changed");
    expect(projection.calculation.contractOriginal.document.isCurrent).toBe(false);
    const decision = { organizationId: pending.organizationId, action: "approve_calculation", calculationId: pending.calculationId,
      commissionEventId: pending.commissionEventId, expectedEventRevision: 1, expectedCalculationRevision: 1,
      expectedSourceDigest: pending.sourceDigest, reviewReference: "synthetic:stale-result", ...commandMetadata() };
    const before = await financeSnapshot(context.fixture);
    await expect(executeManagedFinanceCommand(decision, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
    expect(await financeSnapshot(context.fixture)).toEqual(before);
    await executeManagedFinanceCommand({ ...decision, action: "reject_calculation", ...commandMetadata() }, context.options(1));
    const [event] = await context.fixture.owner`SELECT state,event_revision,calculation_revision FROM public.commission_events WHERE id=${pending.commissionEventId}::uuid`;
    expect(event).toEqual({ state: "pending_review", event_revision: 1, calculation_revision: 0 });
  }, 180_000);

  test("paginates actual pending calculations and descending source versions without gaps or invented rows", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
    const expectedCalculations = new Set([pending.calculationId]);
    for (let index = 0; index < 26; index++) {
      const calculationId = randomUUID(); expectedCalculations.add(calculationId);
      await executeManagedFinanceCommand({ ...pending.request, calculationId, ...commandMetadata() }, context.options(0));
    }
    const seen = new Set<string>(); let afterId: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await getManagedFinancePage({ organizationId: pending.organizationId, view: "calculations", correlationId: randomUUID(),
        ...(afterId ? { afterId } : {}) }, context.options(1));
      if (result.view !== "calculations") throw new Error("Actual calculation page missing");
      for (const item of result.items) { expect(seen.has(item.calculationId)).toBe(false); seen.add(item.calculationId); }
      if (!result.nextCursor) break;
      expect(result.items).toHaveLength(25); expect(result.nextCursor).toBe(result.items[24]?.calculationId); afterId = result.nextCursor;
    }
    expect(seen).toEqual(expectedCalculations);
    const [factsTip] = await context.fixture.owner`SELECT id,version FROM public.finance_contract_facts_versions
      WHERE organization_id=${pending.organizationId}::uuid AND contract_id=${pending.context.source.contractId}::uuid AND state='approved'`;
    for (let index = 0; index < 26; index++) await context.facts(pending.context, pending.contractOriginal,
      { amountMinorUnits: index, currency: "USD" }, { expectedFactsRevision: factsTip!.version as number, predecessorVersionId: factsTip!.id as string });
    const first = await getManagedFinanceDetail({ organizationId: pending.organizationId, view: "contract",
      entityId: pending.context.source.contractId, correlationId: randomUUID() }, context.options(1));
    if (first.view !== "contract") throw new Error("Actual facts page missing");
    expect(first.versions.map(item => item.version)).toEqual(Array.from({ length: 25 }, (_, index) => 27 - index));
    expect(first.nextVersion).toBe(3);
    const second = await getManagedFinanceDetail({ organizationId: pending.organizationId, view: "contract",
      entityId: pending.context.source.contractId, beforeVersion: first.nextVersion!, correlationId: randomUUID() }, context.options(1));
    if (second.view !== "contract") throw new Error("Actual facts page missing");
    expect(second.versions.map(item => item.version)).toEqual([2, 1]); expect(second.nextVersion).toBeNull();
  }, 300_000);

  test("paginates independently approved Storage originals with an exact exclusive version cursor", async () => {
    const context = getContext(), source = await context.createCase();
    const binding = { sourceClass: "agreement" as const, vendorOrganizationId: source.source.vendorOrganizationId };
    const ids = [];
    for (let index = 0; index < 26; index++) ids.push((await context.original(context.internalOrg, binding)).versionId);
    const first = await getManagedFinanceOriginals({ organizationId: context.internalOrg, source: binding, correlationId: randomUUID() }, context.options(1));
    expect(first.items.map(item => item.original.versionId)).toEqual([...ids].sort().slice(0, 25));
    expect(first.nextCursor).toBe([...ids].sort()[24]);
    const second = await getManagedFinanceOriginals({ organizationId: context.internalOrg, source: binding,
      afterVersionId: first.nextCursor!, correlationId: randomUUID() }, context.options(1));
    expect(second.items.map(item => item.original.versionId)).toEqual([...ids].sort().slice(25)); expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].every(item => item.document.isCurrent && item.document.state === "approved")).toBe(true);
  }, 600_000);

  test("rejects malformed raw reads, crossed workspace IDs and missing entities without receipts or business writes", async () => {
    const context = getContext(), pending = await context.pendingCalculation(await context.createCase());
    const client = elevatedClient(context.fixture.pair[1]), before = await financeSnapshot(context.fixture);
    for (const payload of [null, [], { organizationId: pending.organizationId, view: "contracts", afterId: null },
      { organizationId: pending.organizationId, view: "contracts", forged: true }]) {
      const result = await client.rpc("mmhr_get_managed_finance_page", { payload, correlation_id: randomUUID() });
      expect(result.error?.code).toBe("22023");
    }
    for (const input of [{ organizationId: pending.organizationId, view: "agreement", entityId: pending.context.agreementId },
      { organizationId: context.internalOrg, view: "calculation", entityId: pending.calculationId },
      { organizationId: pending.organizationId, view: "contract", entityId: randomUUID() }])
      await expect(getManagedFinanceDetail({ ...input, correlationId: randomUUID() }, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
    const source = { ...pending.context.source, contractId: randomUUID() };
    await expect(getManagedFinanceOriginals({ organizationId: pending.organizationId, source, correlationId: randomUUID() }, context.options(1))).rejects.toBeInstanceOf(AuthorizationError);
    expect(await financeSnapshot(context.fixture)).toEqual(before);
  }, 180_000);
}
