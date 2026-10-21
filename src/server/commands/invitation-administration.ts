import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { securityReasonSchema, securityTimestampSchema, securityUuidSchema } from "@/server/audit/security-values";

export const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1_000;

export const invitationStatuses = ["pending", "accepted", "expired", "revoked"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const invitationRoleKeys = ["organization_admin", "contributor", "viewer"] as const;
export type InvitationRoleKey = (typeof invitationRoleKeys)[number];

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const roleSchema = z.enum(invitationRoleKeys);

const commandMetadata = {
  actorIdentityId: securityUuidSchema,
  reason: securityReasonSchema,
  idempotencyKey: securityUuidSchema,
  correlationId: securityUuidSchema,
};

export const createInvitationInputSchema = z.strictObject({
  ...commandMetadata,
  organizationId: securityUuidSchema,
  email: emailSchema,
  roleKey: roleSchema,
});
export type CreateInvitationInput = z.input<typeof createInvitationInputSchema>;

export const acceptInvitationInputSchema = z.strictObject({
  identityId: securityUuidSchema,
  invitationId: securityUuidSchema,
  verifiedEmail: emailSchema,
  idempotencyKey: securityUuidSchema,
  correlationId: securityUuidSchema,
});
export type AcceptInvitationInput = z.input<typeof acceptInvitationInputSchema>;

export const expireInvitationInputSchema = z.strictObject({
  invitationId: securityUuidSchema,
  occurredAt: securityTimestampSchema,
  correlationId: securityUuidSchema,
});
export type ExpireInvitationInput = z.input<typeof expireInvitationInputSchema>;

export const revokeInvitationInputSchema = z.strictObject({
  ...commandMetadata,
  organizationId: securityUuidSchema,
  invitationId: securityUuidSchema,
});
export type RevokeInvitationInput = z.input<typeof revokeInvitationInputSchema>;

export const resendInvitationInputSchema = z.strictObject({
  ...commandMetadata,
  organizationId: securityUuidSchema,
  invitationId: securityUuidSchema,
});
export type ResendInvitationInput = z.input<typeof resendInvitationInputSchema>;

const nullableUuid = securityUuidSchema.nullable();
const nullableTimestamp = securityTimestampSchema.nullable();

/** Stored invitation state. It contains no application acceptance token. */
export const invitationRecordSchema = z.strictObject({
  invitationId: securityUuidSchema,
  organizationId: securityUuidSchema,
  normalizedEmail: emailSchema,
  roleKey: roleSchema,
  createdByIdentityId: nullableUuid,
  status: z.enum(invitationStatuses),
  createdAt: securityTimestampSchema,
  expiresAt: securityTimestampSchema,
  acceptedByIdentityId: nullableUuid,
  acceptedAt: nullableTimestamp,
  revokedByIdentityId: nullableUuid,
  revokedAt: nullableTimestamp,
  revokedReason: z.string().trim().max(500).nullable(),
});
export type InvitationRecord = z.output<typeof invitationRecordSchema>;

/** Provider-neutral work for the existing durable identity intent worker. */
export const invitationDeliveryIntentSchema = z.strictObject({
  operation: z.literal("invitation_delivery"),
  invitationId: securityUuidSchema,
  organizationId: securityUuidSchema,
  email: emailSchema,
  idempotencyKey: securityUuidSchema,
  correlationId: securityUuidSchema,
});
export type InvitationDeliveryIntent = z.output<typeof invitationDeliveryIntentSchema>;

export const invitationCommandResultSchema = z.strictObject({
  invitationId: securityUuidSchema,
  status: z.enum(invitationStatuses),
  outcome: z.enum(["created", "replayed", "accepted", "expired", "revoked", "replaced"]),
  correlationId: securityUuidSchema,
});
export type InvitationCommandResult = z.output<typeof invitationCommandResultSchema>;

export type InvitationCommandPlan = Readonly<{
  record: InvitationRecord;
  deliveryIntent: InvitationDeliveryIntent;
  result: InvitationCommandResult;
}>;

type Clock = () => Date;
type IdFactory = () => string;
type PlanOptions = Readonly<{ now?: Clock; createId?: IdFactory }>;

function commandError(message: string): Error {
  return new Error(`Invitation command ${message}`);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw commandError("input is invalid");
  return result.data;
}

function getNow(now: Clock): string {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw commandError("clock is unavailable");
  return value.toISOString();
}

function getId(createId: IdFactory): string {
  const result = securityUuidSchema.safeParse(createId());
  if (!result.success) throw commandError("identifier generation failed");
  return result.data;
}

function makePlan(
  input: CreateInvitationInput,
  options: PlanOptions = {},
  outcome: InvitationCommandResult["outcome"] = "created",
): InvitationCommandPlan {
  const value = parse(createInvitationInputSchema, input);
  const now = getNow(options.now ?? (() => new Date()));
  const createId = options.createId ?? randomUUID;
  const invitationId = getId(createId);
  const expiresAt = new Date(Date.parse(now) + INVITATION_LIFETIME_MS).toISOString();
  const record = invitationRecordSchema.parse({
    invitationId,
    organizationId: value.organizationId,
    normalizedEmail: value.email,
    roleKey: value.roleKey,
    createdByIdentityId: value.actorIdentityId,
    status: "pending",
    createdAt: now,
    expiresAt,
    acceptedByIdentityId: null,
    acceptedAt: null,
    revokedByIdentityId: null,
    revokedAt: null,
    revokedReason: null,
  });
  const deliveryIntent = invitationDeliveryIntentSchema.parse({
    operation: "invitation_delivery",
    invitationId,
    organizationId: value.organizationId,
    email: value.email,
    idempotencyKey: value.idempotencyKey,
    correlationId: value.correlationId,
  });
  return Object.freeze({
    record,
    deliveryIntent,
    result: invitationCommandResultSchema.parse({
      invitationId,
      status: "pending",
      outcome,
      correlationId: value.correlationId,
    }),
  });
}

/** Prepare an invitation and delivery intent without sending email or creating a token. */
export function prepareInvitationCreate(input: CreateInvitationInput, options: PlanOptions = {}): InvitationCommandPlan {
  return makePlan(input, options);
}

function assertPending(record: InvitationRecord): void {
  if (record.status !== "pending") throw commandError("is not pending");
}

function assertNotExpired(record: InvitationRecord, now: string): void {
  if (Date.parse(now) >= Date.parse(record.expiresAt)) throw commandError("has expired");
}

/** Accepts one pending invitation after verified email matching. */
export function acceptInvitation(
  recordInput: InvitationRecord,
  input: AcceptInvitationInput,
  options: Pick<PlanOptions, "now"> = {},
): Readonly<{ record: InvitationRecord; result: InvitationCommandResult }> {
  const record = parse(invitationRecordSchema, recordInput);
  const value = parse(acceptInvitationInputSchema, input);
  const now = getNow(options.now ?? (() => new Date()));
  if (record.invitationId !== value.invitationId) throw commandError("identifier does not match");
  assertPending(record);
  assertNotExpired(record, now);
  if (record.normalizedEmail !== value.verifiedEmail) throw commandError("email does not match");
  const accepted = invitationRecordSchema.parse({
    ...record,
    status: "accepted",
    acceptedByIdentityId: value.identityId,
    acceptedAt: now,
  });
  return Object.freeze({
    record: accepted,
    result: invitationCommandResultSchema.parse({
      invitationId: record.invitationId,
      status: "accepted",
      outcome: "accepted",
      correlationId: value.correlationId,
    }),
  });
}

/** Moves an expired pending invitation to its terminal state. */
export function expireInvitation(
  recordInput: InvitationRecord,
  input: ExpireInvitationInput,
): Readonly<{ record: InvitationRecord; result: InvitationCommandResult }> {
  const record = parse(invitationRecordSchema, recordInput);
  const value = parse(expireInvitationInputSchema, input);
  if (record.invitationId !== value.invitationId) throw commandError("identifier does not match");
  assertPending(record);
  if (Date.parse(value.occurredAt) < Date.parse(record.expiresAt)) throw commandError("has not expired");
  const expired = invitationRecordSchema.parse({ ...record, status: "expired" });
  return Object.freeze({
    record: expired,
    result: invitationCommandResultSchema.parse({
      invitationId: record.invitationId,
      status: "expired",
      outcome: "expired",
      correlationId: value.correlationId,
    }),
  });
}

/** Revokes one pending invitation. The database command must audit this transition atomically. */
export function revokeInvitation(
  recordInput: InvitationRecord,
  input: RevokeInvitationInput,
  options: Pick<PlanOptions, "now"> = {},
): Readonly<{ record: InvitationRecord; result: InvitationCommandResult }> {
  const record = parse(invitationRecordSchema, recordInput);
  const value = parse(revokeInvitationInputSchema, input);
  const now = getNow(options.now ?? (() => new Date()));
  if (record.invitationId !== value.invitationId) throw commandError("identifier does not match");
  assertPending(record);
  const revoked = invitationRecordSchema.parse({
    ...record,
    status: "revoked",
    revokedByIdentityId: value.actorIdentityId,
    revokedAt: now,
    revokedReason: value.reason,
  });
  return Object.freeze({
    record: revoked,
    result: invitationCommandResultSchema.parse({
      invitationId: record.invitationId,
      status: "revoked",
      outcome: "revoked",
      correlationId: value.correlationId,
    }),
  });
}

/** Revokes the old invitation and prepares one replacement with the same safe target data. */
export function resendInvitation(
  recordInput: InvitationRecord,
  input: ResendInvitationInput,
  options: PlanOptions = {},
): Readonly<{ revoked: InvitationRecord; replacement: InvitationCommandPlan }> {
  const record = parse(invitationRecordSchema, recordInput);
  const value = parse(resendInvitationInputSchema, input);
  const now = getNow(options.now ?? (() => new Date()));
  if (record.invitationId !== value.invitationId) throw commandError("identifier does not match");
  assertPending(record);
  assertNotExpired(record, now);
  const revoked = invitationRecordSchema.parse({
    ...record,
    status: "revoked",
    revokedByIdentityId: value.actorIdentityId,
    revokedAt: now,
    revokedReason: value.reason,
  });
  const replacement = makePlan({
    organizationId: record.organizationId,
    email: record.normalizedEmail,
    roleKey: record.roleKey,
    actorIdentityId: value.actorIdentityId,
    reason: value.reason,
    idempotencyKey: value.idempotencyKey,
    correlationId: value.correlationId,
  }, options, "replaced");
  return Object.freeze({ revoked, replacement });
}
