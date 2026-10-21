import { describe, expect, test } from "vitest";

import {
  acceptInvitation,
  createInvitationInputSchema,
  expireInvitation,
  prepareInvitationCreate,
  resendInvitation,
  revokeInvitation,
} from "./invitation-administration";

const organizationId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const identityId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const replacementKey = "77777777-7777-4777-8777-777777777777";
const start = new Date("2026-08-31T12:00:00.000Z");

const input = {
  organizationId,
  email: " Person@Example.com ",
  roleKey: "contributor" as const,
  actorIdentityId: actorId,
  reason: "Add the implementation contact",
  idempotencyKey,
  correlationId,
};

const options = { now: () => start, createId: () => invitationId };

describe("invitation administration contract", () => {
  test("normalizes input and prepares a token-free delivery intent", () => {
    const plan = prepareInvitationCreate(input, options);
    expect(plan.record).toMatchObject({
      invitationId,
      organizationId,
      normalizedEmail: "person@example.com",
      status: "pending",
      expiresAt: "2026-09-03T12:00:00.000Z",
    });
    expect(plan.deliveryIntent).toEqual(expect.objectContaining({
      operation: "invitation_delivery",
      invitationId,
      email: "person@example.com",
    }));
    expect(plan.deliveryIntent).not.toHaveProperty("token");
  });

  test.each([
    ["free-form token", { ...input, token: "secret" }],
    ["bad email", { ...input, email: "not-an-email" }],
    ["bad role", { ...input, roleKey: "super_admin" }],
    ["secret in reason", { ...input, reason: "token=private" }],
  ])("rejects %s", (_, value) => {
    expect(createInvitationInputSchema.safeParse(value).success).toBe(false);
  });

  test("accepts once only after verified email matching", () => {
    const plan = prepareInvitationCreate(input, options);
    const accepted = acceptInvitation(plan.record, {
      invitationId,
      identityId,
      verifiedEmail: "PERSON@example.com",
      idempotencyKey,
      correlationId,
    }, options);
    expect(accepted.record).toMatchObject({ status: "accepted", acceptedByIdentityId: identityId });
    expect(() => acceptInvitation(accepted.record, {
      invitationId,
      identityId,
      verifiedEmail: "person@example.com",
      idempotencyKey,
      correlationId,
    }, options)).toThrow("not pending");
  });

  test("rejects wrong email and expired invitations", () => {
    const plan = prepareInvitationCreate(input, options);
    expect(() => acceptInvitation(plan.record, {
      invitationId,
      identityId,
      verifiedEmail: "other@example.com",
      idempotencyKey,
      correlationId,
    }, options)).toThrow("email does not match");
    expect(() => acceptInvitation(plan.record, {
      invitationId,
      identityId,
      verifiedEmail: "person@example.com",
      idempotencyKey,
      correlationId,
    }, { now: () => new Date("2026-09-03T12:00:00.000Z") })).toThrow("has expired");
  });

  test("expires only after the recorded deadline", () => {
    const plan = prepareInvitationCreate(input, options);
    expect(() => expireInvitation(plan.record, {
      invitationId,
      occurredAt: "2026-09-03T11:59:59.999Z",
      correlationId,
    })).toThrow("has not expired");
    const expired = expireInvitation(plan.record, {
      invitationId,
      occurredAt: "2026-09-03T12:00:00.000Z",
      correlationId,
    });
    expect(expired.record.status).toBe("expired");
  });

  test("revokes a pending invitation and preserves its reason", () => {
    const plan = prepareInvitationCreate(input, options);
    const revoked = revokeInvitation(plan.record, {
      organizationId,
      invitationId,
      actorIdentityId: actorId,
      reason: "The access request changed",
      idempotencyKey,
      correlationId,
    }, options);
    expect(revoked.record).toMatchObject({ status: "revoked", revokedByIdentityId: actorId, revokedReason: "The access request changed" });
    expect(() => revokeInvitation(revoked.record, {
      organizationId,
      invitationId,
      actorIdentityId: actorId,
      reason: "Duplicate revoke",
      idempotencyKey,
      correlationId,
    }, options)).toThrow("not pending");
  });

  test("resend revokes before preparing one replacement intent", () => {
    const plan = prepareInvitationCreate(input, options);
    const resent = resendInvitation(plan.record, {
      organizationId,
      invitationId,
      actorIdentityId: actorId,
      reason: "The previous notice expired from the inbox",
      idempotencyKey: replacementKey,
      correlationId,
    }, { ...options, createId: () => "88888888-8888-4888-8888-888888888888" });
    expect(resent.revoked.status).toBe("revoked");
    expect(resent.replacement.record.invitationId).not.toBe(invitationId);
    expect(resent.replacement.result.outcome).toBe("replaced");
    expect(resent.replacement.deliveryIntent.email).toBe("person@example.com");
  });
});
