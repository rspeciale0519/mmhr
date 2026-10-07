import {describe,expect,test} from "vitest";import {randomUUID} from "node:crypto";import {commissionPaymentSchema} from "./commission-payment";describe("commission payment schema",()=>{test("accepts a received payment",()=>expect(commissionPaymentSchema.parse({paymentId:randomUUID(),commissionEventId:randomUUID(),organizationId:randomUUID(),actorIdentityId:randomUUID(),amountMinorUnits:10,receivedAt:new Date().toISOString(),state:"received",correlationId:randomUUID(),idempotencyKey:randomUUID()}).state).toBe("received"));test("rejects zero amount",()=>expect(commissionPaymentSchema.safeParse({paymentId:randomUUID(),commissionEventId:randomUUID(),organizationId:randomUUID(),actorIdentityId:randomUUID(),amountMinorUnits:0,receivedAt:new Date().toISOString(),state:"received",correlationId:randomUUID(),idempotencyKey:randomUUID()}).success).toBe(false));});

import { beforeEach, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { recordCommissionPayment } from "./commission-payment";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const rpc = vi.fn(), supabase = { rpc } as never;
const payment = { paymentId: randomUUID(), commissionEventId: randomUUID(), organizationId: randomUUID(),
  actorIdentityId: randomUUID(), amountMinorUnits: 10, receivedAt: "2026-10-02T10:00:00.000Z", state: "received",
  correlationId: randomUUID(), idempotencyKey: randomUUID() };
const receipt = { paymentId: payment.paymentId, commissionEventId: payment.commissionEventId,
  organizationId: payment.organizationId, eventState: "partially_paid", outcomeCode: "recorded", correlationId: payment.correlationId };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null, data: receipt });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({ supabase, identityId: payment.actorIdentityId,
    scope: { kind: "organization", organizationId: payment.organizationId }, assurance: "aal2", correlationId: payment.correlationId });
});

test.each(["recorded", "replayed"])("accepts the bound %s payment receipt", async outcomeCode => {
  rpc.mockResolvedValue({ error: null, data: { ...receipt, outcomeCode } });
  await expect(recordCommissionPayment(payment, { supabase, correlationId: randomUUID() })).resolves.toMatchObject({ outcomeCode });
  expect(requirePermission).toHaveBeenCalledWith("finance.manage", { kind: "organization", organizationId: payment.organizationId },
    { supabase, correlationId: payment.correlationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_record_commission_payment", { payload: payment,
    correlation_id: payment.correlationId, idempotency_key: payment.idempotencyKey });
});

test.each([
  { identityId: randomUUID() }, { scope: { kind: "organization", organizationId: randomUUID() } },
  { scope: { kind: "platform" } }, { correlationId: randomUUID() },
])("rejects changed authorization before any payment write %#", async change => {
  vi.mocked(requirePermission).mockResolvedValue({ supabase, identityId: payment.actorIdentityId,
    scope: { kind: "organization", organizationId: payment.organizationId }, assurance: "aal2",
    correlationId: payment.correlationId, ...change } as never);
  await expect(recordCommissionPayment(payment)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { paymentId: randomUUID() }, { commissionEventId: randomUUID() }, { organizationId: randomUUID() },
  { correlationId: randomUUID() }, { eventState: "approved" }, { eventState: "voided" },
  { eventState: "not_a_state" }, { outcomeCode: "ignored" }, { privateReference: "private" },
])("rejects changed payment result %#", async change => {
  rpc.mockResolvedValue({ error: null, data: { ...receipt, ...change } });
  await expect(recordCommissionPayment(payment)).rejects.toThrow("Invalid payment result");
});

test("accepts the exact paid receipt and an unchanged state for a reversed record", async () => {
  rpc.mockResolvedValueOnce({ error: null, data: { ...receipt, eventState: "paid" } });
  await expect(recordCommissionPayment(payment)).resolves.toMatchObject({ eventState: "paid" });
  rpc.mockResolvedValueOnce({ error: null, data: { ...receipt, eventState: "disputed" } });
  await expect(recordCommissionPayment({ ...payment, state: "reversed" })).resolves.toMatchObject({ eventState: "disputed" });
});

test.each([{ amountMinorUnits: Number.MAX_SAFE_INTEGER + 1 }, { amountMinorUnits: 0 },
  { amountMinorUnits: 0.5 }, { state: "paid" }, { receivedAt: "invalid" }, { extra: true }])(
  "rejects invalid payment input before authorization %#", async change => {
    await expect(recordCommissionPayment({ ...payment, ...change })).rejects.toThrow("Invalid payment input");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

test("keeps provider failures private and preserves authorization denial", async () => {
  rpc.mockResolvedValueOnce({ error: { message: "Private payment details" } });
  await expect(recordCommissionPayment(payment)).rejects.toThrow("Payment unavailable");
  rpc.mockRejectedValueOnce(new Error("Private transport details"));
  await expect(recordCommissionPayment(payment)).rejects.toThrow("Payment unavailable");
  vi.mocked(requirePermission).mockRejectedValueOnce(new AuthorizationError());
  await expect(recordCommissionPayment(payment)).rejects.toBeInstanceOf(AuthorizationError);
});
