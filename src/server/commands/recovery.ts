import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { securityUuidSchema } from "@/server/audit/security-values";
import {
  AuthorizationError, requirePermission, type AuthorizationOptions, type RequestSupabaseClient,
} from "@/server/auth/authorization";
import * as inputs from "./recovery-inputs";
import {
  parseRecoveryCommandReceipt, type RecoveryCommandAction, type RecoveryCommandReceipt,
} from "./recovery-receipt";

export class RecoveryCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Recovery command input is invalid" : "Recovery command could not be completed");
    this.name = "RecoveryCommandError";
  }
}

type RecoveryContext = { supabase: RequestSupabaseClient; correlationId: string };
type VerifiedRecoveryContext = RecoveryContext & { subjectId: string; sessionId: string };
type RecoveryRpc = "mmhr_create_recovery_presence" | "mmhr_request_identity_recovery"
  | "mmhr_decide_identity_recovery" | "mmhr_end_identity_recovery";
type PreparedState = {
  idempotencyKey: string;
  reference: string;
  referenceHash: string;
  binding?: { subjectId: string; sessionId: string };
  receipt?: RecoveryCommandReceipt;
};

declare const presenceHandle: unique symbol;
export type PreparedRecoveryPresence = { readonly [presenceHandle]: true };
export type RecoveryPresenceResult = Readonly<{
  receipt: RecoveryCommandReceipt;
  readReference(): string;
}>;
const preparedPresences = new WeakMap<PreparedRecoveryPresence, PreparedState>();
const verifiedClaimsSchema = z.object({
  sub: securityUuidSchema,
  session_id: securityUuidSchema,
  aal: z.enum(["aal1", "aal2"]),
  role: z.literal("authenticated"),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
}).refine((claims) => claims.iat < claims.exp);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RecoveryCommandError("INVALID_INPUT");
  return result.data;
}

function requestOptions(options: AuthorizationOptions): AuthorizationOptions & { correlationId: string } {
  let correlationId = options.correlationId;
  if (correlationId === undefined) {
    try { correlationId = randomUUID(); } catch { throw new RecoveryCommandError("UNAVAILABLE"); }
  }
  return { ...options, correlationId: parse(securityUuidSchema, correlationId) };
}

/** SQL owns these two fixed AAL1 exceptions, including whether the requester is the bound target Super Admin. */
async function verifiedRecoveryContext(options: AuthorizationOptions): Promise<VerifiedRecoveryContext> {
  const validated = requestOptions(options);
  try {
    const supabase = validated.supabase ?? await createClient();
    const response = await supabase.auth.getClaims();
    if (!response || response.error) throw new AuthorizationError();
    const claims = verifiedClaimsSchema.safeParse(response.data?.claims);
    if (!claims.success) throw new AuthorizationError();
    return { supabase, correlationId: validated.correlationId, subjectId: claims.data.sub, sessionId: claims.data.session_id };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new RecoveryCommandError("UNAVAILABLE");
  }
}

async function privilegedRecoveryContext(
  permission: "identity.recovery.approve" | "identity.recovery.request", options: AuthorizationOptions,
): Promise<RecoveryContext> {
  const validated = requestOptions(options);
  try {
    const context = await requirePermission(permission, { kind: "platform" }, validated);
    if (context.assurance !== "aal2" || context.scope.kind !== "platform") throw new AuthorizationError();
    const correlation = securityUuidSchema.safeParse(context.correlationId);
    if (!correlation.success || correlation.data !== validated.correlationId) throw new AuthorizationError();
    return { supabase: context.supabase, correlationId: correlation.data };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new RecoveryCommandError("UNAVAILABLE");
  }
}

async function execute(
  context: RecoveryContext, rpc: RecoveryRpc, idempotencyKey: string,
  args: Record<string, string | boolean | null>, expectedAction: RecoveryCommandAction, expectedEntityId?: string,
): Promise<RecoveryCommandReceipt> {
  let response;
  try {
    response = await context.supabase.rpc(rpc, {
      ...args, correlation_id: context.correlationId, idempotency_key: idempotencyKey,
    });
  } catch {
    // An uncertain response can follow a committed command. Never create a new key or repeat this write automatically.
    throw new RecoveryCommandError("UNAVAILABLE");
  }
  if (!response || response.error) throw new RecoveryCommandError("REJECTED");
  const receipt = parseRecoveryCommandReceipt(response.data, expectedAction, expectedEntityId);
  if (!receipt) throw new RecoveryCommandError("INVALID_RESPONSE");
  return receipt;
}

