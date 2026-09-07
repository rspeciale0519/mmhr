import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2B vendor fact override RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let factId: string;
  let sourceId: string;
  beforeAll(async () => {
    context = await startRehearsal("r2b-vendor-fact-override");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const vendorProfileId = randomUUID();
      await sql`INSERT INTO public.vendor_profiles (id,organization_id,status,description) VALUES (${vendorProfileId}::uuid,${f.organizationId}::uuid,'active','Override fixture')`;
      sourceId = randomUUID();
      await sql`INSERT INTO public.vendor_sources (id,organization_id,vendor_profile_id,uri,source_type,captured_at,active) VALUES (${sourceId}::uuid,${f.organizationId}::uuid,${vendorProfileId}::uuid,'https://vendor.example/terms','manual',now(),true)`;
      factId = randomUUID();
      await sql`INSERT INTO public.vendor_facts (id,organization_id,vendor_profile_id,field_key,value,observed_at,status) VALUES (${factId}::uuid,${f.organizationId}::uuid,${vendorProfileId}::uuid,'support_tier','standard',now(),'published')`;
      return f;
    });
  }, 240000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180000);

  test("records, replays, and rejects an out-of-scope override", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_vendor_fact_override(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const base = { action: "create", organizationId: fixture.organizationId, factId, sourceId, value: "premium", approvedByIdentityId: fixture.pair[0].identityId, approvedAt: "2026-09-03T00:00:00Z", expiresAt: "2026-10-03T00:00:00Z", reason: "Reviewed vendor source", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      const overrideId = randomUUID();
      const create = { ...base, overrideId };
      await expect(invoke(create)).resolves.toMatchObject({ overrideId, factId, sourceId, outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ overrideId, outcomeCode: "replayed" });
      await expect(invoke({ ...base, overrideId: randomUUID(), sourceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow("Vendor override scope denied");
    });
  }, 120000);
});
