import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0100_r1-member-read.sql"), "utf8");
test("keeps old member response shape and filters both read paths", () => {
  expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_get_organization_members(organization_id uuid)");
  expect(migration.match(/AND NOT m\.migration_review_required/g)).toHaveLength(2);
  expect(migration.match(/r1_request_has_permission\('member.role.read'/g)).toHaveLength(2);
  expect(migration.match(/SET search_path = ''/g)).toHaveLength(2);
});
test("bounds the new read without modifying data or granting raw access", () => {
  expect(migration).toContain("$3 IS NULL OR $3 < 1 OR $3 > 100");
  expect(migration).toContain("ORDER BY m.id LIMIT ($3 + 1)");
  expect(migration).toContain("AND ($2 IS NULL OR m.id > $2)");
  expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(migration).toContain("TO authenticated");
  expect(migration).not.toMatch(/\b(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\./i);
});
