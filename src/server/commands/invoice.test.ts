import{describe,expect,test}from"vitest";import{randomUUID}from"node:crypto";import{invoiceCommandSchema}from"./invoice";const b={organizationId:randomUUID(),actorIdentityId:randomUUID(),correlationId:randomUUID(),idempotencyKey:randomUUID(),invoiceId:randomUUID()};describe("invoice schema",()=>{test("accepts a draft",()=>expect(invoiceCommandSchema.parse({...b,action:"create",commissionEventId:randomUUID(),vendorOrganizationId:randomUUID(),currency:"USD",amountMinorUnits:10,supportingDocumentReferences:[],createdByIdentityId:b.actorIdentityId}).action).toBe("create"));test("rejects reversed issue dates",()=>expect(invoiceCommandSchema.safeParse({...b,action:"issue",invoiceNumber:"INV-1",issueDate:"2026-02-02T00:00:00Z",dueDate:"2026-02-01T00:00:00Z"}).success).toBe(false));});

import { beforeEach, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordInvoice } from "./invoice";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const rpc = vi.fn(), supabase = { rpc } as never;
const create = { ...b, action: "create", commissionEventId: randomUUID(), vendorOrganizationId: randomUUID(),
  currency: "USD", amountMinorUnits: 10, supportingDocumentReferences: [], createdByIdentityId: b.actorIdentityId };
const issue = { ...b, action: "issue", invoiceNumber: "INV-1", issueDate: "2026-10-02T00:00:00.000Z", dueDate: "2026-10-03T00:00:00.000Z" };
const receipt = { invoiceId: b.invoiceId, organizationId: b.organizationId, status: "draft", outcomeCode: "recorded", correlationId: b.correlationId };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null, data: receipt });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase, identityId: b.actorIdentityId,
    scope: { kind: "organization", organizationId: b.organizationId }, assurance: "aal2", correlationId: b.correlationId });
});

test.each(["recorded", "replayed"])("accepts the original %s result for each invoice action", async outcomeCode => {
  for (const [command, status] of [[create, "draft"], [issue, "issued"], [{ ...b, action: "void" }, "voided"]] as const) {
    rpc.mockResolvedValue({ error: null, data: { ...receipt, status, outcomeCode } });
    await expect(recordInvoice(command, { supabase, correlationId: randomUUID() })).resolves.toMatchObject({ status, outcomeCode });
    expect(requirePermission).toHaveBeenLastCalledWith("finance.manage", { kind: "organization", organizationId: b.organizationId },
      { supabase, correlationId: b.correlationId });
    expect(rpc).toHaveBeenLastCalledWith("mmhr_record_invoice", { payload: command,
      correlation_id: b.correlationId, idempotency_key: b.idempotencyKey });
  }
});

test.each([{ identityId: randomUUID() }, { scope: { kind: "organization", organizationId: randomUUID() } },
  { scope: { kind: "platform" } }, { correlationId: randomUUID() }])(
  "denies changed invoice authorization before the write %#", async change => {
    vi.mocked(requirePermission).mockResolvedValue({ supabase, identityId: b.actorIdentityId,
      scope: { kind: "organization", organizationId: b.organizationId }, assurance: "aal2",
      correlationId: b.correlationId, ...change } as never);
    await expect(recordInvoice(create)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

test("denies a forged invoice creator", async () => {
  await expect(recordInvoice({ ...create, createdByIdentityId: randomUUID() })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([{ invoiceId: randomUUID() }, { organizationId: randomUUID() }, { correlationId: randomUUID() },
  { status: "issued" }, { status: "ready" }, { status: "unknown" }, { outcomeCode: "ignored" }, { extra: true }])(
  "rejects an altered invoice result %#", async change => {
    rpc.mockResolvedValue({ error: null, data: { ...receipt, ...change } });
    await expect(recordInvoice(create)).rejects.toThrow("Invalid invoice result");
  });

test.each([issue, { ...b, action: "void" }])("rejects a result from a different invoice action %#", async command => {
  await expect(recordInvoice(command)).rejects.toThrow("Invalid invoice result");
});

test.each([{ amountMinorUnits: -1 }, { amountMinorUnits: Number.MAX_SAFE_INTEGER + 1 },
  { currency: "usd" }, { extra: true }, { supportingDocumentReferences: Array(51).fill("ref") }])(
  "rejects invalid invoice input before authorization %#", async change => {
    await expect(recordInvoice({ ...create, ...change })).rejects.toThrow("Invalid invoice input");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

test("keeps provider failures private and preserves authorization denial", async () => {
  rpc.mockResolvedValueOnce({ error: { message: "Private invoice details" } });
  await expect(recordInvoice(create)).rejects.toThrow("Invoice unavailable");
  rpc.mockRejectedValueOnce(new Error("Private transport details"));
  await expect(recordInvoice(create)).rejects.toThrow("Invoice unavailable");
  vi.mocked(requirePermission).mockRejectedValueOnce(new AuthorizationError());
  await expect(recordInvoice(create)).rejects.toBeInstanceOf(AuthorizationError);
});
