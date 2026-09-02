import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0027_r2b_crm_commands.sql"), "utf8");

describe("R2B CRM command migration review", () => {
  test("defines fixed contact and product command functions", () => {
    for (const name of ["mmhr_create_contact", "mmhr_update_contact", "mmhr_create_product", "mmhr_update_product"]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${name}`);
    }
  });

  test("uses fixed security-definer search paths and the shared command lifecycle", () => {
    expect((migration.match(/SECURITY DEFINER SET search_path = ''/g) ?? []).length).toBe(4);
    expect((migration.match(/r1_start_security_command\(/g) ?? []).length).toBe(4);
    expect((migration.match(/r1_finish_security_command\(/g) ?? []).length).toBe(4);
    expect(migration).toContain("r1_checked_receipt");
  });

  test("checks organization scope and optimistic revisions", () => {
    expect(migration).toContain("c.organization_id = organization_id");
    expect(migration).toContain("p.organization_id = organization_id");
    expect(migration).toContain("contact.revision <> expected_revision");
    expect(migration).toContain("product.revision <> expected_revision");
    expect(migration).toContain("vendor_profile_id AND v.organization_id = organization_id");
  });

  test("keeps CRM functions inaccessible to raw runtime roles", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_create_contact");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("TO authenticated");
  });

  test("returns a strict provider-neutral result with replay outcomes", () => {
    expect(migration).toContain("'outcomeCode', $5");
    expect(migration).toContain("'replayed'");
    expect(migration).toContain("'created'");
    expect(migration).toContain("'updated'");
  });
});
