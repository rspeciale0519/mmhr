import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { securityUuidSchema } from "@/server/audit/security-values";
import { AuthorizationError, type AuthorizationOptions, type RequestSupabaseClient } from "@/server/auth/authorization";
import {
  parseRecoveryMfaReceipt, reactivateRecoveredIdentitySchema, recoveryMfaContextRowsSchema, registerRecoveryFactorSchema,
  type ReactivateRecoveredIdentityInput, type RecoveryMfaAction, type RecoveryMfaContext,
  type RecoveryMfaReceipt, type RegisterRecoveryFactorInput,
} from "./recovery-mfa-contract";

export class RecoveryMfaError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Recovery MFA input is invalid" : "Recovery MFA operation could not be completed");
    this.name = "RecoveryMfaError";
  }
}

const optionsSchema = z.strictObject({
  // This object must come from a server composition root, never a request payload.
  supabase: z.custom<RequestSupabaseClient>((client) => typeof client === "object" && client !== null
    && "rpc" in client && typeof client.rpc === "function" && "auth" in client
    && typeof client.auth === "object" && client.auth !== null
    && "getClaims" in client.auth && typeof client.auth.getClaims === "function").optional(),
  correlationId: securityUuidSchema.optional(),
});
const claimsSchema = z.object({
  sub: securityUuidSchema,
  session_id: securityUuidSchema,
  role: z.literal("authenticated"),
  aal: z.enum(["aal1", "aal2"]),
  iat: z.number().int().min(0).max(999_999_999_999),
  exp: z.number().int().min(1).max(999_999_999_999),
}).refine((claims) => claims.iat < claims.exp);
type VerifiedCaller = { supabase: RequestSupabaseClient; correlationId?: string };
type RecoveryMfaRpc = "mmhr_register_recovery_factor" | "mmhr_reactivate_recovered_identity";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RecoveryMfaError("INVALID_INPUT");
  return result.data;
}

/** Contained identities cannot pass ordinary permission authorization. SQL owns this fixed, session-bound exception. */
async function verifiedCaller(options: AuthorizationOptions, requireAal2: boolean): Promise<VerifiedCaller> {
  const validated = parse(optionsSchema, options);
  try {
    const supabase = validated.supabase ?? await createClient();
    const response = await supabase.auth.getClaims();
    if (!response || response.error) throw new AuthorizationError();
    const claims = claimsSchema.safeParse(response.data?.claims);
    const now = Date.now() / 1000;
    if (!claims.success || claims.data.exp <= now || claims.data.iat > Math.floor(now)
      || requireAal2 && claims.data.aal !== "aal2") throw new AuthorizationError();
    return { supabase, correlationId: validated.correlationId };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new RecoveryMfaError("UNAVAILABLE");
  }
}

async function execute(
  caller: VerifiedCaller, rpc: RecoveryMfaRpc, args: { idempotency_key: string; factor_id?: string },
  expectedAction: RecoveryMfaAction,
): Promise<RecoveryMfaReceipt> {
  let response;
  try {
    response = await caller.supabase.rpc(rpc, { ...args, correlation_id: caller.correlationId ?? randomUUID() });
  } catch {
    // A lost response can follow a commit. Only an explicit retry may reuse the original semantic input and key.
    throw new RecoveryMfaError("UNAVAILABLE");
  }
  if (!response || response.error) throw new RecoveryMfaError("REJECTED");
  const receipt = parseRecoveryMfaReceipt(response.data, expectedAction);
  if (!receipt) throw new RecoveryMfaError("INVALID_RESPONSE");
  return receipt;
}

/** Read-only status. This does not authorize provider enrollment, challenge, or another identity's recovery. */
export async function getRecoveryMfaContext(options: AuthorizationOptions = {}): Promise<RecoveryMfaContext | null> {
  const caller = await verifiedCaller(options, false);
  let response;
  try { response = await caller.supabase.rpc("mmhr_get_recovery_mfa_context"); }
  catch { throw new RecoveryMfaError("UNAVAILABLE"); }
  if (!response || response.error) throw new RecoveryMfaError("REJECTED");
  const result = recoveryMfaContextRowsSchema.safeParse(response.data);
  if (!result.success) throw new RecoveryMfaError("INVALID_RESPONSE");
  return result.data;
}

/** Register a provider factor ID without enrolling, verifying, or restoring access. SQL rechecks its ownership and age. */
export async function registerRecoveryFactor(
  input: RegisterRecoveryFactorInput, options: AuthorizationOptions = {},
): Promise<RecoveryMfaReceipt> {
  const value = parse(registerRecoveryFactorSchema, input);
  const caller = await verifiedCaller(options, false);
  return execute(caller, "mmhr_register_recovery_factor", {
    factor_id: value.factorId, idempotency_key: value.idempotencyKey,
  }, "identity.recovery.factor.register");
}

/** The bound session must already have fresh AAL2. SQL rechecks its factor, containment, and full administrator capacity. */
export async function reactivateRecoveredIdentity(
  input: ReactivateRecoveredIdentityInput, options: AuthorizationOptions = {},
): Promise<RecoveryMfaReceipt> {
  const value = parse(reactivateRecoveredIdentitySchema, input);
  const caller = await verifiedCaller(options, true);
  return execute(caller, "mmhr_reactivate_recovered_identity", {
    idempotency_key: value.idempotencyKey,
  }, "identity.recovery.reactivate");
}
