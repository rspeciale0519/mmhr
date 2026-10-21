import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sql = readFileSync("drizzle/0104_r3_intake_read.sql", "utf8");
test("uses live organization permission checks for both stable read functions", () => {
  expect(sql.match(/r1_request_has_permission\('workspace.access', \$1\)/g)).toHaveLength(2);
  expect(sql.match(/STABLE SECURITY DEFINER SET search_path = ''/g)).toHaveLength(2);
  expect(sql).toContain("WHERE i.organization_id=$1 AND i.id=$2");
  expect(sql).not.toMatch(/INSERT INTO|UPDATE public|DELETE FROM|DISABLE ROW LEVEL SECURITY|GRANT SELECT/i);
});
test("bounds ordered pages and treats missing records as denied", () => {
  expect(sql).toContain("$3 < 1 OR $3 > 50");
  expect(sql).toContain("($2 IS NULL OR i.id > $2)");
  expect(sql).toContain("ORDER BY i.id LIMIT ($3 + 1)");
  expect(sql).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Intake read denied'/);
});
test("validates legacy data without stripping nested content or returning actor metadata", () => {
  expect(sql).toContain("mmhr_private.r3_intake_data_is_valid(intake_data)");
  expect(sql).toContain("WHERE v <> 'null'::jsonb");
  expect(sql).not.toContain("jsonb_strip_nulls");
  expect(sql).not.toMatch(/created_by_identity_id|updated_by_identity_id|correlation_id/);
});
test("only authenticated callers can execute the public reads", () => {
  expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(sql).toContain("public.mmhr_get_intake(uuid,uuid) TO authenticated");
});
