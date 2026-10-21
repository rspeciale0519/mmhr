import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { confirmRfpReceipt, getRfpReceiptStatus, RfpReceiptConflictError, RfpReceiptInputError } from "./rfp-receipt";
vi.mock("@/server/auth/authorization", async () => ({ ...await vi.importActual("@/server/auth/authorization"), requirePermission: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const input = { organizationId: id, confirmationId: id, recipientId: id, rfpVersionId: id, correlationId: id, idempotencyKey: id };
const result = { organizationId: id, confirmationId: id, recipientId: id, rfpVersionId: id, correlationId: id,
  acknowledgedAt: "2026-10-04T00:00:00Z", state: "acknowledged" };
const rpc = vi.fn();
const ctx = { supabase: { rpc } as never, identityId: id, scope: { kind: "organization", organizationId: id } as const, assurance: "aal2" as const, correlationId: id };
beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: result, error: null }); vi.mocked(requirePermission).mockReset().mockResolvedValue(ctx); });
describe("RFP receipt commands", () => {
  test("uses the exact vendor permission, correlation and complete request", async () => {
    await expect(confirmRfpReceipt(input)).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledWith("portal.vendor.access", { kind: "organization", organizationId: id }, { correlationId: id });
    expect(rpc).toHaveBeenCalledWith("mmhr_confirm_rfp_receipt", { payload: input, correlation_id: id, idempotency_key: id });
  });
  test.each(["organizationId", "correlationId", "recipientId", "rfpVersionId", "confirmationId"])("rejects crossed output %s", async key => {
    rpc.mockResolvedValue({ data: { ...result, [key]: other }, error: null });
    await expect(confirmRfpReceipt(input)).rejects.toThrow("Invalid RFP receipt result");
  });
  test("rejects invalid input before authority or RPC", async () => {
    await expect(confirmRfpReceipt({ ...input, actorIdentityId: id })).rejects.toBeInstanceOf(RfpReceiptInputError);
    expect(requirePermission).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  test("rejects scope drift before RPC", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ...ctx, scope: { kind: "organization", organizationId: other } });
    await expect(confirmRfpReceipt(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
  });
  test.each([{ code: "42501", type: AuthorizationError }, { code: "22023", type: RfpReceiptInputError },
    { code: "40001", type: RfpReceiptConflictError }, { code: "23505", type: RfpReceiptConflictError }])("maps known SQL $code", async ({ code, type }) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Private provider details" } });
    await expect(confirmRfpReceipt(input)).rejects.toBeInstanceOf(type);
  });
  test("keeps unknown failures private", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Private token" } });
    await expect(confirmRfpReceipt(input)).rejects.toThrow("RFP receipt request unavailable");
  });
  test("requires independent current internal authority for staff status", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce(ctx).mockResolvedValueOnce({ ...ctx, scope: { kind: "platform" } });
    rpc.mockResolvedValue({ data: { organizationId: id, correlationId: id, view: "staff", intakeId: id, items: [], nextCursor: null }, error: null });
    await getRfpReceiptStatus({ organizationId: id, correlationId: id, view: "staff", intakeId: id });
    expect(requirePermission).toHaveBeenNthCalledWith(2, "admin.access", { kind: "platform" }, { supabase: ctx.supabase, correlationId: id });
  });
  test("denies a crossed staff identity", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce(ctx).mockResolvedValueOnce({ ...ctx, identityId: other, scope: { kind: "platform" } });
    await expect(getRfpReceiptStatus({ organizationId: id, correlationId: id, view: "staff", intakeId: id })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("rejects external capability leakage and bad cursor", async () => {
    const item = { recipientId: id, rfpVersionId: id, title: "Request", providerName: "Vendor", version: 1, state: "distributed",
      sentAt: result.acknowledgedAt, deadlineAt: result.acknowledgedAt, acknowledgedAt: null, respondedAt: null, receiptKind: "none", canConfirm: true };
    const page = { organizationId: id, correlationId: id, view: "customer", intakeId: id, items: [item], nextCursor: null };
    rpc.mockResolvedValue({ data: page, error: null });
    await expect(getRfpReceiptStatus({ organizationId: id, correlationId: id, view: "customer", intakeId: id })).rejects.toThrow("Invalid RFP receipt page");
    rpc.mockResolvedValue({ data: { ...page, view: "vendor", intakeId: null, nextCursor: other }, error: null });
    await expect(getRfpReceiptStatus({ organizationId: id, correlationId: id, view: "vendor" })).rejects.toThrow("Invalid RFP receipt cursor");
  });
});
