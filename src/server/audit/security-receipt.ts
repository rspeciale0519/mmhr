import "server-only";
import { z } from "zod";

import { securityUuidSchema } from "./security-values";

export const securityCommandActions = [
  "platform_role.assign", "platform_role.revoke", "role_version.activate",
  "permission_override.set", "permission_override.revoke",
  "delegation.set", "delegation.revoke", "identity.status.change",
  "organization.status.change", "organization.type.change",
  "membership.status.change", "membership.role.change",
  "portal_access.grant", "portal_access.revoke",
] as const;

export type SecurityCommandAction = (typeof securityCommandActions)[number];

const receiptSchema = z.strictObject({
  receipt_id: securityUuidSchema,
  entity_id: securityUuidSchema,
  action: z.enum(securityCommandActions),
});

export type SecurityCommandReceipt = {
  receiptId: string;
  entityId: string;
  action: SecurityCommandAction;
};

export function parseSecurityCommandReceipt(
  value: unknown,
  expectedAction: SecurityCommandAction,
  expectedEntityId?: string,
): SecurityCommandReceipt | null {
  const result = receiptSchema.safeParse(value);
  if (!result.success || result.data.action !== expectedAction) return null;
  if (expectedEntityId !== undefined && result.data.entity_id !== expectedEntityId.toLowerCase()) return null;
  return {
    receiptId: result.data.receipt_id,
    entityId: result.data.entity_id,
    action: result.data.action,
  };
}
