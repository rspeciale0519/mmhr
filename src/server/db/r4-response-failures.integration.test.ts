import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 response failure RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-response-failures"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("records visible failure metadata and replays", async () => { await rollbackCase(context!, async (sql) => {
    const failureId = randomUUID(); const correlationId = randomUUID(); const key = randomUUID(); const payload = { failureId, organizationId: fixture.organizationId, failureCode: "parse_failed", failureDetail: "Attachment could not be parsed.", actorIdentityId: fixture.pair[0].identityId };
    const run = async () => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_rfp_response_failure(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${key}::uuid) AS result`; return row!.result; });
    await expect(run()).resolves.toMatchObject({ failureId, state: "failed", failureCode: "parse_failed", outcomeCode: "recorded" });
    await expect(run()).resolves.toMatchObject({ failureId, state: "failed", outcomeCode: "replayed" });
  }); }, 120_000);
});
