import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";

const r3Tables = ["evaluation_candidates", "intake_requirements", "intakes"];

describe("R3 intake and matching foundation", () => {
  let context: RehearsalContext | undefined;

  beforeAll(async () => {
    context = await startRehearsal("r3-intake");
    await applyAllMigrations(context);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("keeps intake records organization scoped and deny by default", async () => {
    const rows = await context!.client<{
      table_name: string;
      rls_enabled: boolean;
      policy_count: number;
      anon_select: boolean;
      authenticated_select: boolean;
    }[]>`
      SELECT c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        count(p.policyname)::integer AS policy_count,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies AS p
        ON p.schemaname = n.nspname AND p.tablename = c.relname
      WHERE n.nspname = 'public' AND c.relname = ANY(${r3Tables}::text[])
      GROUP BY c.oid, c.relname, c.relrowsecurity
      ORDER BY c.relname
    `;

    expect(rows.map((row) => row.table_name)).toEqual(r3Tables);
    expect(rows.every((row) => row.rls_enabled && row.policy_count > 0)).toBe(true);
    expect(rows.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
  });

  test("enforces intake scope and safe candidate relationships", async () => {
    const [organization] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R3 customer') RETURNING id
    `;
    const [vendorOrganization] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R3 vendor') RETURNING id
    `;
    const [vendor] = await context!.client<{ id: string }[]>`
      INSERT INTO public.vendor_profiles (organization_id, description)
      VALUES (${organization!.id}, 'R3 vendor') RETURNING id
    `;
    const [product] = await context!.client<{ id: string }[]>`
      INSERT INTO public.products (organization_id, vendor_profile_id, stable_key, name)
      VALUES (${organization!.id}, ${vendor!.id}, 'r3_product', 'R3 Product') RETURNING id
    `;
    const [intake] = await context!.client<{ id: string }[]>`
      INSERT INTO public.intakes (organization_id, status)
      VALUES (${organization!.id}, 'in_progress') RETURNING id
    `;
    const [requirement] = await context!.client<{ id: string }[]>`
      INSERT INTO public.intake_requirements (organization_id, intake_id, stable_key, label, importance, weight)
      VALUES (${organization!.id}, ${intake!.id}, 'payroll', 'Payroll', 'must', 100) RETURNING id
    `;
    const [candidate] = await context!.client<{ id: string }[]>`
      INSERT INTO public.evaluation_candidates (organization_id, intake_id, product_id, vendor_organization_id, deterministic_score, eligibility)
      VALUES (${organization!.id}, ${intake!.id}, ${product!.id}, ${organization!.id}, 10000, 'eligible') RETURNING id
    `;

    expect(requirement?.id).toBeTruthy();
    expect(candidate?.id).toBeTruthy();
    await expect(context!.client`
      INSERT INTO public.evaluation_candidates (organization_id, intake_id, product_id, vendor_organization_id)
      VALUES (${vendorOrganization!.id}, ${intake!.id}, ${product!.id}, ${vendorOrganization!.id})
    `).rejects.toThrow();
    await expect(context!.client`
      INSERT INTO public.intake_requirements (organization_id, intake_id, stable_key, label)
      VALUES (${organization!.id}, ${intake!.id}, 'payroll', 'Duplicate')
    `).rejects.toThrow();

    // The rehearsal database is discarded after this suite. Requirement history
    // is append-only, so direct cleanup would violate its retention constraints.
  });
});
