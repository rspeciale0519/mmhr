import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authority: vi.fn(), rpc: vi.fn(), errors: vi.fn() }));
vi.mock("@/server/commands/finance-document-upload", () => ({ requireFinanceDocumentAuthority: mocks.authority }));
vi.mock("@/server/commands/finance-document-errors", () => ({ checkFinanceDocumentRpcError: mocks.errors }));
import { executeManagedInvoiceCommand, getManagedInvoiceOwners, getManagedInvoiceDetail } from "./managed-invoice";
const uuid = () => randomUUID();
const actorIdentityId = uuid();
const input = { organizationId: uuid(), correlationId: uuid(), idempotencyKey: uuid(), reason: "Synthetic approved invoice issue",
  action: "issue_invoice", invoiceId: uuid(), preparationId: uuid(), commissionEventId: uuid(), expectedEventRevision: 2,
  expectedInvoiceRevision: 2, expectedPreparationRevision: 2, expectedSourceDigest: "a".repeat(64) };
const output = { organizationId: input.organizationId, correlationId: input.correlationId, action: input.action, invoiceId: input.invoiceId,
  preparationId: input.preparationId, commissionEventId: input.commissionEventId, preparationRevision: 2, invoiceRevision: 3,
  eventRevision: 3, status: "issued", outcomeCode: "recorded" };
beforeEach(() => { vi.clearAllMocks(); mocks.authority.mockResolvedValue({ identityId: actorIdentityId, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: output, error: null }); mocks.errors.mockImplementation(() => undefined); });
describe("managed invoice command boundary", () => {
  test("binds detail response to the current verified actor", async () => {
    const request = { organizationId: input.organizationId, commissionEventId: input.commissionEventId, correlationId: uuid() };
    const detail = { ...request, currentActorIdentityId: actorIdentityId, eventRevision: 1, eventState: "pending_review",
      calculationId: null, calculationRevision: 0, mandatorySources: [], invoice: null, currentPreparation: null,
      preparations: [], nextPreparationCursor: null };
    mocks.rpc.mockResolvedValue({ data: detail, error: null });
    expect(await getManagedInvoiceDetail(request)).toEqual(detail);
    mocks.rpc.mockResolvedValue({ data: { ...detail, currentActorIdentityId: uuid() }, error: null });
    await expect(getManagedInvoiceDetail(request)).rejects.toThrow("Invalid managed invoice detail");
    expect(mocks.authority).toHaveBeenCalledWith(request.organizationId, request.correlationId, {});
  });
  test("uses current authority and one fixed RPC with exact request IDs", async () => {
    expect(await executeManagedInvoiceCommand(input)).toEqual(output);
    expect(mocks.authority).toHaveBeenCalledWith(input.organizationId, input.correlationId, {});
    const { correlationId, idempotencyKey, ...payload } = input;
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("mmhr_managed_invoice_command", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
  });
  test("does not call the RPC when current authority fails", async () => {
    mocks.authority.mockRejectedValue(new Error("Current permission denied"));
    await expect(executeManagedInvoiceCommand(input)).rejects.toThrow("Current permission denied"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("does not send caller financial authority", async () => {
    await expect(executeManagedInvoiceCommand({ ...input, amountMinorUnits: 0 })).rejects.toThrow(); expect(mocks.authority).not.toHaveBeenCalled();
  });
  test("retains uncertain failure without generating another ID or retry", async () => {
    mocks.rpc.mockRejectedValue(new Error("Private transport detail"));
    await expect(executeManagedInvoiceCommand(input)).rejects.toThrow("Managed invoice request failed"); expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  test("rejects mismatched original result after a successful transport", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...output, invoiceId: uuid() }, error: null });
    await expect(executeManagedInvoiceCommand(input)).rejects.toThrow("Invalid managed invoice response");
  });
  test("handles error before reading provider data", async () => {
    mocks.rpc.mockResolvedValue({ data: output, error: { code: "42501" } }); mocks.errors.mockImplementation(() => { throw new Error("Current permission denied"); });
    await expect(executeManagedInvoiceCommand(input)).rejects.toThrow("Current permission denied");
  });
  test("reads actual bounded owners through current authority and exact target verification", async () => {
    const request = { organizationId: input.organizationId, commissionEventId: input.commissionEventId, correlationId: uuid() };
    mocks.rpc.mockResolvedValue({ data: { ...request, owners: [], nextCursor: null }, error: null });
    expect((await getManagedInvoiceOwners(request)).owners).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("mmhr_get_managed_invoice_owners", { payload: { organizationId: request.organizationId,
      commissionEventId: request.commissionEventId }, correlation_id: request.correlationId });
  });
});
