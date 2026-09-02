import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2B vendor evidence commands", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r2b-vendor-evidence");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("records a scoped draft evidence bundle with an audit receipt", async () => {
    await rollbackCase(context!, async (sql) => {
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, status, created_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid) RETURNING id`;
      const sourceId = randomUUID(); const factId = randomUUID(); const evidenceId = randomUUID();
      const payload = {
        source: { sourceId, organizationId: fixture.organizationId, vendorProfileId: vendor!.id,
          uri: "https://vendor.example.invalid/docs", sourceType: "manual", licenseNote: null,
          capturedAt: "2026-09-01T00:00:00.000Z", active: true },
        fact: { factId, organizationId: fixture.organizationId, vendorProfileId: vendor!.id,
          productId: null, fieldKey: "supports_sso", value: "Yes", observedAt: "2026-09-01T00:00:00.000Z", status: "draft" },
        evidence: { evidenceId, organizationId: fixture.organizationId, factId, sourceId, version: 1,
          contentHash: "b".repeat(64), capturedAt: "2026-09-01T00:00:00.000Z", freshUntil: "2027-09-01T00:00:00.000Z", citation: "Vendor documentation" },
      };
      const result = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_vendor_evidence(${JSON.stringify(payload)}::jsonb, ${evidenceId}::uuid, ${evidenceId}::uuid) AS result`;
        return row!.result;
      });
      expect(result).toMatchObject({ sourceId, factId, evidenceId, organizationId: fixture.organizationId, outcomeCode: "recorded" });
      const rows = await sql`SELECT id FROM public.vendor_evidence_versions WHERE organization_id = ${fixture.organizationId}::uuid AND id = ${evidenceId}::uuid`;
      expect(rows).toHaveLength(1);
      const receipts = await sql`SELECT id FROM public.security_command_receipts WHERE idempotency_key = ${evidenceId}::uuid`;
      expect(receipts).toHaveLength(1);
    });
  }, 120_000);
});
