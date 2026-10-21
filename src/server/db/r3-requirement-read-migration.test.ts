import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sql = readFileSync("drizzle/0106_r3_requirement_read.sql", "utf8");
test("uses live scoped authorization and verifies the parent before reading requirements", () => {
  expect(sql).toContain("STABLE SECURITY DEFINER SET search_path = ''");
  expect(sql).toContain("r1_request_has_permission('workspace.access', $1)");
  expect(sql).toContain("WHERE i.organization_id=$1 AND i.id=$2");
  expect(sql).toContain("WHERE r.organization_id=$1 AND r.intake_id=$2 AND r.status='active'");
  expect(sql).not.toMatch(/INSERT INTO|UPDATE public|DELETE FROM|DISABLE ROW LEVEL SECURITY|GRANT SELECT/i);
});
test("bounds cursor pagination and rejects unsafe legacy data without modifying it", () => {
  expect(sql).toContain("$4 < 1 OR $4 > 50");
  expect(sql).toContain("($3 IS NULL OR r.id > $3)");
  expect(sql).toContain("ORDER BY r.id LIMIT ($4 + 1)");
  expect(sql).toContain("saved.response IS NOT NULL");
  expect(sql).toContain("r3_requirement_response_is_valid(saved.response)");
  expect(sql).toContain("octet_length(saved.response::text) > 100000");
  expect(sql).not.toMatch(/btrim|jsonb_strip_nulls|8000/);
});
test("omits internal fields and limits execution to authenticated callers", () => {
  expect(sql).not.toMatch(/owner_identity_id|created_by_identity_id|updated_by_identity_id|correlation_id|evidence_references|vendor_response_links|r\.\*/);
  expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(sql).toContain("TO authenticated");
});
