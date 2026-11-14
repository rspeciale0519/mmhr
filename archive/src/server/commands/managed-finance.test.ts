import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError } from "@/server/auth/authorization";
import { FinanceDocumentInputError, FinanceDocumentConflictError } from "./finance-document-errors";
import { executeManagedFinanceCommand, getManagedFinancePage, getManagedFinanceDetail, getManagedFinanceOriginals } from "./managed-finance";

const { authority, rpc } = vi.hoisted(() => ({ authority: vi.fn(), rpc: vi.fn() }));
vi.mock("./finance-document-upload", () => ({ requireFinanceDocumentAuthority: authority }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = { organizationId: id(1), correlationId: id(2) };
const command = { ...origin, action: "resolve_eligibility" as const, contractId: id(3), handoffId: id(4),
  idempotencyKey: id(5), reason: "Resolve stored signing evidence" };
const result = { ...origin, action: command.action, contractId: command.contractId, handoffId: command.handoffId,
  entityId: id(6), revision: 1, outcomeCode: "recorded" };
const read = { ...origin, view: "agreements" as const };
const page = { ...origin, view: "agreements", items: [], nextCursor: null };
const detailRead = { ...origin, entityId: id(7), view: "agreement" as const };
const detail = { ...origin, entityId: id(7), currentActorIdentityId: id(8), view: "agreement",
  agreement: { agreementId: id(7), vendorOrganizationId: id(9), vendorLabel: "Synthetic vendor",
    seriesRevision: 0, currentApprovedVersionId: null, pendingVersionCount: 0 }, versions: [], nextVersion: null };
const originalsRead = { ...origin, source: { sourceClass: "agreement" as const, vendorOrganizationId: id(9) } };
const originals = { ...originalsRead, items: [], nextCursor: null };
const operations = [
  { execute: executeManagedFinanceCommand, input: command, output: result, name: "mmhr_managed_finance_command" },
  { execute: getManagedFinancePage, input: read, output: page, name: "mmhr_get_managed_finance_page" },
  { execute: getManagedFinanceDetail, input: detailRead, output: detail, name: "mmhr_get_managed_finance_detail" },
  { execute: getManagedFinanceOriginals, input: originalsRead, output: originals, name: "mmhr_get_managed_finance_originals" },
];
beforeEach(() => {
  authority.mockReset().mockResolvedValue({ supabase: { rpc }, identityId: id(8) });
  rpc.mockReset().mockImplementation(async name => ({ data: operations.find(operation => operation.name === name)?.output, error: null }));
});
test.each(operations)("binds $name to scoped authority and its normalized wire input", async operation => {
  const options = { supabase: { rpc } as never };
  expect(await operation.execute(operation.input, options)).toEqual(operation.output);
  expect(authority).toHaveBeenCalledWith(origin.organizationId, origin.correlationId, options);
  const { correlationId, ...rest } = operation.input;
  const wire = "idempotencyKey" in rest ? (() => { const { idempotencyKey, ...payload } = rest;
    return { payload, correlation_id: correlationId, idempotency_key: idempotencyKey }; })()
    : { payload: rest, correlation_id: correlationId };
  expect(rpc).toHaveBeenCalledWith(operation.name, wire);
});
test.each(operations)("rejects invalid and caller authority fields for $name before authorization", async operation => {
  for (const invalid of [{ ...operation.input, actorIdentityId: id(8) }, { ...operation.input, organizationId: "bad" }]) {
    await expect(operation.execute(invalid)).rejects.toThrow();
  }
  expect(authority).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
test.each(operations)("requires current authority before $name", async operation => {
  authority.mockRejectedValue(new AuthorizationError());
  await expect(operation.execute(operation.input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});
test.each(operations)("rejects foreign results for $name", async operation => {
  for (const field of ["organizationId", "correlationId"]) {
    rpc.mockResolvedValue({ data: { ...operation.output, [field]: id(99) }, error: null });
    await expect(operation.execute(operation.input)).rejects.toThrow();
  }
});
test.each(operations)("preserves bounded error classes and hides private provider data for $name", async operation => {
  for (const [code, error] of [["42501", AuthorizationError], ["22023", FinanceDocumentInputError],
    ["40001", FinanceDocumentConflictError]] as const) {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Private source record" } });
    await expect(operation.execute(operation.input)).rejects.toBeInstanceOf(error);
  }
  rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "Private source record" } });
  await expect(operation.execute(operation.input)).rejects.toThrow("Managed finance request failed");
  rpc.mockRejectedValue(new Error("Private provider details"));
  await expect(operation.execute(operation.input)).rejects.toThrow("Managed finance request failed");
});
test("uses the same exact key and payload after an unknown mutation result", async () => {
  rpc.mockRejectedValueOnce(new Error("Unknown result"));
  await expect(executeManagedFinanceCommand(command)).rejects.toThrow("Managed finance request failed");
  rpc.mockResolvedValue({ data: { ...result, outcomeCode: "replayed" }, error: null });
  expect(await executeManagedFinanceCommand(command)).toMatchObject({ revision: 1, entityId: result.entityId, outcomeCode: "replayed" });
  expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
});
test("rejects a forged actor in a source detail despite valid workspace and target IDs", async () => {
  rpc.mockResolvedValue({ data: { ...detail, currentActorIdentityId: id(99) }, error: null });
  await expect(getManagedFinanceDetail(detailRead)).rejects.toThrow("Invalid finance detail actor");
  authority.mockResolvedValue({ supabase: { rpc }, identityId: id(99) });
  expect(await getManagedFinanceDetail(detailRead)).toMatchObject({ currentActorIdentityId: id(99) });
});
test("binds a calculation's decision actor to the trusted authority context", async () => {
  const document = { documentId: id(6), versionId: id(7), version: 1, isCurrent: true, state: "approved", revision: 6,
    fileName: "Synthetic original.pdf", contentType: "application/pdf", byteSize: 64, failureCode: null,
    createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T10:00:00Z" };
  const original = { organizationId: id(1), documentId: id(6), versionId: id(7), sha256: "a".repeat(64),
    fileName: document.fileName, currentDocumentVersion: 1, originalVersion: 1, document };
  const calculation = { calculationId: id(10), commissionEventId: id(11), contractId: id(12),
    dealLabel: "Synthetic case", vendorLabel: "Synthetic vendor", state: "pending", revision: 1, calculationRevision: 1,
    amountMinorUnits: 0, currency: "USD", blockerCodes: [], preparedByIdentityId: id(21), preparedByLabel: "Synthetic preparer",
    preparedAt: "2026-10-03T10:00:00Z", decidedByIdentityId: null, decidedByLabel: null, decidedAt: null, decisionReason: null,
    canDecide: true, canApprove: true, canReject: true, expectedEventRevision: 1, currentEventRevision: 1,
    expectedSourceDigest: "b".repeat(64), currentSourceDigest: "b".repeat(64), factsVersionId: id(13), agreementVersionId: id(14),
    agreementOrganizationId: id(15), contractOriginal: original, agreementOriginal: { ...original, organizationId: id(15) },
    contractValue: { amountMinorUnits: null, currency: null }, rule: { kind: "flat_amount", amountMinorUnits: 0, currency: "USD" },
    conditionReferences: [], currentActorIdentityId: id(99) };
  const input = { ...origin, entityId: calculation.calculationId, view: "calculation" as const };
  const output = { ...origin, entityId: input.entityId, view: input.view, calculation };
  rpc.mockResolvedValue({ data: output, error: null });
  await expect(getManagedFinanceDetail(input)).rejects.toThrow("Invalid finance detail actor");
  rpc.mockResolvedValue({ data: { ...output, calculation: { ...calculation, currentActorIdentityId: id(8) } }, error: null });
  expect(await getManagedFinanceDetail(input)).toMatchObject({ calculation: { currentActorIdentityId: id(8), canApprove: true } });
});
test("retains independent decision IDs and rejects changed original outcome revisions", async () => {
  const decision = { ...origin, action: "reject_calculation", commissionEventId: id(10), calculationId: id(11),
    expectedEventRevision: 1, expectedCalculationRevision: 1, expectedSourceDigest: "a".repeat(64),
    idempotencyKey: id(12), reviewReference: "Synthetic independent review", reason: "Source evidence needs correction" };
  const output = { ...origin, action: decision.action, commissionEventId: decision.commissionEventId,
    entityId: decision.calculationId, revision: 2, outcomeCode: "replayed" };
  rpc.mockResolvedValue({ data: output, error: null });
  expect(await executeManagedFinanceCommand(decision)).toEqual(output);
  for (const change of [{ revision: 3 }, { entityId: id(99) }, { commissionEventId: id(99) }, { action: "approve_calculation" }]) {
    rpc.mockResolvedValue({ data: { ...output, ...change }, error: null });
    await expect(executeManagedFinanceCommand(decision)).rejects.toThrow();
  }
});
