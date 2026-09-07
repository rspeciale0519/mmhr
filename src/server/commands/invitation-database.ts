import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";
import {
  acceptInvitationInputSchema,
  createInvitationInputSchema,
  expireInvitationInputSchema,
  resendInvitationInputSchema,
  revokeInvitationInputSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type ExpireInvitationInput,
  type ResendInvitationInput,
  type RevokeInvitationInput,
  type InvitationCommandResult,
} from "./invitation-administration";

export class InvitationDatabaseCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT"
      ? "Invitation command input is invalid"
      : "Invitation command could not be completed");
    this.name = "InvitationDatabaseCommandError";
  }
}

export type InvitationDatabaseOperation = "create" | "accept" | "expire" | "revoke" | "resend";

export type InvitationDatabaseInput =
  | { operation: "create"; input: CreateInvitationInput }
  | { operation: "accept"; input: AcceptInvitationInput }
  | { operation: "expire"; input: ExpireInvitationInput }
  | { operation: "revoke"; input: RevokeInvitationInput }
  | { operation: "resend"; input: ResendInvitationInput };

type InvitationDatabaseResult = Promise<InvitationCommandResult>;
type InvitationDatabaseOptions = AuthorizationOptions;

const invitationCommandResultSchema = z.strictObject({
  invitationId: securityUuidSchema,
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  outcome: z.enum(["created", "replayed", "accepted", "expired", "revoked", "replaced"]),
  correlationId: securityUuidSchema,
});

function parseInput(operation: InvitationDatabaseOperation, input: unknown) {
  const parsed = operation === "create"
    ? createInvitationInputSchema.safeParse(input)
    : operation === "accept"
      ? acceptInvitationInputSchema.safeParse(input)
      : operation === "expire"
        ? expireInvitationInputSchema.safeParse(input)
        : operation === "revoke"
          ? revokeInvitationInputSchema.safeParse(input)
          : resendInvitationInputSchema.safeParse(input);
  if (!parsed.success) throw new InvitationDatabaseCommandError("INVALID_INPUT");
  return parsed.data;
}

function requireCallerIdentity(input: { actorIdentityId: string }, identityId: string) {
  if (input.actorIdentityId.toLowerCase() !== identityId.toLowerCase()) {
    throw new AuthorizationError();
  }
}

async function rpcResult(
  supabase: RequestSupabaseClient,
  functionName: string,
  args: Record<string, string>,
): Promise<InvitationCommandResult> {
  let response;
  try {
    response = await supabase.rpc(functionName, args);
  } catch {
    throw new InvitationDatabaseCommandError("UNAVAILABLE");
  }
  if (!response || response.error) throw new InvitationDatabaseCommandError("REJECTED");
  const parsed = invitationCommandResultSchema.safeParse(response.data);
  if (!parsed.success) throw new InvitationDatabaseCommandError("INVALID_RESPONSE");
  return parsed.data;
}

async function getSupabase(options: InvitationDatabaseOptions): Promise<RequestSupabaseClient> {
  try {
    return options.supabase ?? await createClient();
  } catch {
    throw new InvitationDatabaseCommandError("UNAVAILABLE");
  }
}

/**
 * Executes reviewed invitation RPCs after the caller-bound permission check.
 * Acceptance and expiry use their own fixed SQL identity or lifecycle checks.
 */
