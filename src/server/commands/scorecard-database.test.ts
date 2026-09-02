import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import { recordScorecardEntry, scorecardEntryCommandSchema, ScorecardCommandError } from "./scorecard-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const ids = {
  scorecardId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  actorIdentityId: "33333333-3333-4333-8333-333333333333",
  scoreId: "44444444-4444-4444-8444-444444444444",
  correlationId: "55555555-5555-4555-8555-555555555555",
  idempotencyKey: "66666666-6666-4666-8666-666666666666",
};

const input = {
  scorecardId: ids.scorecardId,
  organizationId: ids.organizationId,
  actorIdentityId: ids.actorIdentityId,
  correlationId: ids.correlationId,
  idempotencyKey: ids.idempotencyKey,
  expectedRevision: 1,
  entry: {
    scoreId: ids.scoreId,
    criterionKey: "fit",
    scorerIdentityId: ids.actorIdentityId,
    value: 88,
    comment: null,
    evidenceReferences: ["source:one"],
    enteredAt: "2026-09-01T12:00:00.000Z",
  },
};
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: ids.actorIdentityId,
  scope: { kind: "organization", organizationId: ids.organizationId },
  assurance: "aal2",
  correlationId: ids.correlationId,
} as const satisfies AuthorizationContext;

describe("scorecard database command", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });
  test("accepts a strict scoped entry", () => {
    expect(scorecardEntryCommandSchema.parse(input).entry.criterionKey).toBe("fit");
    expect(scorecardEntryCommandSchema.safeParse({ ...input, extra: true }).success).toBe(false);
  });

  test("rejects an actor and scorer mismatch before database access", async () => {
    await expect(recordScorecardEntry({ ...input, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("requires an exact organization scope and validates the RPC result", async () => {
    rpc.mockResolvedValue({ data: [{ ...ids, entryId: ids.scoreId, revision: 2, outcomeCode: "recorded" }], error: null });
    await expect(recordScorecardEntry(input, { supabase })).rejects.toBeInstanceOf(ScorecardCommandError);
  });
});
