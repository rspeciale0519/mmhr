import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R9 deletion command RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r9-deletion-command");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => createCommandFixture(sql));
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("records, replays, and separates reviewer decisions by organization", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>, pair = fixture.pair[0]) => asAuthenticated(sql, pair, async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_deletion(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const requestId = randomUUID();
      const create = { requestId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, action: "create", subjectId: fixture.pair[0].identityId, requestedAt: "2026-09-01T00:00:00.000Z", dueAt: "2026-09-02T00:00:00.000Z", legalHold: false, retentionUntil: null, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ requestId, status: "requested", outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ requestId, status: "requested", outcomeCode: "replayed" });
      const decision = { requestId, organizationId: fixture.organizationId, actorIdentityId: fixture.organizationAdmin.identityId, action: "decide", decision: "approved", auditReference: "privacy.deletion.review.1", decidedAt: "2026-09-01T01:00:00.000Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(decision, fixture.organizationAdmin)).resolves.toMatchObject({ requestId, status: "approved", outcomeCode: "recorded" });
      await expect(invoke(decision, fixture.organizationAdmin)).resolves.toMatchObject({ requestId, status: "approved", outcomeCode: "replayed" });
      const selfRequest = { ...create, requestId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await invoke(selfRequest);
      await expect(invoke({ ...selfRequest, action: "decide", decision: "approved", auditReference: "privacy.deletion.review.2", decidedAt: "2026-09-01T01:00:00.000Z", correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow();
    });
  }, 120_000);
});
