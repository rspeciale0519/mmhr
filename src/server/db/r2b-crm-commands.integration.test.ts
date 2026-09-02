import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  commandInput,
  createCommandFixture,
  rollbackCase,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";

describe("R2B CRM audited command RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r2b-crm-commands");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates and replays a contact with one audit event and receipt", async () => {
    await rollbackCase(context!, async (sql) => {
      const command = commandInput();
      const input = {
        organizationId: fixture.organizationId,
        fullName: "CRM Contact",
        normalizedEmail: "crm.contact@example.invalid",
        phone: "+12125550100",
        title: "Buyer",
        status: "active",
        idempotencyKey: command.idempotencyKey,
      };
      const first = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_create_contact(
            ${JSON.stringify(input)}::jsonb, ${command.correlationId}::uuid,
            ${input.idempotencyKey}::uuid
          ) AS result
        `;
        return row!.result;
      });
      expect(first).toMatchObject({
        operation: "create_contact",
        organizationId: fixture.organizationId,
        revision: 1,
        outcomeCode: "created",
      });
      const replay = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_create_contact(
            ${JSON.stringify(input)}::jsonb, ${command.correlationId}::uuid,
            ${input.idempotencyKey}::uuid
          ) AS result
        `;
        return row!.result;
      });
      expect(replay).toMatchObject({ outcomeCode: "replayed", recordId: first.recordId });
      const receipts = await sql`
        SELECT id FROM public.security_command_receipts
        WHERE idempotency_key = ${input.idempotencyKey}::uuid
      `;
      const events = await sql`
        SELECT id FROM public.audit_events
        WHERE idempotency_key = ${input.idempotencyKey}
      `;
      expect(receipts).toHaveLength(1);
      expect(events).toHaveLength(1);
    });
  }, 120_000);

  test("updates contacts and products with revision and organization checks", async () => {
    await rollbackCase(context!, async (sql) => {
      const contactCommand = commandInput();
      const [vendor] = await sql<{ id: string }[]>`
        INSERT INTO public.vendor_profiles (organization_id, description)
        VALUES (${fixture.organizationId}::uuid, 'Command vendor') RETURNING id
      `;
      const createInput = {
        organizationId: fixture.organizationId,
        fullName: "Revision Contact",
        normalizedEmail: null,
        phone: null,
        title: null,
        status: "active",
        idempotencyKey: contactCommand.idempotencyKey,
      };
      const [contactRow] = await asAuthenticated(sql, fixture.pair[0], async (probe) => probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_create_contact(
          ${JSON.stringify(createInput)}::jsonb, ${contactCommand.correlationId}::uuid,
          ${createInput.idempotencyKey}::uuid
        ) AS result
      `);
      const contactId = contactRow!.result.recordId as string;
      const updateCommand = commandInput();
      const updateInput = {
        organizationId: fixture.organizationId,
        contactId,
        title: "Decision Maker",
        expectedRevision: 1,
        idempotencyKey: updateCommand.idempotencyKey,
      };
      const [updatedContact] = await asAuthenticated(sql, fixture.pair[0], async (probe) => probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_update_contact(
          ${JSON.stringify(updateInput)}::jsonb, ${updateCommand.correlationId}::uuid,
          ${updateInput.idempotencyKey}::uuid
        ) AS result
      `);
      expect(updatedContact!.result).toMatchObject({ operation: "update_contact", revision: 2, outcomeCode: "updated" });
      const staleCommand = commandInput();
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_update_contact(
          ${JSON.stringify({ ...updateInput, title: "Stale" })}::jsonb,
          ${staleCommand.correlationId}::uuid, ${staleCommand.idempotencyKey}::uuid
        )
      `)).rejects.toMatchObject({ code: "42501" });

      const productCommand = commandInput();
      const productInput = {
        organizationId: fixture.organizationId,
        vendorProfileId: vendor!.id,
        stableKey: "core_product",
        name: "Core Product",
        description: null,
        status: "draft",
        idempotencyKey: productCommand.idempotencyKey,
      };
      const [productRow] = await asAuthenticated(sql, fixture.pair[0], async (probe) => probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_create_product(
          ${JSON.stringify(productInput)}::jsonb, ${productCommand.correlationId}::uuid,
          ${productInput.idempotencyKey}::uuid
        ) AS result
      `);
      expect(productRow!.result).toMatchObject({ operation: "create_product", revision: 1, outcomeCode: "created" });
    });
  }, 120_000);
});
