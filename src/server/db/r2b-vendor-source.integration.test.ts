import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2B vendor source registry RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let vendorProfileId: string;
  beforeAll(async () => {
    context = await startRehearsal("r2b-vendor-source");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.vendor_profiles (organization_id,status,created_by_identity_id) VALUES (${f.organizationId}::uuid,'active',${f.pair[0].identityId}::uuid) RETURNING id`;
      vendorProfileId = vendor!.id;
      return f;
    });
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("records, replays, retires, and rejects stale sources", async () => {
    await rollbackCase(context!, async (sql) => {
      const sourceId = randomUUID();
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_vendor_source(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const base = { organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, sourceId };
      const create = { ...base, action: "create", vendorProfileId, ownerIdentityId: fixture.pair[0].identityId, uri: "https://vendor.example.invalid/source", sourceType: "manual", captureMethod: "manual", cadenceDays: 30, licenseNote: "Public documentation", reviewRequired: true, capturedAt: "2026-09-01T00:00:00.000Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ sourceId, active: true, revision: 1, outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ sourceId, outcomeCode: "replayed" });
      const retire = { ...base, action: "retire", expectedRevision: 1, reason: "License expired", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(retire)).resolves.toMatchObject({ sourceId, active: false, revision: 2, outcomeCode: "recorded" });
      await expect(invoke({ ...retire, correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow("Vendor source is stale");
    });
  }, 120_000);
});
