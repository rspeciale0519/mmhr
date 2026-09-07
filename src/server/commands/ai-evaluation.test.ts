import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { aiEvaluationCommandSchema, recordAiEvaluation } from "./ai-evaluation";

vi.mock("@/server/auth/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization");
  return { ...actual, requirePermission: vi.fn() };
});

const ids = { evaluationId: "11111111-1111-4111-8111-111111111111", actorIdentityId: "22222222-2222-4222-8222-222222222222", correlationId: "33333333-3333-4333-8333-333333333333", idempotencyKey: "44444444-4444-4444-8444-444444444444" };
const rpc = vi.fn();
const context = { supabase: { rpc } as never, identityId: ids.actorIdentityId, scope: { kind: "platform" }, assurance: "aal2", correlationId: ids.correlationId } as const;
const record = { ...ids, action: "record" as const, capability: "normalize_response" as const, dataClass: "internal" as const, adapterId: "adapter:one", modelId: "model:one", schemaVersion: "response-v1", fixtureSetVersion: "fixtures-2026-09", fixtureCount: 2, passed: true, reportHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "pending" as const, evaluatedAt: "2026-09-03T00:00:00Z" };

describe("AI evaluation command", () => {
  beforeEach(() => { vi.mocked(requirePermission).mockReset().mockResolvedValue(context); rpc.mockReset(); });
  test("accepts hashed fixture evidence and rejects raw output fields", () => { expect(aiEvaluationCommandSchema.safeParse(record).success).toBe(true); expect(aiEvaluationCommandSchema.safeParse({ ...record, output: "raw" }).success).toBe(false); });
  test("requires platform authorization and actor identity match", async () => { await expect(recordAiEvaluation({ ...record, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled(); });
  test("validates the audited result", async () => { rpc.mockResolvedValue({ data: { evaluationId: ids.evaluationId, status: "pending", revision: 1, outcomeCode: "recorded", correlationId: ids.correlationId }, error: null }); await expect(recordAiEvaluation(record)).resolves.toMatchObject({ evaluationId: ids.evaluationId, status: "pending" }); });
});
