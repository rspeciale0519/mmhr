import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R8 renewal RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let sourceDealId: string;
  beforeAll(async () => {
    context = await startRehearsal("r8-renewal");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [deal] = await sql<{ id: string }[]>`INSERT INTO public.deals (organization_id, owner_identity_id, stage, status) VALUES (${f.organizationId}::uuid,${f.pair[0].identityId}::uuid,'won','won') RETURNING id`;
      sourceDealId = deal!.id;
      return f;
    });
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("creates, transitions, and replays renewal", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_renewal(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const renewalId = randomUUID();
      const create = { renewalId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, action: "create", contractId: randomUUID(), sourceDealId, ownerIdentityId: fixture.pair[0].identityId, contractStartAt: "2026-01-01T00:00:00.000Z", contractEndAt: "2027-01-01T00:00:00.000Z", renewalWindowStartAt: "2026-10-01T00:00:00.000Z", renewalWindowEndAt: "2026-12-01T00:00:00.000Z", nextActionAt: "2026-10-15T00:00:00.000Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ renewalId, status: "upcoming", revision: 1, outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ renewalId, outcomeCode: "replayed" });
      const transition = { renewalId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, action: "transition", fromStatus: "upcoming", toStatus: "in_review", expectedRevision: 1, occurredAt: "2026-09-01T00:00:00.000Z", reason: "Begin renewal review", approvalReference: null, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(transition)).resolves.toMatchObject({ status: "in_review", revision: 2 });
    });
  }, 120_000);
});
