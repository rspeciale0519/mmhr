import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2A lead routing RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r2a-lead-routing"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("captures an authenticated lead without idempotency-key ambiguity", async () => {
    await rollbackCase(context!, async (sql) => {
      const idempotencyKey = randomUUID();
      const result = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<Record<string, unknown>[]>`
          SELECT * FROM public.mmhr_create_lead(
            'Captured Lead', 'Captured Co', 'captured@example.invalid',
            '+12125550100', 'website', now(), ${idempotencyKey}::uuid
          )
        `;
        return row!;
      });
      expect(result).toMatchObject({ status: "new", outcome_code: "created" });
      const replayed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<Record<string, unknown>[]>`
          SELECT * FROM public.mmhr_create_lead(
            'Captured Lead', 'Captured Co', 'captured@example.invalid',
            '+12125550100', 'website', now(), ${idempotencyKey}::uuid
          )
        `;
        return row!;
      });
      expect(replayed).toMatchObject({ outcome_code: "replayed" });
    });
  }, 120_000);
  test("routes a captured lead to an active organization member and replays", async () => {
    await rollbackCase(context!, async (sql) => {
      const idempotencyKey = randomUUID();
      const leadId = randomUUID();
      await sql`
        INSERT INTO public.leads (id, full_name, company, work_email, phone, source, status, consent_at, idempotency_key, request_digest, correlation_id)
        VALUES (${leadId}::uuid, 'Routed Lead', 'Routed Co', 'routed@example.invalid', '+12125550100', 'website', 'new', now(),
          ${idempotencyKey}::uuid, repeat('a', 64), ${idempotencyKey}::uuid)
      `;
      const payload = { leadId, organizationId: fixture.organizationId, ownerIdentityId: fixture.pair[0].identityId, status: "contacted" };
      const routed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_route_lead(${JSON.stringify(payload)}::jsonb, ${idempotencyKey}::uuid, ${idempotencyKey}::uuid) AS result`;
        return row!.result;
      });
      expect(routed).toMatchObject({ leadId, organizationId: fixture.organizationId, ownerIdentityId: fixture.pair[0].identityId, status: "contacted", outcomeCode: "routed" });
      const replayed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_route_lead(${JSON.stringify(payload)}::jsonb, ${idempotencyKey}::uuid, ${idempotencyKey}::uuid) AS result`;
        return row!.result;
      });
      expect(replayed).toMatchObject({ outcomeCode: "replayed", leadId });
      const [stored] = await sql<{ organization_id: string; routing_owner_identity_id: string; status: string }[]>`SELECT organization_id, routing_owner_identity_id, status FROM public.leads WHERE id = ${leadId}::uuid`;
      expect(stored).toMatchObject({ organization_id: fixture.organizationId, routing_owner_identity_id: fixture.pair[0].identityId, status: "contacted" });
    });
  }, 120_000);
});
