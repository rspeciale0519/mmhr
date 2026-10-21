import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R8 work item RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r8-work-item");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, replays, and updates a role-scoped task", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_work_item(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result
        `;
        return row!.result;
      });
      const taskId = randomUUID();
      const create = {
        taskId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
        action: "create", queue: "follow_ups", assignedRole: "operations", status: "open", priority: "high",
        escalated: true, createdAt: new Date().toISOString(), correlationId: randomUUID(), idempotencyKey: randomUUID(),
      };
      await expect(invoke(create)).resolves.toMatchObject({ taskId, status: "open", outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ taskId, outcomeCode: "replayed" });
      const update = { taskId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, action: "update", expectedStatus: "open", status: "completed", priority: "high", escalated: false, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(update)).resolves.toMatchObject({ taskId, status: "completed", outcomeCode: "recorded" });
    });
  }, 120_000);
});
