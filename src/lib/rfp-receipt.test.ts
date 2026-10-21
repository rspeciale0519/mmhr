import { describe, expect, test } from "vitest";
import { rfpReceiptCommandSchema, rfpReceiptReadSchema, rfpReceiptRowSchema } from "./rfp-receipt";
const id = "11111111-1111-4111-8111-111111111111";
const command = { organizationId: id, confirmationId: id, recipientId: id, rfpVersionId: id, correlationId: id, idempotencyKey: id };
const row = { recipientId: id, rfpVersionId: id, title: "Synthetic request", providerName: "Synthetic vendor", version: 1,
  state: "distributed", sentAt: "2026-10-04T00:00:00Z", deadlineAt: "2026-10-10T00:00:00Z",
  acknowledgedAt: null, respondedAt: null, receiptKind: "none", canConfirm: true };
describe("RFP receipt contracts", () => {
  test("accepts complete immutable IDs and normalizes UUID case", () => {
    expect(rfpReceiptCommandSchema.parse({ ...command, organizationId: id.toUpperCase() })).toEqual(command);
  });
  test.each([{ actorIdentityId: id }, { acknowledgedAt: row.sentAt }, { rfpVersionId: null }, { confirmationId: "" }])("rejects untrusted command fields %j", patch => {
    expect(rfpReceiptCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false);
  });
  test("separates vendor inbox from customer/staff intake reads", () => {
    expect(rfpReceiptReadSchema.safeParse({ organizationId: id, correlationId: id, view: "vendor", intakeId: id }).success).toBe(false);
    expect(rfpReceiptReadSchema.safeParse({ organizationId: id, correlationId: id, view: "customer" }).success).toBe(false);
    expect(rfpReceiptReadSchema.safeParse({ organizationId: id, correlationId: id, view: "staff", intakeId: id }).success).toBe(true);
  });
  test.each([{ receiptKind: "explicit" }, { state: "responded" }, { state: "acknowledged" },
    { canConfirm: true, acknowledgedAt: row.sentAt, receiptKind: "recorded" }])("rejects impossible projection %j", patch => {
    expect(rfpReceiptRowSchema.safeParse({ ...row, ...patch }).success).toBe(false);
  });
  test("preserves implicit receipts without inventing explicit evidence", () => {
    expect(rfpReceiptRowSchema.parse({ ...row, state: "responded", respondedAt: row.sentAt,
      acknowledgedAt: row.sentAt, receiptKind: "recorded", canConfirm: false }).receiptKind).toBe("recorded");
  });
});

describe("RFP receipt progress compatibility", () => {
  test("rejects an explicit receipt reset to distributed", () => {
    expect(rfpReceiptRowSchema.safeParse({ ...row, acknowledgedAt: row.sentAt, receiptKind: "explicit", canConfirm: false }).success).toBe(false);
  });
  test("retains an unchanged historical implicit distributed projection", () => {
    expect(rfpReceiptRowSchema.parse({ ...row, acknowledgedAt: row.sentAt, receiptKind: "recorded", canConfirm: false }).state).toBe("distributed");
  });
  test.each(["acknowledged", "responded", "withdrawn"])("retains explicit receipt projection in %s state", state => {
    expect(rfpReceiptRowSchema.safeParse({ ...row, state, acknowledgedAt: row.sentAt,
      respondedAt: state === "responded" ? row.sentAt : null, receiptKind: "explicit", canConfirm: false }).success).toBe(true);
  });
});
