import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";

export class IdentitySynchronizationError extends Error {
  constructor(readonly code: "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Account setup could not be completed");
    this.name = "IdentitySynchronizationError";
  }
}
const claimsSchema = z.object({ sub: securityUuidSchema, aal: z.enum(["aal1", "aal2"]) });
const userSchema = z.object({
  id: securityUuidSchema, email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  email_confirmed_at: z.iso.datetime({ offset: true }), is_anonymous: z.literal(false),
});
const resultSchema = z.strictObject({
  identityId: securityUuidSchema, status: z.enum(["pending", "active"]),
  outcome: z.enum(["created", "unchanged", "synchronized"]), correlationId: securityUuidSchema,
}).refine((value) => value.outcome !== "created" || value.status === "pending");

/**
 * Server composition only. The database must derive subject and verified email
 * from its live Auth records, never from caller-supplied identity fields.
 * Auth actions compose this with customer setup; release requires live RPC evidence.
 */
export async function synchronizeCallerIdentity(options: AuthorizationOptions = {}) {
  const correlation = securityUuidSchema.safeParse(options.correlationId ?? randomUUID());
  if (!correlation.success) throw new IdentitySynchronizationError("REJECTED");
  let supabase;
  try { supabase = options.supabase ?? await createClient(); }
  catch { throw new IdentitySynchronizationError("UNAVAILABLE"); }
  let verified;
  try { verified = await supabase.auth.getClaims(); }
  catch { throw new IdentitySynchronizationError("UNAVAILABLE"); }
  const claims = claimsSchema.safeParse(!verified || verified.error ? null : verified.data?.claims);
  if (!claims.success) throw new IdentitySynchronizationError("REJECTED");
  let provider;
  try { provider = await supabase.auth.getUser(); }
  catch { throw new IdentitySynchronizationError("UNAVAILABLE"); }
  const user = userSchema.safeParse(!provider || provider.error ? null : provider.data?.user);
  if (!user.success || user.data.id !== claims.data.sub) throw new IdentitySynchronizationError("REJECTED");
  let response;
  try {
    response = await supabase.rpc("mmhr_sync_my_identity", { correlation_id: correlation.data });
  } catch { throw new IdentitySynchronizationError("UNAVAILABLE"); }
  if (!response || response.error) throw new IdentitySynchronizationError("REJECTED");
  const parsed = resultSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.correlationId !== correlation.data) throw new IdentitySynchronizationError("INVALID_RESPONSE");
  return parsed.data;
}
