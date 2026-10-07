import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
const instant = z.iso.datetime({ offset: true });
const common = { organizationId: uuid, correlationId: uuid };
export const rfpReceiptCommandSchema = z.strictObject({ ...common, confirmationId: uuid,
  recipientId: uuid, rfpVersionId: uuid, idempotencyKey: uuid });
export const rfpReceiptVendorReadSchema = z.strictObject({ ...common, view: z.literal("vendor"), afterId: uuid.optional() });
export const rfpReceiptStaffReadSchema = z.strictObject({ ...common, view: z.literal("staff"), intakeId: uuid, afterId: uuid.optional() });
export const rfpReceiptCustomerReadSchema = z.strictObject({ ...common, view: z.literal("customer"), intakeId: uuid, afterId: uuid.optional() });
export const rfpReceiptReadSchema = z.discriminatedUnion("view", [rfpReceiptVendorReadSchema, rfpReceiptStaffReadSchema, rfpReceiptCustomerReadSchema]);
export const rfpReceiptResultSchema = z.strictObject({ ...common, confirmationId: uuid,
  recipientId: uuid, rfpVersionId: uuid, acknowledgedAt: instant, state: z.literal("acknowledged") });
export const rfpReceiptRowSchema = z.strictObject({ recipientId: uuid, rfpVersionId: uuid,
  title: z.string().min(1).max(200), providerName: z.string().min(1).max(200), version: z.int().min(1).max(10000),
  state: z.enum(["distributed", "acknowledged", "responded", "withdrawn"]), sentAt: instant,
  deadlineAt: instant, acknowledgedAt: instant.nullable(), respondedAt: instant.nullable(),
  receiptKind: z.enum(["none", "recorded", "explicit"]), canConfirm: z.boolean(),
}).superRefine((row, ctx) => {
  if ((row.receiptKind === "none") !== (row.acknowledgedAt === null)
    || (row.canConfirm && (row.state !== "distributed" || row.receiptKind !== "none"))
    || (row.receiptKind === "explicit" && row.state === "distributed")
    || (row.state === "responded" && row.respondedAt === null)
    || (row.state === "acknowledged" && row.acknowledgedAt === null)) {
    ctx.addIssue({ code: "custom", message: "Invalid receipt status" });
  }
});
export const rfpReceiptPageSchema = z.strictObject({ ...common, view: z.enum(["vendor", "staff", "customer"]),
  intakeId: uuid.nullable(), items: z.array(rfpReceiptRowSchema).max(25), nextCursor: uuid.nullable() });
export type RfpReceiptCommand = z.output<typeof rfpReceiptCommandSchema>;
export type RfpReceiptRead = z.output<typeof rfpReceiptReadSchema>;
export type RfpReceiptResult = z.output<typeof rfpReceiptResultSchema>;
export type RfpReceiptPage = z.output<typeof rfpReceiptPageSchema>;
export type RfpReceiptRow = z.output<typeof rfpReceiptRowSchema>;
