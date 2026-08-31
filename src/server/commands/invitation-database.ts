import "server-only";

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

/**
 * The invitation SQL command functions are not present in the applied schema.
 * Keep this boundary explicit until reviewed functions provide atomic writes.
 */
export class InvitationDatabaseCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE") {
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

function validateInput(operation: InvitationDatabaseOperation, input: unknown): void {
  const valid = operation === "create"
    ? createInvitationInputSchema.safeParse(input).success
    : operation === "accept"
      ? acceptInvitationInputSchema.safeParse(input).success
      : operation === "expire"
        ? expireInvitationInputSchema.safeParse(input).success
        : operation === "revoke"
          ? revokeInvitationInputSchema.safeParse(input).success
          : resendInvitationInputSchema.safeParse(input).success;
  if (!valid) throw new InvitationDatabaseCommandError("INVALID_INPUT");
}

/**
 * Validate the provider-neutral command contract, then stop because no reviewed
 * database function exists for this operation. Never guess an RPC name here.
 */
export async function executeInvitationDatabaseCommand(
  command: InvitationDatabaseInput,
): Promise<never> {
  if (!command || typeof command !== "object" || !("operation" in command)
    || !["create", "accept", "expire", "revoke", "resend"].includes(command.operation)) {
    throw new InvitationDatabaseCommandError("INVALID_INPUT");
  }
  validateInput(command.operation, command.input);
  throw new InvitationDatabaseCommandError("UNAVAILABLE");
}

export function createInvitation(input: CreateInvitationInput): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "create", input });
}

export function acceptInvitation(input: AcceptInvitationInput): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "accept", input });
}

export function expireInvitation(input: ExpireInvitationInput): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "expire", input });
}

export function revokeInvitation(input: RevokeInvitationInput): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "revoke", input });
}

export function resendInvitation(input: ResendInvitationInput): InvitationDatabaseResult {
  return executeInvitationDatabaseCommand({ operation: "resend", input });
}
