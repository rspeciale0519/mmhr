import "server-only";
import { z } from "zod";

import { securityUuidSchema } from "@/server/audit/security-values";

export const registerRecoveryFactorSchema = z.strictObject({
  factorId: securityUuidSchema,
  idempotencyKey: securityUuidSchema,
});
export const reactivateRecoveredIdentitySchema = z.strictObject({ idempotencyKey: securityUuidSchema });
export type RegisterRecoveryFactorInput = z.input<typeof registerRecoveryFactorSchema>;
export type ReactivateRecoveredIdentityInput = z.input<typeof reactivateRecoveredIdentitySchema>;

const contextRowSchema = z.strictObject({
  recovery_request_id: securityUuidSchema,
  recovery_presence_id: securityUuidSchema,
  expected_factor_id: securityUuidSchema.nullable(),
  state: z.enum(["enrollment_required", "verification_required", "completed", "needs_review"]),
}).refine((row) => {
  if (row.state === "enrollment_required") return row.expected_factor_id === null;
  if (row.state === "verification_required" || row.state === "completed") return row.expected_factor_id !== null;
  return true;
}).transform((row) => Object.freeze({
  recoveryRequestId: row.recovery_request_id,
  recoveryPresenceId: row.recovery_presence_id,
  expectedFactorId: row.expected_factor_id,
  state: row.state,
}));

// No row means the caller has no permitted recovery context, not a new enrollment invitation.
export const recoveryMfaContextRowsSchema = z.array(contextRowSchema).max(1)
  .transform((rows) => rows[0] ?? null);
export type RecoveryMfaContext = z.output<typeof contextRowSchema>;

export const recoveryMfaActions = ["identity.recovery.factor.register", "identity.recovery.reactivate"] as const;
export type RecoveryMfaAction = (typeof recoveryMfaActions)[number];

const receiptSchema = z.strictObject({
  receipt_id: securityUuidSchema,
  entity_id: securityUuidSchema,
  action: z.enum(recoveryMfaActions),
}).transform((row) => Object.freeze({ receiptId: row.receipt_id, entityId: row.entity_id, action: row.action }));
export type RecoveryMfaReceipt = z.output<typeof receiptSchema>;

/** SQL derives the stable entity. An Auth subject ID is not its identity ID. */
export function parseRecoveryMfaReceipt(value: unknown, expectedAction: RecoveryMfaAction): RecoveryMfaReceipt | null {
  const parsed = receiptSchema.safeParse(value);
  return parsed.success && parsed.data.action === expectedAction ? parsed.data : null;
}
