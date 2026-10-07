import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const date = z.iso.datetime({ offset: true });
const statement = (bytes: number) => z.string().trim().min(1).refine(
  (value) => new TextEncoder().encode(value).length <= bytes,
  `Use no more than ${bytes.toLocaleString("en-US")} UTF-8 bytes.`,
);
const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid };

export const portalClarificationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...metadata, action: z.literal("ask"), recipientId: uuid,
    normalizationId: uuid, question: statement(5000), deadlineAt: date }),
  z.strictObject({ ...metadata, action: z.literal("reply"), clarificationId: uuid,
    answer: statement(5000), changeSummary: statement(2000), replyNormalizationId: uuid.nullable() }),
  z.strictObject({ ...metadata, action: z.literal("decide"), clarificationId: uuid,
    decision: z.enum(["accepted", "rejected", "deferred"]), reason: statement(2000) }),
]);
export type PortalClarificationCommand = z.infer<typeof portalClarificationCommandSchema>;

export const portalClarificationReadSchema = z.discriminatedUnion("view", [
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("vendor"), recipientId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("staff"), intakeId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("customer"), intakeId: uuid, afterId: uuid.optional() }),
]);
const state = { status: z.enum(["pending", "answered", "approved", "rejected"]),
  decision: z.enum(["pending", "accepted", "rejected", "deferred"]) };
export const portalClarificationResultSchema = z.strictObject({
  organizationId: uuid, correlationId: uuid, clarificationId: uuid, recipientId: uuid,
  normalizationId: uuid, replyNormalizationId: uuid.nullable(), ...state,
  outcomeCode: z.enum(["recorded", "replayed"]),
});
export const portalClarificationPageSchema = z.strictObject({
  organizationId: uuid, correlationId: uuid, nextCursor: uuid.nullable(),
  items: z.array(z.strictObject({ clarificationId: uuid, recipientId: uuid,
    normalizationId: uuid.nullable(), replyNormalizationId: uuid.nullable(), providerName: z.string().min(1).max(200),
    question: statement(5000), answer: statement(5000).nullable(), changeSummary: statement(2000).nullable(),
    decisionReason: statement(2000).nullable(), deadlineAt: date, askedAt: date, answeredAt: date.nullable(),
    revision: z.number().int().positive(), replyRevision: z.number().int().positive().nullable(), ...state,
    latestNormalizationId: uuid, latestRevision: z.number().int().positive(),
    canReply: z.boolean(), canDecide: z.boolean(), late: z.boolean(),
  })).max(25),
});
export type PortalClarificationPage = z.infer<typeof portalClarificationPageSchema>;
