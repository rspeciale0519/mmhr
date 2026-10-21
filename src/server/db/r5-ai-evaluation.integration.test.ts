import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R5 AI evaluation RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r5-ai-evaluation"); await applyAllMigrations(context); fixture = await context.client.begin(async (sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("records and approves a passed fixture evaluation with replay and self-review denial", async () => {
    await rollbackCase(context!, async (sql) => {
      const evaluationId = randomUUID();
      const invoke = async (payload: Record<string, unknown>, auth = fixture.pair[0]) => asAuthenticated(sql, auth, async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_ai_evaluation(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const record = { evaluationId, action: "record", actorIdentityId: fixture.pair[0].identityId, capability: "normalize_response", dataClass: "internal", adapterId: "adapter:one", modelId: "model:one", schemaVersion: "response-v1", fixtureSetVersion: "fixtures-2026-09", fixtureCount: 2, passed: true, reportHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "pending", evaluatedAt: "2026-09-03T00:00:00Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(record)).resolves.toMatchObject({ evaluationId, status: "pending", revision: 1, outcomeCode: "recorded" });
      await expect(invoke(record)).resolves.toMatchObject({ outcomeCode: "replayed" });
      const decision = { evaluationId, action: "decide", actorIdentityId: fixture.pair[1].identityId, decision: "approved", approvalReference: "approval:eval", reviewedAt: "2026-09-03T00:01:00Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(decision, fixture.pair[1])).resolves.toMatchObject({ evaluationId, status: "approved", revision: 2, outcomeCode: "recorded" });
      await expect(invoke({ ...decision, actorIdentityId: fixture.pair[0].identityId, correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow();
    });
  }, 120_000);
});
