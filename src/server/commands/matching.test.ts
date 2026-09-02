import { describe, expect, test, vi, beforeEach } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { runDeterministicMatching, deterministicMatchingSchema } from "./matching";

vi.mock("@/server/auth/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization");
  return { ...actual, requirePermission: vi.fn() };
});

const ids = { organizationId: "11111111-1111-4111-8111-111111111111", intakeId: "22222222-2222-4222-8222-222222222222", actorIdentityId: "33333333-3333-4333-8333-333333333333", correlationId: "44444444-4444-4444-8444-444444444444", idempotencyKey: "55555555-5555-4555-8555-555555555555" };
const rpc = vi.fn();
const context = { supabase: { rpc } as never, identityId: ids.actorIdentityId, scope: { kind: "organization", organizationId: ids.organizationId }, assurance: "aal2", correlationId: ids.correlationId } as const;

describe("deterministic matching command", () => {
  beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); });
  test("requires strict approved rule input", () => {
    expect(deterministicMatchingSchema.safeParse({ ...ids, ruleVersion: 1, extra: true }).success).toBe(false);
    expect(deterministicMatchingSchema.safeParse({ ...ids, ruleVersion: 0 }).success).toBe(false);
  });
  test("rejects actor mismatch before RPC", async () => {
    await expect(runDeterministicMatching({ ...ids, ruleVersion: 1, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
