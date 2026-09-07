import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R5 AI run recording RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r5-ai-run");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records, approves, and replays a review-required run", async () => {
    await rollbackCase(context!, async (sql) => {
      const runId = `run-${randomUUID()}`;
      const outputHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const base = {
        runId,
        organizationId: fixture.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
      };
      const invoke = async (payload: Record<string, unknown>, auth = fixture.pair[0]) =>
        asAuthenticated(sql, auth, async (probe) => {
          const [row] = await probe<{ result: Record<string, unknown> }[]>`
            SELECT public.mmhr_record_ai_run(
              ${JSON.stringify(payload)}::jsonb,
              ${String(payload.correlationId)}::uuid,
              ${String(payload.idempotencyKey)}::uuid
            ) AS result
          `;
          return row!.result;
        });
      const create = {
        ...base,
        action: "create",
        actorIdentityId: fixture.pair[0].identityId,
        capability: "summarize",
        dataClass: "internal",
        adapterId: "adapter.test",
        modelId: "model.test",
        templateVersion: "prompt.v1",
        schemaVersion: "output.v1",
        inputArtifacts: [{ artifactId: "doc-1", sha256: outputHash }],
        outputArtifact: { artifactId: "out-1", sha256: outputHash },
        outputHash,
        sourceReferences: ["source-1"],
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, costCents: 4, latencyMs: 5 },
        status: "review_required",
        failure: null,
        createdAt: "2026-09-03T00:00:00Z",
        completedAt: "2026-09-03T00:00:05Z",
      };
      await expect(invoke(create)).resolves.toMatchObject({ runId, status: "review_required", revision: 1, outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ outcomeCode: "replayed" });
      const decision = {
        ...base,
        action: "decide",
        actorIdentityId: fixture.organizationAdmin.identityId,
        decision: "approved",
        approvalReference: "approval:ai-run",
        decidedAt: "2026-09-03T00:01:00Z",
        reason: "Reviewed against cited source.",
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
      };
      await expect(invoke(decision, fixture.organizationAdmin)).resolves.toMatchObject({ runId, status: "approved", revision: 2, outcomeCode: "recorded" });
      await expect(invoke({ ...decision, correlationId: randomUUID(), idempotencyKey: randomUUID() }, fixture.organizationAdmin)).rejects.toThrow();
    });
  }, 120_000);
});