export async function executeInvitationDatabaseCommand(
  command: InvitationDatabaseInput,
  options: InvitationDatabaseOptions = {},
): Promise<InvitationCommandResult> {
  if (
    !command || typeof command !== "object" || !("operation" in command)
    || !["create", "accept", "expire", "revoke", "resend"].includes(command.operation)
  ) {
    throw new InvitationDatabaseCommandError("INVALID_INPUT");
  }
  switch (command.operation) {
    case "accept": {
      const parsed = parseInput("accept", command.input) as AcceptInvitationInput;
      return rpcResult(await getSupabase(options), "mmhr_accept_invitation", {
        invitation_id: parsed.invitationId,
        verified_email: parsed.verifiedEmail,
        correlation_id: parsed.correlationId,
        idempotency_key: parsed.idempotencyKey,
      });
    }
    case "expire": {
      const parsed = parseInput("expire", command.input) as ExpireInvitationInput;
      return rpcResult(await getSupabase(options), "mmhr_expire_invitation", {
        invitation_id: parsed.invitationId,
        occurred_at: parsed.occurredAt,
        correlation_id: parsed.correlationId,
      });
    }
    case "create": {
      const parsed = parseInput("create", command.input) as CreateInvitationInput;
      let context;
      try {
        context = await requirePermission("org.members.invite", { kind: "organization", organizationId: parsed.organizationId }, options);
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw new InvitationDatabaseCommandError("UNAVAILABLE");
      }
      requireCallerIdentity(parsed, context.identityId);
      return rpcResult(context.supabase, "mmhr_create_invitation", {
        organization_id: parsed.organizationId,
        email: parsed.email,
        role_key: parsed.roleKey,
        reason: parsed.reason,
        correlation_id: parsed.correlationId,
        idempotency_key: parsed.idempotencyKey,
      });
    }
    case "revoke": {
      const parsed = parseInput("revoke", command.input) as RevokeInvitationInput;
      let context;
      try {
        context = await requirePermission("org.members.revoke", { kind: "organization", organizationId: parsed.organizationId }, options);
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw new InvitationDatabaseCommandError("UNAVAILABLE");
      }
      requireCallerIdentity(parsed, context.identityId);
      return rpcResult(context.supabase, "mmhr_revoke_invitation", {
        organization_id: parsed.organizationId,
        invitation_id: parsed.invitationId,
        reason: parsed.reason,
        correlation_id: parsed.correlationId,
        idempotency_key: parsed.idempotencyKey,
      });
    }
    case "resend": {
      const parsed = parseInput("resend", command.input) as ResendInvitationInput;
      let context;
      try {
        context = await requirePermission("org.members.invite", { kind: "organization", organizationId: parsed.organizationId }, options);
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw new InvitationDatabaseCommandError("UNAVAILABLE");
      }
      requireCallerIdentity(parsed, context.identityId);
      return rpcResult(context.supabase, "mmhr_resend_invitation", {
        organization_id: parsed.organizationId,
        invitation_id: parsed.invitationId,
        reason: parsed.reason,
        correlation_id: parsed.correlationId,
        idempotency_key: parsed.idempotencyKey,
      });
    }
  }
}

export function createInvitation(input: CreateInvitationInput, options: InvitationDatabaseOptions = {}): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "create", input }, options);
}

export function acceptInvitation(input: AcceptInvitationInput, options: InvitationDatabaseOptions = {}): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "accept", input }, options);
}

/** Pending callers have no workspace identity read. SQL resolves their identity from auth.uid(). */
export async function acceptCallerInvitation(
  input: Omit<AcceptInvitationInput, "identityId">,
  options: InvitationDatabaseOptions = {},
): InvitationDatabaseResult {
  const parsed = acceptInvitationInputSchema.omit({ identityId: true }).safeParse(input);
  if (!parsed.success) throw new InvitationDatabaseCommandError("INVALID_INPUT");
  return rpcResult(await getSupabase(options), "mmhr_accept_invitation", {
    invitation_id: parsed.data.invitationId,
    verified_email: parsed.data.verifiedEmail,
    correlation_id: parsed.data.correlationId,
    idempotency_key: parsed.data.idempotencyKey,
  });
}

export function expireInvitation(input: ExpireInvitationInput, options: InvitationDatabaseOptions = {}): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "expire", input }, options);
}

export function revokeInvitation(input: RevokeInvitationInput, options: InvitationDatabaseOptions = {}): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "revoke", input }, options);
}

export function resendInvitation(input: ResendInvitationInput, options: InvitationDatabaseOptions = {}): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "resend", input }, options);
}
