import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";

const crmTables = [
  "contacts",
  "customer_profiles",
  "products",
  "relationships",
  "vendor_profiles",
];

describe("R2B CRM foundation", () => {
  let context: RehearsalContext | undefined;

  beforeAll(async () => {
    context = await startRehearsal("r2b-crm");
    await applyAllMigrations(context);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates organization-scoped CRM tables with RLS and explicit deny policies", async () => {
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
      WHERE n.nspname = 'public' AND c.relname = ANY(${crmTables}::text[])
      GROUP BY c.oid, c.relname, c.relrowsecurity
      ORDER BY c.relname
    `;

    expect(rows.map((row) => row.table_name)).toEqual(crmTables);
    expect(rows.every((row) => row.rls_enabled && row.policy_count > 0)).toBe(true);
    expect(rows.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
  });

  test("stores each core record under one organization and preserves history fields", async () => {
    const [customerOrg] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R2B customer') RETURNING id
    `;
    const [vendorOrg] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R2B vendor') RETURNING id
    `;
    const customerId = customerOrg!.id;
    const vendorId = vendorOrg!.id;

    const [customer] = await context!.client<{ id: string; revision: number }[]>`
      INSERT INTO public.customer_profiles (organization_id, business_context)
      VALUES (${customerId}, 'HR software selection') RETURNING id, revision
    `;
    const [vendor] = await context!.client<{ id: string; revision: number }[]>`
      INSERT INTO public.vendor_profiles (organization_id, description)
      VALUES (${vendorId}, 'Vendor profile') RETURNING id, revision
    `;
    const [product] = await context!.client<{ id: string; revision: number }[]>`
      INSERT INTO public.products (organization_id, vendor_profile_id, stable_key, name)
      VALUES (${vendorId}, ${vendor!.id}, 'core_product', 'Core Product')
      RETURNING id, revision
    `;
    const [contact] = await context!.client<{ id: string; revision: number }[]>`
      INSERT INTO public.contacts (organization_id, full_name, normalized_email)
      VALUES (${customerId}, 'Customer Contact', 'contact@example.com')
      RETURNING id, revision
    `;
    const [relatedContact] = await context!.client<{ id: string }[]>`
      INSERT INTO public.contacts (organization_id, full_name)
      VALUES (${customerId}, 'Related Contact') RETURNING id
    `;
    const [relationship] = await context!.client<{ id: string; revision: number }[]>`
      INSERT INTO public.relationships (
        organization_id, relationship_type, subject_contact_id, related_contact_id,
        preference
      ) VALUES (
        ${customerId}, 'customer_contact', ${contact!.id}, ${relatedContact!.id}, 'email'
      ) RETURNING id, revision
    `;

    expect(customer?.revision).toBe(1);
    expect(vendor?.revision).toBe(1);
    expect(product?.revision).toBe(1);
    expect(contact?.revision).toBe(1);
    expect(relationship?.revision).toBe(1);
    const columns = await context!.client<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${crmTables}::text[])
        AND column_name IN ('revision', 'correlation_id', 'created_at', 'updated_at')
      ORDER BY table_name, column_name
    `;
    expect(columns).toHaveLength(20);

    await context!.client`DELETE FROM public.relationships WHERE organization_id = ${customerId}`;
    await context!.client`DELETE FROM public.contacts WHERE organization_id = ${customerId}`;
    await context!.client`DELETE FROM public.products WHERE organization_id = ${vendorId}`;
    await context!.client`DELETE FROM public.vendor_profiles WHERE organization_id = ${vendorId}`;
    await context!.client`DELETE FROM public.customer_profiles WHERE organization_id = ${customerId}`;
    await context!.client`DELETE FROM public.orgs WHERE id IN (${customerId}, ${vendorId})`;
  });

  test("rejects unsafe statuses, invalid endpoints, and cross-organization contact links", async () => {
    const [firstOrg] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R2B first') RETURNING id
    `;
    const [secondOrg] = await context!.client<{ id: string }[]>`
      INSERT INTO public.orgs (name) VALUES ('R2B second') RETURNING id
    `;
    const [firstContact] = await context!.client<{ id: string }[]>`
      INSERT INTO public.contacts (organization_id, full_name)
      VALUES (${firstOrg!.id}, 'First Contact') RETURNING id
    `;
    const [secondContact] = await context!.client<{ id: string }[]>`
      INSERT INTO public.contacts (organization_id, full_name)
      VALUES (${secondOrg!.id}, 'Second Contact') RETURNING id
    `;

    await expect(context!.client`
      INSERT INTO public.customer_profiles (organization_id, status)
      VALUES (${firstOrg!.id}, 'unknown')
    `).rejects.toThrow();
    await expect(context!.client`
      INSERT INTO public.relationships (
        organization_id, relationship_type, subject_contact_id, related_contact_id
      ) VALUES (${firstOrg!.id}, 'customer_contact', ${firstContact!.id}, ${secondContact!.id})
    `).rejects.toThrow();
    await expect(context!.client`
      INSERT INTO public.relationships (
        organization_id, relationship_type, subject_organization_id,
        subject_contact_id, related_organization_id
      ) VALUES (${firstOrg!.id}, 'other', ${firstOrg!.id}, ${firstContact!.id}, ${secondOrg!.id})
    `).rejects.toThrow();

    await context!.client`DELETE FROM public.relationships WHERE organization_id IN (${firstOrg!.id}, ${secondOrg!.id})`;
    await context!.client`DELETE FROM public.contacts WHERE organization_id IN (${firstOrg!.id}, ${secondOrg!.id})`;
    await context!.client`DELETE FROM public.orgs WHERE id IN (${firstOrg!.id}, ${secondOrg!.id})`;
  });
});
