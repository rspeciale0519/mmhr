import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  rollbackCase,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";

describe("R2B CRM duplicate candidate RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r2b-crm-duplicate");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records normalized-key candidates once and replays safely", async () => {
    await rollbackCase(context!, async (sql) => {
      const [left, right] = await sql<{ id: string }[]>`
        INSERT INTO public.contacts (
          organization_id, full_name, normalized_email,
          created_by_identity_id, updated_by_identity_id
        ) VALUES
          (${fixture.organizationId}::uuid, 'Duplicate Left', 'duplicate-left@example.invalid',
            ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid),
          (${fixture.organizationId}::uuid, 'Duplicate Right', 'duplicate-right@example.invalid',
            ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id
      `;
      const batchId = randomUUID();
      const payload = {
        batchId,
        organizationId: fixture.organizationId,
        candidates: [{
          candidateKey: "contact:email:duplicate_example.invalid",
          resource: "contact",
          leftRecordId: left!.id,
          rightRecordId: right!.id,
          signal: "normalized_key",
          state: "open",
        }],
      };
      const recorded = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_crm_duplicate_candidates(
            ${JSON.stringify(payload)}::jsonb, ${batchId}::uuid, ${batchId}::uuid
          ) AS result
        `;
        return row!.result;
      });
      expect(recorded).toMatchObject({
        batchId, organizationId: fixture.organizationId, insertedCount: 1, outcomeCode: "recorded",
      });
      const replayed = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_crm_duplicate_candidates(
            ${JSON.stringify(payload)}::jsonb, ${batchId}::uuid, ${batchId}::uuid
          ) AS result
        `;
        return row!.result;
      });
      expect(replayed).toMatchObject({ batchId, insertedCount: 0, outcomeCode: "replayed" });
      const rows = await sql`SELECT id FROM public.crm_duplicate_candidates WHERE organization_id = ${fixture.organizationId}::uuid`;
      expect(rows).toHaveLength(1);
      const receipts = await sql`SELECT id FROM public.security_command_receipts WHERE idempotency_key = ${batchId}::uuid`;
      const events = await sql`SELECT id FROM public.audit_events WHERE command = 'crm.duplicate.detect'`;
      expect(receipts).toHaveLength(1);
      expect(events).toHaveLength(1);
    });
  }, 120_000);

  test("rejects cross-organization records and merge states", async () => {
    await rollbackCase(context!, async (sql) => {
      const [contact] = await sql<{ id: string }[]>`
        INSERT INTO public.contacts (organization_id, full_name)
        VALUES (${fixture.organizationId}::uuid, 'Scoped Contact') RETURNING id
      `;
      const crossOrg = {
        batchId: randomUUID(), organizationId: fixture.organizationId,
        candidates: [{ candidateKey: "contact:cross-org", resource: "contact",
          leftRecordId: contact!.id, rightRecordId: randomUUID(), signal: "normalized_key", state: "open" }],
      };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_record_crm_duplicate_candidates(
          ${JSON.stringify(crossOrg)}::jsonb, ${crossOrg.batchId}::uuid, ${crossOrg.batchId}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });
      const invalid = { ...crossOrg,
        candidates: [{ ...crossOrg.candidates[0], state: "merged" }] };
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_record_crm_duplicate_candidates(
          ${JSON.stringify(invalid)}::jsonb, ${invalid.batchId}::uuid, ${invalid.batchId}::uuid)
      `)).rejects.toMatchObject({ code: "22023" });
    });
  }, 120_000);
});
