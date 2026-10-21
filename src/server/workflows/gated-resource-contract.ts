import "server-only";

import { z } from "zod";

const gatedResourceSchema = z.strictObject({
  resourceId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/),
  subjectId: z.string().uuid(),
  workEmail: z.string().trim().toLowerCase().email(),
  consentAt: z.iso.datetime({ offset: true }),
  leadId: z.string().uuid().nullable(),
  leadStatus: z.enum(["new", "contacted", "qualified", "disqualified", "converted", "archived"]).nullable(),
});

export type GatedResourceRequest = z.infer<typeof gatedResourceSchema>;

/** Allows a gated resource only after identity, consent, and lead-routing checks. */
export function authorizeGatedResource(value: unknown, asOf: Date = new Date()): GatedResourceRequest {
  const parsed = gatedResourceSchema.parse(value);
  if (Date.parse(parsed.consentAt) > asOf.getTime()) throw new Error("Consent cannot be in the future");
  if (parsed.leadId === null || parsed.leadStatus === null || parsed.leadStatus === "disqualified" || parsed.leadStatus === "archived") throw new Error("Gated resource requires an active routed lead");
  return parsed;
}
