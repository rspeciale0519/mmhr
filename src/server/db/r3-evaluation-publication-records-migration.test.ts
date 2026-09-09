import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { applicationMigrationCount, applicationTables } from "./test/application-schema-inventory";

const migration = readFileSync("drizzle/0115_r3_evaluation_publication_records.sql", "utf8");
const tables = ["evaluation_publications", "evaluation_publication_options", "evaluation_publication_decisions"];

test.each(tables)("keeps %s private and immutable", (table) => {
  expect(applicationTables).toContain(table);
  expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  expect(migration).toContain(`CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON public.${table}`);
  expect(migration).toContain(`CREATE TRIGGER ${table}_append_only_truncate BEFORE TRUNCATE ON public.${table}`);
  expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(migration).not.toMatch(/GRANT\s+\w+/i);
});

test("creates referenced uniqueness before scoped foreign keys", () => {
  const unique = migration.indexOf('CREATE UNIQUE INDEX "evaluation_publications_scope_id_uq"');
  const reference = migration.indexOf('REFERENCES "public"."evaluation_publications"');
  expect(unique).toBeGreaterThan(0);
  expect(unique).toBeLessThan(reference);
  expect(migration).toContain('FOREIGN KEY ("vendor_organization_id","product_id") REFERENCES "public"."products"("organization_id","id")');
});

test("bounds private snapshots without a five-option storage limit", () => {
  expect(migration).toContain('octet_length("evaluation_publications"."input_snapshot"::text) <= 20000000');
  expect(migration).toContain('"option_count" >= 0');
  expect(migration).not.toMatch(/option_count[^;]*between 0 and (5|100)\b/i);
  expect(applicationMigrationCount).toBeGreaterThanOrEqual(118);
});