/**
 * Keep this handle only in server memory. An explicit retry reuses it and its key.
 * Losing it requires a new key and a new presence, subject to current SQL rules.
 */
export function prepareRecoveryPresence(input: inputs.PrepareRecoveryPresenceInput): PreparedRecoveryPresence {
  const value = parse(inputs.prepareRecoveryPresenceSchema, input);
  let reference: string;
  let referenceHash: string;
  try {
    reference = randomBytes(32).toString("hex");
    referenceHash = createHash("sha256").update(reference, "utf8").digest("hex");
  } catch { throw new RecoveryCommandError("UNAVAILABLE"); }
  const handle = Object.freeze({}) as PreparedRecoveryPresence;
  preparedPresences.set(handle, { idempotencyKey: value.idempotencyKey, reference, referenceHash });
  return handle;
}

export async function createRecoveryPresence(
  handle: PreparedRecoveryPresence, options: AuthorizationOptions = {},
): Promise<RecoveryPresenceResult> {
  const prepared = preparedPresences.get(handle);
  if (!prepared) throw new RecoveryCommandError("INVALID_INPUT");
  const context = await verifiedRecoveryContext(options);
  if (prepared.binding && (prepared.binding.subjectId !== context.subjectId || prepared.binding.sessionId !== context.sessionId)) {
    throw new AuthorizationError();
  }
  prepared.binding ??= { subjectId: context.subjectId, sessionId: context.sessionId };
  const receipt = await execute(context, "mmhr_create_recovery_presence", prepared.idempotencyKey, {
    reference_hash: prepared.referenceHash,
  }, "identity.recovery.presence.create", prepared.receipt?.entityId);
  if (prepared.receipt && prepared.receipt.receiptId !== receipt.receiptId) throw new RecoveryCommandError("INVALID_RESPONSE");
  prepared.receipt = receipt;
  // A function keeps ordinary JSON serialization from recording the reference.
  return Object.freeze({ receipt, readReference: () => prepared.reference });
}

/** No target or session is accepted. SQL resolves the consumed reference and checks the exact self-request exception. */
export async function requestIdentityRecovery(
  input: inputs.RequestIdentityRecoveryInput, options: AuthorizationOptions = {},
): Promise<RecoveryCommandReceipt> {
  const value = parse(inputs.requestIdentityRecoverySchema, input);
  const context = await verifiedRecoveryContext(options);
  return execute(context, "mmhr_request_identity_recovery", value.idempotencyKey, {
    opaque_reference: value.opaqueReference, reason_code: value.reasonCode,
  }, "identity.recovery.request");
}

export async function decideIdentityRecovery(
  input: inputs.DecideIdentityRecoveryInput, options: AuthorizationOptions = {},
): Promise<RecoveryCommandReceipt> {
  const value = parse(inputs.decideIdentityRecoverySchema, input);
  const context = await privilegedRecoveryContext("identity.recovery.approve", options);
  return execute(context, "mmhr_decide_identity_recovery", value.idempotencyKey, {
    request_id: value.requestId, phone_result: value.phoneResult,
    preexisting_contact_attested: value.preexistingContactAttested,
    phone_checked_at: value.phoneCheckedAt, evidence_reference: value.evidenceReference,
  }, value.phoneResult === "confirmed" && value.preexistingContactAttested
    ? "identity.recovery.approve" : "identity.recovery.deny", value.requestId);
}

export async function endIdentityRecovery(
  input: inputs.EndIdentityRecoveryInput, options: AuthorizationOptions = {},
): Promise<RecoveryCommandReceipt> {
  const value = parse(inputs.endIdentityRecoverySchema, input);
  const context = await privilegedRecoveryContext("identity.recovery.request", options);
  return execute(context, "mmhr_end_identity_recovery", value.idempotencyKey, {
    request_id: value.requestId, end_state: value.endState,
  }, value.endState === "cancelled" ? "identity.recovery.cancel" : "identity.recovery.expire", value.requestId);
}
