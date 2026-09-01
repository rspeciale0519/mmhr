import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0012_r2b_crm_foundation.sql"), "utf8");

describe("R2B CRM foundation migration review", () => {
  test("creates every required CRM foundation table", () => {
    for (const table of ["customer_profiles", "vendor_profiles", "products", "contacts", "relationships"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every CRM foundation table", () => {
    for (const table of ["customer_profiles", "vendor_profiles", "products", "contacts", "relationships"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw table access before reviewed commands exist", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.customer_profiles");
    expect(migration).toContain("service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for anonymous and authenticated roles", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(5);
  });

  test("enforces product, relationship, and contact organization scope", () => {
    expect(migration).toContain("products_vendor_scope_fk");
    expect(migration).toContain("relationships_subject_contact_scope_fk");
    expect(migration).toContain("relationships_related_contact_scope_fk");
    expect(migration).toContain("REFERENCES public.vendor_profiles (organization_id, id)");
    expect(migration).toContain("REFERENCES public.contacts (organization_id, id)");
  });

  test("keeps scoped records and contact addresses unique", () => {
    expect(migration).toContain("vendor_profiles_organization_id_id_uq");
    expect(migration).toContain("contacts_organization_id_id_uq");
    expect(migration).toContain("contacts_organization_email_uq");
    expect(migration).toContain("products_vendor_stable_key_uq");
  });

  test("documents approval, endpoint, and immutable ownership constraints", () => {
    expect(migration).toContain("vendor_profiles_approval_ck");
    expect(migration).toContain("relationships_endpoint_ck");
    expect(migration).toContain("immutable ownership scope");
    expect(migration).toContain("Commercial metadata requires later approval workflow");
  });
});
