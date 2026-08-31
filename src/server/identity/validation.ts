import "server-only";
import { z } from "zod";

import { INVITATION_ACCEPTANCE_PATH, type IdentityOperation } from "./service";

const opaqueId = z.uuid();
const idempotencyKey = z.union([opaqueId, z.string().regex(/^[0-9a-f]{64}$/)]);

function operationContext<Operation extends IdentityOperation>(operation: Operation) {
  return z.strictObject({
    operation: z.literal(operation),
    intentId: opaqueId,
    correlationId: opaqueId,
    idempotencyKey,
  });
}

export const identityReadRequestSchema = z.strictObject({
  subjectId: opaqueId,
  correlationId: opaqueId,
});

export const mfaResetRequestSchema = z.strictObject({
  subjectId: opaqueId,
  context: operationContext("mfa_enrollment_reset"),
});

export const invitationDeliveryRequestSchema = z.strictObject({
  // The stored invitation and acceptance command must use this same normalization.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  context: operationContext("invitation_delivery"),
});

/** A composition-root setting, never a redirect supplied by an HTTP request. */
export function canonicalOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (value !== url.origin && value !== `${url.origin}/`) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function fixedInvitationAcceptanceUrl(origin: unknown): string | null {
  const trustedOrigin = canonicalOrigin(origin);
  return trustedOrigin ? `${trustedOrigin}${INVITATION_ACCEPTANCE_PATH}` : null;
}
