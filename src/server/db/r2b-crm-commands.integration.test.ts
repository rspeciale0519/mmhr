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

  test("approves catalog profiles with scoped authority, immutable review and safe replay", async () => {
    await rollbackCase(context!, async sql => {
      const [vendor] = await sql<{id:string}[]>`INSERT INTO public.vendor_profiles (organization_id,description)
        VALUES (${fixture.organizationId}::uuid,'Catalog test') RETURNING id`;
      const ids = commandInput();
      const input = { organizationId: fixture.organizationId, profileId: vendor!.id, expectedRevision: 1,
        reason: "Verified catalog identity and product scope", approvalReference: "review:catalog-test" };
      const read = { organizationId: fixture.organizationId, profileId: vendor!.id };
      const invoke = (actor = fixture.pair[0], payload = input, key = ids.idempotencyKey) => asAuthenticated(sql, actor, probe => probe<{result:Record<string,unknown>}[]>`
        SELECT public.mmhr_approve_vendor_catalog_profile(${JSON.stringify(payload)}::jsonb,${ids.correlationId}::uuid,${key}::uuid) AS result`);
      const [before] = await asAuthenticated(sql, fixture.pair[0], probe => probe<{result:unknown}[]>`
        SELECT public.mmhr_get_vendor_catalog_profile(${JSON.stringify(read)}::jsonb) AS result`);
      expect(before!.result).toMatchObject({ revision: 1, approvedAt: null, status: "prospect" });
      await expect(invoke(fixture.organizationAdmin)).rejects.toMatchObject({code:"42501"});
      await expect(invoke(fixture.target)).rejects.toMatchObject({code:"42501"});
      await expect(invoke(fixture.pair[0], {...input,profileId:randomUUID()})).rejects.toMatchObject({code:"42501"});
      await expect(invoke(fixture.pair[0], {...input,expectedRevision:2})).rejects.toMatchObject({code:"42501"});
      await expect(invoke(fixture.pair[0], {...input,organizationId:randomUUID()})).rejects.toMatchObject({code:"42501"});
      for (const status of ["paused", "archived"]) {
        await sql`UPDATE public.vendor_profiles SET status=${status} WHERE id=${vendor!.id}::uuid`;
        await expect(invoke()).rejects.toMatchObject({code:"42501"});
      }
      await sql`UPDATE public.vendor_profiles SET status='prospect' WHERE id=${vendor!.id}::uuid`;
      await expect(invoke(fixture.pair[0], {...input,approvedByIdentityId:fixture.target.identityId} as typeof input)).rejects.toMatchObject({code:"22023"});
      const [approved] = await invoke();
      expect(approved!.result).toMatchObject({profileId:vendor!.id,revision:2,status:"active",outcomeCode:"approved"});
      expect(approved!.result.approvedAt).toBeTruthy();
      const [replay] = await invoke();
      expect(replay!.result).toMatchObject({...approved!.result,outcomeCode:"replayed"});
      await expect(invoke(fixture.pair[0], {...input,reason:"Changed retry"})).rejects.toMatchObject({code:"22023"});
      await expect(invoke(fixture.pair[0], {...input,expectedRevision:2}, randomUUID())).rejects.toMatchObject({code:"42501"});
      const [stored] = await sql`SELECT approved_by_identity_id,approved_commercial_metadata,revision FROM public.vendor_profiles WHERE id=${vendor!.id}::uuid`;
      expect(stored).toMatchObject({approved_by_identity_id:fixture.pair[0].identityId,approved_commercial_metadata:null,revision:2});
      const audits = await sql`SELECT id,reason,before_summary,after_summary FROM public.audit_events WHERE idempotency_key=${ids.idempotencyKey}`;
      const receipts = await sql`SELECT id FROM public.security_command_receipts WHERE idempotency_key=${ids.idempotencyKey}::uuid`;
      expect(audits).toHaveLength(1); expect(receipts).toHaveLength(1);
      expect(audits[0]).toMatchObject({reason:input.reason+' [reference: '+input.approvalReference+']',before_summary:{state:'pending',version:1},after_summary:{state:'approved',version:2}});
      await expect(asAuthenticated(sql,fixture.target,probe => probe`SELECT public.mmhr_get_vendor_catalog_profile(${JSON.stringify(read)}::jsonb)`)).rejects.toMatchObject({code:"42501"});
    });
  },240_000);

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
      const productId = String(productRow!.result.recordId);
      const searchPayload = { organizationId: fixture.organizationId, resource: "product", query: "Core Product" };
      const [searchBefore] = await asAuthenticated(sql, fixture.pair[0], probe => probe<{ result: Record<string, unknown>[] }[]>`
        SELECT public.mmhr_search_crm(${JSON.stringify(searchPayload)}::jsonb) AS result`);
      expect(searchBefore!.result).toEqual([{ recordId: productId, organizationId: fixture.organizationId,
        resource: "product", label: "Core Product", status: "draft", revision: 1 }]);
      const activation = commandInput();
      const activateInput = { organizationId: fixture.organizationId, productId, expectedRevision: 1,
        status: "active", idempotencyKey: activation.idempotencyKey };
      const activate = () => asAuthenticated(sql, fixture.pair[0], probe => probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_update_product(${JSON.stringify(activateInput)}::jsonb,
          ${activation.correlationId}::uuid,${activation.idempotencyKey}::uuid) AS result`);
      expect((await activate())[0]!.result).toMatchObject({ recordId: productId, revision: 2, outcomeCode: "updated" });
      expect((await activate())[0]!.result).toMatchObject({ recordId: productId, revision: 2, outcomeCode: "replayed" });
      const stale = commandInput();
      await expect(sql.savepoint(probe => asAuthenticated(probe, fixture.pair[0], request => request`
        SELECT public.mmhr_update_product(${JSON.stringify({ ...activateInput, idempotencyKey: stale.idempotencyKey })}::jsonb,
          ${stale.correlationId}::uuid,${stale.idempotencyKey}::uuid)`))).rejects.toMatchObject({ code: "42501" });
      const [searchAfter] = await asAuthenticated(sql, fixture.pair[0], probe => probe<{ result: Record<string, unknown>[] }[]>`
        SELECT public.mmhr_search_crm(${JSON.stringify(searchPayload)}::jsonb) AS result`);
      expect(searchAfter!.result[0]).toMatchObject({ status: "active", revision: 2 });
    });
  }, 120_000);
});
