import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sql = readFileSync("drizzle/0111_r3_candidate_vendor_scope.sql", "utf8");
const schema = readFileSync("src/server/db/schema/r3-intake.ts", "utf8");
const legacyAdd = readFileSync("drizzle/0036_r3_candidate_add_commands.sql", "utf8");
const legacyMatching = readFileSync("drizzle/0040_r3_deterministic_matching.sql", "utf8");

test("backfills and validates the vendor relation before removing the old constraint", () => {
  const markers = [
    "ADD COLUMN vendor_organization_id uuid;",
    "SET vendor_organization_id = product.organization_id",
    "ALTER COLUMN vendor_organization_id SET NOT NULL",
    "ADD CONSTRAINT evaluation_candidates_product_vendor_scope_fk",
    "DROP CONSTRAINT evaluation_candidates_product_scope_fk",
  ];
  const positions = markers.map((marker) => sql.indexOf(marker));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(sql).toContain("FOREIGN KEY (vendor_organization_id, product_id)");
  expect(sql).toContain("REFERENCES public.products (organization_id, id) ON DELETE RESTRICT");
  expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|DISABLE ROW LEVEL SECURITY|DISABLE TRIGGER/i);
  expect(sql).not.toContain("DROP CONSTRAINT evaluation_candidates_intake_scope_fk");
});

test("preserves the legacy add contract and changes only its stored vendor scope", () => {
  const start = "CREATE OR REPLACE FUNCTION public.mmhr_add_evaluation_candidate(";
  const original = legacyAdd.slice(legacyAdd.indexOf(start)).trim();
  const expected = original
    .replace("id, organization_id, intake_id, product_id, source, created_by_identity_id, updated_by_identity_id",
      "id, organization_id, intake_id, product_id, vendor_organization_id, source, created_by_identity_id, updated_by_identity_id")
    .replace("candidate_id, organization_id, intake_id, product_id, source,",
      "candidate_id, organization_id, intake_id, product_id, organization_id, source,");
  expect(sql.replaceAll("\r\n", "\n")).toContain(expected.replaceAll("\r\n", "\n"));
  expect(sql).toContain("p.organization_id = organization_id");
  expect(sql).toContain("initial_count >= 5");
  expect(sql).not.toMatch(/payload\s*->>\s*'vendorOrganizationId'/);
});

test("changes only the five vendor fact expressions in the matching function", () => {
  const start = "CREATE OR REPLACE FUNCTION public.mmhr_run_deterministic_matching(";
  const expected = legacyMatching.slice(legacyMatching.indexOf(start)).trim()
    .replaceAll("vf.organization_id=v_organization_id", "vf.organization_id=candidate.vendor_organization_id");
  expect(sql.replaceAll("\r\n", "\n")).toContain(expected.replaceAll("\r\n", "\n"));
  expect(sql.match(/vf\.organization_id=candidate\.vendor_organization_id/g)).toHaveLength(5);
  expect(sql).not.toContain("vf.organization_id=v_organization_id");
  expect(sql).toContain("r1_start_security_command('workspace.access', v_organization_id");
});

test("keeps raw access denied and existing function grants limited", () => {
  expect(sql.match(/SECURITY DEFINER SET search_path = ''/g)).toHaveLength(2);
  expect(sql.match(/GRANT EXECUTE ON FUNCTION public\.[a-z_]+\(jsonb,uuid,uuid\) TO authenticated/g)).toHaveLength(2);
  expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)/i);
  expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/);
});

test("records the generated schema and journal boundary", () => {
  expect(schema).toContain('vendorOrganizationId: uuid("vendor_organization_id").notNull()');
  expect(schema).toContain("columns: [t.vendorOrganizationId, t.productId]");
  expect(schema).toContain('name: "evaluation_candidates_intake_scope_fk"');
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  expect(journal.entries).toContainEqual(expect.objectContaining({ idx: 111, tag: "0111_r3_candidate_vendor_scope" }));
});
