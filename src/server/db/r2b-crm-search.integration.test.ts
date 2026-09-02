import { afterAll, beforeAll, describe, expect, test } from "vitest";

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

describe("R2B CRM search RPC", () => {
  const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r2b-crm-search");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("returns only scoped redacted contacts with deterministic paging", async () => {
    await rollbackCase(context!, async (sql) => {
      const [contact] = await sql<{ id: string }[]>`
        INSERT INTO public.contacts (organization_id, full_name, normalized_email,
          title, created_by_identity_id, updated_by_identity_id)
        VALUES (${fixture.organizationId}::uuid, 'Search Contact', 'search@example.invalid',
          'Private title', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
        RETURNING id`;
      const result = await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: unknown }[]>`
          SELECT public.mmhr_search_crm(${JSON.stringify({
            organizationId: fixture.organizationId,
            resource: "contact",
            query: "search",
            limit: 10,
          })}::jsonb) AS result
        `;
        return row!.result;
      });
      expect(result).toEqual([{
        recordId: contact!.id,
        organizationId: fixture.organizationId,
        resource: "contact",
        label: "Search Contact",
        status: "active",
      }]);
    });
  }, 120_000);

  test("denies another organization and malformed paging", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_search_crm(${JSON.stringify({
          organizationId: otherOrganizationId,
          resource: "contact",
        })}::jsonb)
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`
        SELECT public.mmhr_search_crm(${JSON.stringify({
          organizationId: fixture.organizationId,
          resource: "contact",
          limit: 101,
        })}::jsonb)
      `)).rejects.toMatchObject({ code: "22023" });
    });
  }, 120_000);
});
