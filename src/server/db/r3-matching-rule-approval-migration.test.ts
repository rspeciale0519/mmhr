import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const migration = readFileSync(join(process.cwd(), "drizzle", "0041_r3_matching_rule_approval.sql"), "utf8");
describe("R3 matching rule approval migration", () => { test("uses fixed audited approval and replay", () => { expect(migration).toContain("mmhr_approve_matching_rule_set"); expect(migration).toContain("status <> 'draft'"); expect(migration).toContain("r3.matching.rule.approve"); expect(migration).toContain("r1_checked_receipt"); expect(migration).toContain("r1_finish_security_command"); }); test("closes raw rule tables and grants only authenticated RPC access", () => { expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_approve_matching_rule_set"); expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_approve_matching_rule_set"); expect(migration).toContain("SET search_path = ''"); }); });
