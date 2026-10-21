import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/0079_r2b_vendor_fact_overrides.sql", "utf8");
const schema = readFileSync("src/server/db/schema/crm-workflow.ts", "utf8");
describe("R2B vendor fact override migration", () => {
  test("adds a source link and fixed audited RPC", () => {
    expect(sql).toContain("ADD COLUMN source_id uuid");
    expect(sql).toContain("vendor_fact_overrides_source_scope_fk");
    expect(sql).toContain("mmhr_record_vendor_fact_override");
    expect(sql).toContain("r1_start_security_command");
    expect(sql).toContain("r1_finish_security_command");
  });
  test("closes raw access and grants only the command", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_vendor_fact_override");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_vendor_fact_override");
  });
  test("keeps fact, evidence, and override scope aligned", () => { for (const name of ["vendor_facts_vendor_scope_fk", "vendor_facts_product_scope_fk", "vendor_evidence_fact_scope_fk", "vendor_evidence_source_scope_fk", "vendor_fact_reviews_evidence_scope_fk", "vendor_fact_overrides_fact_scope_fk", "vendor_fact_overrides_source_scope_fk"]) expect(schema).toContain(name); });
});
