import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/0082_r2b_vendor_source_registry.sql", "utf8");
const schema = readFileSync("src/server/db/schema/crm-workflow.ts", "utf8");
describe("R2B vendor source registry migration", () => {
  test("adds registry metadata and audited lifecycle RPC", () => { expect(sql).toContain("capture_method"); expect(sql).toContain("cadence_days"); expect(sql).toContain("review_required"); expect(sql).toContain("mmhr_record_vendor_source"); expect(sql).toContain("r1_finish_security_command"); });
  test("closes raw function access and validates scope", () => { expect(sql).toContain("Vendor source scope denied"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_vendor_source"); });
  test("keeps vendor source scope aligned", () => { expect(schema).toContain("vendor_sources_vendor_scope_fk"); });
});
