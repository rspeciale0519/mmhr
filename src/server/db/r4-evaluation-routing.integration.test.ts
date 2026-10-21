import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 evaluation routing RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-evaluation-routing"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("keeps evaluation traffic on MMHR until final selection", async () => {
    await rollbackCase(context!, async (sql) => {
      const dealId = randomUUID(); const routeId = randomUUID(); const actor = fixture.pair[0].identityId;
      await sql`INSERT INTO public.deals (id, organization_id, owner_identity_id, stage, status) VALUES (${dealId}::uuid, ${fixture.organizationId}::uuid, ${actor}::uuid, 'lead', 'open')`;
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_evaluation_route(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`; return row!.result; });
      const base = { organizationId: fixture.organizationId, actorIdentityId: actor, routeId, dealId };
      const create = { ...base, action: "create", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ routeId, route: "mmhr", state: "active", revision: 1 });
      await expect(invoke(create)).resolves.toMatchObject({ routeId, outcomeCode: "replayed" });
      await expect(invoke({ ...base, action: "finalize", expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow("Final selection is not recorded");
      await sql`UPDATE public.deals SET stage = 'won', status = 'won', updated_at = clock_timestamp() WHERE organization_id = ${fixture.organizationId}::uuid AND id = ${dealId}::uuid`;
      await expect(invoke({ ...base, action: "finalize", expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() })).resolves.toMatchObject({ routeId, route: "direct", state: "finalized", revision: 2 });
    });
  }, 120_000);
});
