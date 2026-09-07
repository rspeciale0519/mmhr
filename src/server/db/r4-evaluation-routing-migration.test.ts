import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/0084_r4_evaluation_routing.sql", "utf8");
const schema = readFileSync("src/server/db/schema/workflow-foundation.ts", "utf8");
describe("R4 evaluation routing migration", () => { test("defines MMHR-first route state and finalization RPC", () => { expect(sql).toContain("evaluation_communication_routes"); expect(sql).toContain("mmhr_record_evaluation_route"); expect(sql).toContain("Final selection is not recorded"); }); test("keeps raw route table and function closed", () => { expect(sql).toContain("r4_deny_anon_authenticated_evaluation_routes"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_evaluation_route"); }); test("keeps route scope and timestamp constraints aligned", () => { expect(schema).toContain("evaluation_communication_routes_deal_scope_fk"); expect(schema).toContain("evaluation_communication_routes_updated_at_ck"); }); });
