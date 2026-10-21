import "server-only";
import { z } from "zod";

import { securityTimestampSchema, securityUuidSchema } from "@/server/audit/security-values";

const metadata = { idempotencyKey: securityUuidSchema };

export const prepareRecoveryPresenceSchema = z.strictObject(metadata);
export type PrepareRecoveryPresenceInput = z.input<typeof prepareRecoveryPresenceSchema>;

export const requestIdentityRecoverySchema = z.strictObject({
  ...metadata,
  opaqueReference: z.string().regex(/^[0-9a-f]{64}$/),
  reasonCode: z.enum(["lost_factor", "compromised_factor", "replace_device"]),
});
export type RequestIdentityRecoveryInput = z.input<typeof requestIdentityRecoverySchema>;

export const decideIdentityRecoverySchema = z.strictObject({
  ...metadata,
  requestId: securityUuidSchema,
  phoneResult: z.enum(["confirmed", "no_preexisting_number", "no_answer", "not_confirmed", "failed"]),
  preexistingContactAttested: z.boolean(),
  phoneCheckedAt: securityTimestampSchema,
  evidenceReference: securityUuidSchema.nullable(),
}).refine((input) => input.phoneResult !== "confirmed" || !input.preexistingContactAttested
  || input.evidenceReference !== null, { message: "Confirmed contact requires an evidence reference" });
export type DecideIdentityRecoveryInput = z.input<typeof decideIdentityRecoverySchema>;

export const endIdentityRecoverySchema = z.strictObject({
  ...metadata,
  requestId: securityUuidSchema,
  endState: z.enum(["cancelled", "expired"]),
});
export type EndIdentityRecoveryInput = z.input<typeof endIdentityRecoverySchema>;
