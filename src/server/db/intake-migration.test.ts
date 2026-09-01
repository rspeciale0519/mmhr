import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0013_r3_intake_matching_foundation.sql"), "utf8");

describe("R3 intake migration review", () => {
  test("creates the intake and candidate foundation tables", () => {
    for (const table of ["intakes", "intake_requirements", "evaluation_candidates"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every R3 table", () => {
    for (const table of ["intakes", "intake_requirements", "evaluation_candidates"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw table access before reviewed commands exist", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.intakes");
    expect(migration).toContain("service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for anonymous and authenticated roles", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(3);
  });

  test("enforces organization scope for requirements and candidates", () => {
    expect(migration).toContain("intake_requirements_intake_scope_fk");
    expect(migration).toContain("evaluation_candidates_intake_scope_fk");
    expect(migration).toContain("evaluation_candidates_product_scope_fk");
    expect(migration).toContain("REFERENCES public.intakes (organization_id, id)");
    expect(migration).toContain("REFERENCES public.products (organization_id, id)");
  });

  test("keeps intake and candidate identities unique within their scope", () => {
    expect(migration).toContain("intakes_organization_id_id_uq");
    expect(migration).toContain("intake_requirements_intake_key_uq");
    expect(migration).toContain("evaluation_candidates_intake_product_uq");
  });

  test("preserves deterministic candidate boundaries and separate deal state", () => {
    expect(migration).toContain("evaluation_candidates_source_ck");
    expect(migration).toContain("evaluation_candidates_state_ck");
    expect(migration).toContain("Candidate state is separate from deal state");
    expect(migration).toContain("Requirements drive deterministic matching");
  });
});
