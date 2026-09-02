import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import { candidateTransitionSchema, transitionEvaluationCandidate } from "./candidate-transition";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const ids = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  actorIdentityId: "33333333-3333-4333-8333-333333333333",
  correlationId: "44444444-4444-4444-8444-444444444444",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};
const input = {
  ...ids, fromState: "proposed" as const, toState: "active" as const,
  expectedRevision: 1, approvalReference: null,
};
const rpc = vi.fn();
const context = {
  supabase: { rpc } as unknown as RequestSupabaseClient,
  identityId: ids.actorIdentityId,
  scope: { kind: "organization", organizationId: ids.organizationId },
  assurance: "aal2", correlationId: ids.correlationId,
} as const satisfies AuthorizationContext;

describe("candidate transition command", () => {
  beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); });
  test("accepts a strict lifecycle command", () => {
    expect(candidateTransitionSchema.parse(input).fromState).toBe("proposed");
    expect(candidateTransitionSchema.safeParse({ ...input, extra: true }).success).toBe(false);
  });
  test("rejects an actor mismatch before database access", async () => {
    await expect(transitionEvaluationCandidate({ ...input, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test("validates the fixed RPC response", async () => {
    rpc.mockResolvedValue({ data: { ...input, state: "active", revision: 2, outcomeCode: "transitioned" }, error: null });
    await expect(transitionEvaluationCandidate(input)).rejects.toThrow("Invalid candidate transition response");
  });
});
