import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import {
  acceptInvitation,
  acceptCallerInvitation,
  createInvitation,
  executeInvitationDatabaseCommand,
  expireInvitation,
  InvitationDatabaseCommandError,
  resendInvitation,
  revokeInvitation,
} from "./invitation-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() {
      super("Request is not authorized");
      this.name = "AuthorizationError";
    }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

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
  revoke: { organizationId, invitationId, actorIdentityId: actorId, reason: "Access changed", idempotencyKey, correlationId },
  resend: { organizationId, invitationId, actorIdentityId: actorId, reason: "Please send again", idempotencyKey, correlationId },
} as const;

const result = {
  invitationId,
  status: "pending" as const,
  outcome: "created" as const,
  correlationId,
};
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: actorId,
  scope: { kind: "organization", organizationId },
  assurance: "aal2",
  correlationId,
} as const satisfies AuthorizationContext;

describe("invitation database command boundary", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset().mockResolvedValue({ data: result, error: null });
  });

  test("accepts the current caller without an application identity supplied by the action", async () => {
    const input = { invitationId, verifiedEmail: "person@example.com", correlationId, idempotencyKey };
    await expect(acceptCallerInvitation(input, { supabase })).resolves.toEqual(result);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_accept_invitation", {
      invitation_id: invitationId, verified_email: "person@example.com",
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test("rejects a forged actor on the caller acceptance interface", async () => {
    await expect(acceptCallerInvitation({ ...commandInputs.accept }, { supabase }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("calls the reviewed create RPC after exact organization authorization", async () => {
    await expect(createInvitation(createInput, { supabase })).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "org.members.invite",
      { kind: "organization", organizationId },
      { supabase },
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_invitation", {
      organization_id: organizationId,
      email: "person@example.com",
      role_key: "contributor",
      reason: createInput.reason,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
  });

  test("uses revoke permission and preserves the organization boundary", async () => {
    await expect(revokeInvitation(commandInputs.revoke, { supabase })).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "org.members.revoke",
      { kind: "organization", organizationId },
      { supabase },
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_revoke_invitation", expect.objectContaining({
      organization_id: organizationId,
      invitation_id: invitationId,
    }));
  });

  test("uses invite permission for resend and calls the fixed RPC", async () => {
    await expect(resendInvitation(commandInputs.resend, { supabase })).resolves.toEqual(result);
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "org.members.invite",
      { kind: "organization", organizationId },
      { supabase },
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_resend_invitation", expect.objectContaining({
      organization_id: organizationId,
      invitation_id: invitationId,
    }));
  });

  test("calls acceptance and expiry RPCs without trusting a client actor", async () => {
    await expect(acceptInvitation(commandInputs.accept, { supabase })).resolves.toEqual(result);
    expect(rpc).toHaveBeenLastCalledWith("mmhr_accept_invitation", expect.objectContaining({
      invitation_id: invitationId,
      verified_email: "person@example.com",
    }));
    await expect(expireInvitation(commandInputs.expire, { supabase })).resolves.toEqual(result);
    expect(rpc).toHaveBeenLastCalledWith("mmhr_expire_invitation", {
      invitation_id: invitationId,
      occurred_at: commandInputs.expire.occurredAt,
      correlation_id: correlationId,
    });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("rejects an actor mismatch before the RPC", async () => {
    await expect(createInvitation({ ...createInput, actorIdentityId: identityId }, { supabase }))
      .rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("preserves an authorization denial and never reaches the RPC", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(createInvitation(createInput, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("maps RPC failures and malformed responses without exposing details", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "private database detail" } });
    await expect(createInvitation(createInput, { supabase })).rejects.toMatchObject({
      name: InvitationDatabaseCommandError.name,
      code: "REJECTED",
      message: "Invitation command could not be completed",
    });
    rpc.mockResolvedValueOnce({ data: { invitationId }, error: null });
    await expect(createInvitation(createInput, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    rpc.mockRejectedValueOnce(new Error("network detail"));
    await expect(createInvitation(createInput, { supabase })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  test.each([
    ["create", { ...createInput, token: "secret" }],
    ["accept", { ...commandInputs.accept, identityId: "invalid" }],
    ["expire", { ...commandInputs.expire, occurredAt: "invalid" }],
    ["revoke", { ...commandInputs.revoke, reason: "" }],
    ["resend", { ...commandInputs.resend, invitationId: "invalid" }],
  ] as const)("rejects invalid %s input before authorization", async (operation, input) => {
    const commandResult = executeInvitationDatabaseCommand({ operation, input } as never, { supabase });
    await expect(commandResult).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects an unknown operation without attempting a database call", async () => {
    const commandResult = executeInvitationDatabaseCommand({ operation: "delete", input: {} } as never, { supabase });
    await expect(commandResult).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
