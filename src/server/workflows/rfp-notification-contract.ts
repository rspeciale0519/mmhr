import "server-only";
import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
const date = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const common = { organizationId: uuid, rfpId: uuid, version: z.int().min(1).max(10000), correlationId: uuid };
export const notificationStates = ["queued", "leased", "accepted", "failed", "needs_attention"] as const;
export const notificationReadSchema = z.strictObject(common);
export const notificationQueueSchema = z.strictObject({ ...common, notificationId: uuid, recipientId: uuid,
  membershipId: uuid, expectedSourceDigest: digest, idempotencyKey: uuid });
export const notificationRetrySchema = z.strictObject({ ...common, notificationId: uuid,
  expectedRevision: z.int().min(1).max(2147483645), idempotencyKey: uuid });
export const notificationCommandResultSchema = z.strictObject({ ...common, notificationId: uuid,
  recipientId: uuid, membershipId: uuid, revision: z.int().positive(), state: z.literal("queued"),
  action: z.enum(["queue", "retry"]), outcomeCode: z.enum(["recorded", "replayed"]) });
export const notificationRecipientsSchema = z.strictObject({ ...common, items: z.array(z.strictObject({
  recipientId: uuid, membershipId: uuid, recipientIdentityId: uuid, vendorOrganizationId: uuid,
  recipientEmail: z.email(), sourceDigest: digest, deadlineAt: date,
})).max(100) });
export const notificationStatusSchema = z.strictObject({ ...common, items: z.array(z.strictObject({
  notificationId: uuid, recipientId: uuid, membershipId: uuid, state: z.enum(notificationStates),
  revision: z.int().positive(), attemptCount: z.int().min(0).max(3), canRetry: z.boolean(),
  failureCode: z.string().regex(/^[a-z_]{1,64}$/).nullable(),
  providerMessageId: z.string().min(1).max(255).nullable(), createdAt: date,
})).max(100) });

export const notificationClaimSchema = z.strictObject({ ...common, notificationId: uuid, recipientId: uuid,
  membershipId: uuid, recipientIdentityId: uuid, recipientEmail: z.email(), sourceDigest: digest,
  subject: z.literal("A new request is available in your MMHR vendor portal"), body: z.string().min(1).max(1000),
  attemptId: uuid, attemptNumber: z.int().min(1).max(3), token: digest, expiresAt: date });
export type NotificationClaim = z.output<typeof notificationClaimSchema>;
export const notificationAttemptResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("accepted"), providerMessageId: z.string().trim().min(1).max(255) }),
  z.strictObject({ outcome: z.literal("failed"), failureCode: z.enum(["rate_limited_pre_dispatch", "provider_unavailable_pre_dispatch", "invalid_recipient_pre_dispatch"]) }),
  z.strictObject({ outcome: z.literal("needs_attention"), failureCode: z.enum(["outcome_unknown", "source_changed", "lease_expired", "recipient_revoked"]) }),
]);
export type NotificationAttemptResult = z.output<typeof notificationAttemptResultSchema>;
