import { describe, expect, test } from "vitest";

import {
  acceptInvitation,
  createInvitation,
  executeInvitationDatabaseCommand,
  expireInvitation,
  InvitationDatabaseCommandError,
  resendInvitation,
  revokeInvitation,
} from "./invitation-database";

const organizationId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const identityId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";

const createInput = {
  organizationId,
  email: "person@example.com",
  roleKey: "contributor" as const,
  actorIdentityId: actorId,
  reason: "Add the implementation contact",
  idempotencyKey,
  correlationId,
};

const commandInputs = {
  create: createInput,
  accept: {
    invitationId,
    identityId,
    verifiedEmail: "person@example.com",
    idempotencyKey,
    correlationId,
  },
  expire: { invitationId, occurredAt: "2026-09-03T12:00:00.000Z", correlationId },
  revoke: { invitationId, actorIdentityId: actorId, reason: "Access changed", idempotencyKey, correlationId },
  resend: { invitationId, actorIdentityId: actorId, reason: "Please send again", idempotencyKey, correlationId },
} as const;

describe("invitation database command boundary", () => {
  test.each([
    ["create", () => createInvitation(commandInputs.create)],
    ["accept", () => acceptInvitation(commandInputs.accept)],
    ["expire", () => expireInvitation(commandInputs.expire)],
    ["revoke", () => revokeInvitation(commandInputs.revoke)],
    ["resend", () => resendInvitation(commandInputs.resend)],
  ])("fails closed when the %s SQL command is unavailable", async (_, invoke) => {
    await expect(invoke()).rejects.toMatchObject({
      name: InvitationDatabaseCommandError.name,
      code: "UNAVAILABLE",
      message: "Invitation command could not be completed",
    });
  });

  test.each([
    ["create", { ...createInput, token: "secret" }],
    ["accept", { ...commandInputs.accept, identityId: "invalid" }],
    ["expire", { ...commandInputs.expire, occurredAt: "invalid" }],
    ["revoke", { ...commandInputs.revoke, reason: "" }],
    ["resend", { ...commandInputs.resend, invitationId: "invalid" }],
  ] as const)("rejects invalid %s input before the unavailable result", async (operation, input) => {
    const result = executeInvitationDatabaseCommand({ operation, input } as never);
    await expect(result).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  test("rejects an unknown operation without attempting a database call", async () => {
    const result = executeInvitationDatabaseCommand({ operation: "delete", input: {} } as never);
    await expect(result).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
