import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R8 follow-up schedule RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r8-follow-up-schedule");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    await context.client.begin(async (sql) => {
      await sql`INSERT INTO public.user_permission_overrides (identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason) VALUES (${fixture.organizationAdmin.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${fixture.pair[1].identityId}::uuid,'Follow-up schedule approval fixture')`;
    });
  }, 240000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180000);

  test("creates, replays, approves, pauses, and retires a schedule", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>, pair = fixture.pair[0]) => asAuthenticated(sql, pair, async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_follow_up_schedule(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const scheduleId = randomUUID();
      const base = { organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, scheduleId };
      const create = { ...base, action: "create", subjectType: "risk", subjectId: randomUUID(), intervalDays: 30, firstCheckInAt: "2026-09-03T00:00:00Z", nextCheckInAt: "2026-10-03T00:00:00Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ scheduleId, subjectType: "risk", status: "draft", revision: 1 });
      await expect(invoke(create)).resolves.toMatchObject({ scheduleId, outcomeCode: "replayed" });
      const approve = { ...base, actorIdentityId: fixture.organizationAdmin.identityId, action: "approve", expectedRevision: 1, approvedAt: "2026-09-03T00:00:00Z", approvalReference: "approval:ops-follow-up-1", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(approve, fixture.organizationAdmin)).resolves.toMatchObject({ scheduleId, status: "approved", revision: 2 });
      const pause = { ...base, actorIdentityId: fixture.organizationAdmin.identityId, action: "pause", expectedRevision: 2, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(pause, fixture.organizationAdmin)).resolves.toMatchObject({ scheduleId, status: "paused", revision: 3 });
      const retire = { ...base, actorIdentityId: fixture.organizationAdmin.identityId, action: "retire", expectedRevision: 3, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(retire, fixture.organizationAdmin)).resolves.toMatchObject({ scheduleId, status: "retired", revision: 4 });
    });
  }, 120000);
});
