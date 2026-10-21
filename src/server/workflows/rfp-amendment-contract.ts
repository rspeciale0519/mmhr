import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const item = z.strictObject({
  amendmentKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/),
  sectionKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(5_000),
});

export const rfpAmendmentItemsSchema = z.array(item).min(1).max(50).superRefine((items, context) => {
  if (new Set(items.map((entry) => entry.amendmentKey)).size !== items.length) context.addIssue({ code: "custom", message: "Amendment keys must be unique" });
});

export const rfpAmendmentCreateSchema = z.strictObject({
  action: z.literal("create"), amendmentId: uuid, rfpId: uuid, organizationId: uuid, vendorProfileId: uuid,
  baseVersion: z.number().int().min(1).max(10_000), version: z.number().int().min(1).max(10_000),
  actorIdentityId: uuid, title: z.string().trim().min(1).max(200), items: rfpAmendmentItemsSchema,
  correlationId: uuid, idempotencyKey: uuid,
});
export const rfpAmendmentApproveSchema = z.strictObject({
  action: z.literal("approve"), amendmentId: uuid, rfpId: uuid, organizationId: uuid, vendorProfileId: uuid,
  baseVersion: z.number().int().min(1).max(10_000), version: z.number().int().min(1).max(10_000),
  actorIdentityId: uuid, approvalReference: z.string().trim().max(263).regex(/^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/),
  correlationId: uuid, idempotencyKey: uuid,
});
export const rfpAmendmentCommandSchema = z.discriminatedUnion("action", [rfpAmendmentCreateSchema, rfpAmendmentApproveSchema]);

export type RfpAmendmentItem = z.infer<typeof item>;
