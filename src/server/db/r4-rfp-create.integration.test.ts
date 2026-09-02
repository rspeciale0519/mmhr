import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 RFP create RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-rfp-create"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("creates a versioned draft from a submitted intake and replays it", async () => {
    await rollbackCase(context!, async (sql) => {
      const intakeId = randomUUID(); const rfpId = randomUUID(); const correlationId = randomUUID(); const idempotencyKey = randomUUID();
      await sql`INSERT INTO public.intakes (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 2, clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
      const payload = { rfpId, intakeId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, version: 1, sourceRevision: 2, title: "Selection questionnaire", sections: [{ sectionKey: "fit", title: "Functional fit", questionCount: 4 }], correlationId, idempotencyKey };
      const result = await asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_create_rfp_version(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result`; return row!.result; });
      expect(result).toMatchObject({ rfpId, organizationId: fixture.organizationId, sourceIntakeId: intakeId, version: 1, status: "draft", outcomeCode: "created" });
      const replay = await asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_create_rfp_version(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result`; return row!.result; });
      expect(replay).toMatchObject({ rfpId, outcomeCode: "replayed" });
    });
  }, 120_000);
  test("denies cross-organization RFP drafts", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = { rfpId: randomUUID(), intakeId: randomUUID(), organizationId: "99999999-9999-4999-8999-999999999999", actorIdentityId: fixture.pair[0].identityId, version: 1, sourceRevision: 1, title: "Nope", sections: [{ sectionKey: "fit", title: "Fit", questionCount: 1 }], correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT public.mmhr_create_rfp_version(${JSON.stringify(payload)}::jsonb, ${payload.correlationId}::uuid, ${payload.idempotencyKey}::uuid)`)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
