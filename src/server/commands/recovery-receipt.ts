import "server-only";
import { z } from "zod";

import { securityUuidSchema } from "@/server/audit/security-values";

export const recoveryCommandActions = [
  "identity.recovery.presence.create", "identity.recovery.request",
  "identity.recovery.approve", "identity.recovery.deny",
  "identity.recovery.cancel", "identity.recovery.expire",
] as const;
export type RecoveryCommandAction = (typeof recoveryCommandActions)[number];
export type RecoveryCommandReceipt = Readonly<{
  receiptId: string;
  entityId: string;
  action: RecoveryCommandAction;
}>;

const receiptSchema = z.strictObject({
  receipt_id: securityUuidSchema,
  entity_id: securityUuidSchema,
  action: z.enum(recoveryCommandActions),
});

export function parseRecoveryCommandReceipt(
  value: unknown, expectedAction: RecoveryCommandAction, expectedEntityId?: string,
): RecoveryCommandReceipt | null {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success || parsed.data.action !== expectedAction
    || expectedEntityId !== undefined && parsed.data.entity_id !== expectedEntityId.toLowerCase()) return null;
  return Object.freeze({ receiptId: parsed.data.receipt_id, entityId: parsed.data.entity_id, action: parsed.data.action });
}
