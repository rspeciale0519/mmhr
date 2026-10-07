import { beforeEach, expect, test, vi } from "vitest";
import { rfpsRouter } from "./rfps";
import { confirmRfpReceipt, getRfpReceiptStatus, RfpReceiptConflictError, RfpReceiptInputError } from "@/server/commands/rfp-receipt";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import type { Context } from "../trpc";
vi.mock("@/server/auth/page-guards", () => ({ readSelectedOrganizationId: vi.fn() }));
vi.mock("@/server/commands/rfp-receipt", async () => ({ ...await vi.importActual("@/server/commands/rfp-receipt"), confirmRfpReceipt: vi.fn(), getRfpReceiptStatus: vi.fn() }));
vi.mock("../trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<Context>().create();
  return { router: t.router, permissionProcedure: ({ input }: { input: Parameters<typeof t.procedure.input>[0] }) => t.procedure.input(input) };
});
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const input = { organizationId: id, confirmationId: id, recipientId: id, rfpVersionId: id, correlationId: id, idempotencyKey: id };
const caller = () => rfpsRouter.createCaller({ user: { id }, supabase: {} as never,
  transport: { method: "POST", origin: "https://receipt-fixture.invalid" } });
beforeEach(() => { vi.mocked(readSelectedOrganizationId).mockReset().mockResolvedValue(id); vi.mocked(confirmRfpReceipt).mockReset(); vi.mocked(getRfpReceiptStatus).mockReset(); });
test("rejects crossed selected workspace before the command", async () => {
  vi.mocked(readSelectedOrganizationId).mockResolvedValue(other);
  await expect(caller().confirmReceipt(input)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(confirmRfpReceipt).not.toHaveBeenCalled();
});
test.each([{ error: new AuthorizationError(), code: "NOT_FOUND" }, { error: new RfpReceiptInputError(), code: "BAD_REQUEST" },
  { error: new RfpReceiptConflictError(), code: "CONFLICT" }, { error: new Error("Private SQL detail"), code: "INTERNAL_SERVER_ERROR" }])("maps known and unknown errors to $code without private details", async ({ error, code }) => {
  vi.mocked(confirmRfpReceipt).mockRejectedValue(error);
  await expect(caller().confirmReceipt(input)).rejects.toMatchObject({ code, message: "RFP receipt request failed" });
});
test("rejects a crossed role read schema without requesting status", async () => {
  await expect(caller().vendorReceiptStatus({ organizationId: id, correlationId: id, view: "customer" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(getRfpReceiptStatus).not.toHaveBeenCalled();
});
