import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";
import { vendorEvidencePageSchema } from "@/server/crm/vendor-evidence-contract";

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
      const page = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_get_vendor_evidence(
          ${JSON.stringify({ organizationId: fixture.organizationId, limit: 1 })}::jsonb) AS result`;
        return vendorEvidencePageSchema.parse(row!.result);
      });
      expect(page.items).toMatchObject([{ source: { sourceId }, fact: { factId, status: "draft" }, evidence: { evidenceId }, review: null }]);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]!.registry).toBeUndefined();
      expect(await sql`SELECT owner_identity_id,capture_method,cadence_days,review_required FROM public.vendor_sources WHERE id=${sourceId}::uuid`)
        .toEqual([{ owner_identity_id: fixture.pair[0].identityId, capture_method: "manual", cadence_days: 30, review_required: true }]);
      const registryPage = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: unknown }[]>`SELECT public.mmhr_get_vendor_evidence(
          ${JSON.stringify({ organizationId: fixture.organizationId, registryVersion: 1 })}::jsonb) AS result`;
        return vendorEvidencePageSchema.parse(row!.result);
      });
      expect(registryPage.items[0]!.registry).toEqual({ ownerIdentityId: fixture.pair[0].identityId,
        captureMethod: "manual", cadenceDays: 30, reviewRequired: true });
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => {
        await probe`SELECT public.mmhr_get_vendor_evidence(${JSON.stringify({ organizationId: fixture.organizationId })}::jsonb)`;
      }, "aal1")).rejects.toMatchObject({ code: "42501" });
      const originalFact = await sql`SELECT * FROM public.vendor_facts WHERE id=${factId}::uuid`;
      const renewedSource = randomUUID(), renewedEvidence = randomUUID();
      const renewal = { ...payload, expectedEvidenceVersion: 1,
        source: { ...payload.source, sourceId: renewedSource, capturedAt: "2026-09-02T00:00:00.000Z", captureMethod: "web", cadenceDays: 90 },
        evidence: { ...payload.evidence, evidenceId: renewedEvidence, sourceId: renewedSource,
          version: 2, capturedAt: "2026-09-02T00:00:00.000Z", citation: "Reviewed updated source" } };
      const record = (value: unknown, key = renewedEvidence) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_vendor_evidence(
          ${JSON.stringify(value)}::jsonb,${key}::uuid,${key}::uuid) AS result`;
        return row.result;
      });
      await expect(record({ ...renewal, fact: { ...renewal.fact, value: "Changed without review" } }))
        .rejects.toMatchObject({ code: "42501" });
      for (const metadata of [{ cadenceDays: 0 }, { cadenceDays: 3651 }, { cadenceDays: 1.5 },
        { cadenceDays: null }, { cadenceDays: "90" }, { captureMethod: "invalid" }, { captureMethod: null }]) {
        await expect(record({ ...renewal, source: { ...renewal.source, ...metadata } }))
          .rejects.toMatchObject({ code: "22023" });
      }
      expect(await record(renewal)).toMatchObject({ factId, evidenceId: renewedEvidence, outcomeCode: "recorded" });
      expect(await record(renewal)).toMatchObject({ factId, evidenceId: renewedEvidence, outcomeCode: "replayed" });
      expect(await sql`SELECT * FROM public.vendor_facts WHERE id=${factId}::uuid`).toEqual(originalFact);
      expect(await sql`SELECT capture_method,cadence_days,review_required FROM public.vendor_sources WHERE id=${renewedSource}::uuid`)
        .toEqual([{ capture_method: "web", cadence_days: 90, review_required: true }]);
      expect(await sql`SELECT cadence_days FROM public.vendor_sources WHERE id=${sourceId}::uuid`).toEqual([{ cadence_days: 30 }]);
      expect(await sql`SELECT version FROM public.vendor_evidence_versions WHERE fact_id=${factId}::uuid ORDER BY version`)
        .toEqual([{ version: 1 }, { version: 2 }]);
      expect(await sql`SELECT id FROM public.vendor_fact_reviews WHERE evidence_id=${renewedEvidence}::uuid`).toHaveLength(0);
      await expect(record({ ...renewal, source: { ...renewal.source, sourceId: randomUUID() },
        evidence: { ...renewal.evidence, evidenceId: randomUUID() } }, randomUUID())).rejects.toMatchObject({ code: "22023" });
      expect(await sql`SELECT id FROM public.vendor_evidence_versions WHERE fact_id=${factId}::uuid`).toHaveLength(2);
    });
  }, 120_000);
});
