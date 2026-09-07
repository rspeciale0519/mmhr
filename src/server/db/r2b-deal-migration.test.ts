import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/0080_r2b_deal_commands.sql", "utf8");
const schema = readFileSync("src/server/db/schema/crm-workflow.ts", "utf8");
describe("R2B deal command migration", () => {
  test("defines scoped audited deal RPC", () => { expect(sql).toContain("mmhr_record_deal"); expect(sql).toContain("r1_start_security_command"); expect(sql).toContain("r1_finish_security_command"); expect(sql).toContain("deal_stage_history"); });
  test("checks lifecycle links and closes raw function access", () => { expect(sql).toContain("Deal product denied"); expect(sql).toContain("Deal transition is stale"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_deal"); expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_deal"); });
  test("keeps deal and renewal scope constraints aligned", () => { for (const name of ["deals_product_vendor_scope_fk", "deal_stage_history_deal_scope_fk", "renewals_source_deal_scope_fk", "renewals_follow_on_deal_scope_fk"]) expect(schema).toContain(name); });
});
