import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { createAiRunRecord } from "@/server/ai/ai-run-record";

import { aiRunCommandSchema, recordAiRun, recordAiRunRecord } from "./ai-run";

vi.mock("@/server/auth/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization");
  return { ...actual, requirePermission: vi.fn() };
});

const ids = {
  organizationId: "33333333-3333-4333-8333-333333333333",
  actorIdentityId: "55555555-5555-4555-8555-555555555555",
  correlationId: "66666666-6666-4666-8666-666666666666",
  idempotencyKey: "77777777-7777-4777-8777-777777777777",
  runId: "run-2026-0001",
};
const rpc = vi.fn();
const context = {
  supabase: { rpc } as never,
  identityId: ids.actorIdentityId,
  scope: { kind: "organization", organizationId: ids.organizationId },
  assurance: "aal2",
  correlationId: ids.correlationId,
} as const;
const create = {
  ...ids,
  action: "create" as const,
  capability: "summarize" as const,
  dataClass: "internal" as const,
  adapterId: "adapter.test",
  modelId: "model.test",
  templateVersion: "prompt.v1",
  schemaVersion: "output.v1",
  inputArtifacts: [{ artifactId: "doc-1", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  outputArtifact: null,
  outputHash: null,
  sourceReferences: ["source-1"],
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, costCents: 4, latencyMs: 5 },
  status: "running" as const,
  failure: null,
  createdAt: "2026-09-03T00:00:00Z",
  completedAt: null,
};

describe("AI run command", () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
    rpc.mockReset();
  });

  test("requires strict provider-neutral metadata", () => {
    expect(aiRunCommandSchema.safeParse(create).success).toBe(true);
    expect(aiRunCommandSchema.safeParse({ ...create, prompt: "raw prompt" }).success).toBe(false);
    expect(aiRunCommandSchema.safeParse({ ...create, outputHash: "not-a-hash" }).success).toBe(false);
  });

  test("rejects actor mismatch before RPC", async () => {
    await expect(recordAiRun({ ...create, actorIdentityId: ids.correlationId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("validates and returns the audited RPC result", async () => {
    rpc.mockResolvedValue({ data: { runId: ids.runId, organizationId: ids.organizationId, status: "running", revision: 1, outcomeCode: "recorded", correlationId: ids.correlationId }, error: null });
    await expect(recordAiRun(create)).resolves.toMatchObject({ runId: ids.runId, revision: 1 });
    expect(rpc).toHaveBeenCalledWith("mmhr_record_ai_run", expect.objectContaining({ idempotency_key: ids.idempotencyKey }));
  });

  test("persists a validated record without raw provider content", async () => {
    rpc.mockResolvedValue({ data: { runId: ids.runId, organizationId: ids.organizationId, status: "review_required", revision: 1, outcomeCode: "recorded", correlationId: ids.correlationId }, error: null });
    const record = createAiRunRecord({ runId: ids.runId, capability: "summarize", dataClass: "internal", adapterId: "adapter.test", modelId: "model.test", templateVersion: "prompt.v1", schemaVersion: "output.v1", inputArtifacts: [{ artifactId: "doc-1", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }], outputArtifact: { artifactId: "out-1", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, outputHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sourceReferences: ["source-1"], usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costCents: 1, latencyMs: 2 }, status: "review_required", failure: null, review: { decision: "pending", reviewerId: null, approvalReference: null, decidedAt: null, reason: null }, createdAt: "2026-09-03T00:00:00Z", completedAt: "2026-09-03T00:00:02Z" });
    await expect(recordAiRunRecord(record, ids)).resolves.toMatchObject({ runId: ids.runId, status: "review_required" });
  });
});
