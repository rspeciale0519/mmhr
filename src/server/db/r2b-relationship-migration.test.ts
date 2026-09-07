import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/0081_r2b_relationship_commands.sql", "utf8");
describe("R2B relationship command migration", () => {
  test("defines scoped relationship RPC and immutable audit history", () => { expect(sql).toContain("mmhr_record_relationship"); expect(sql).toContain("r1_start_security_command"); expect(sql).toContain("r1_finish_security_command"); expect(sql).toContain("relationships"); });
  test("checks endpoint scope and raw function access", () => { expect(sql).toContain("Invalid relationship endpoints"); expect(sql).toContain("Relationship contact denied"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_relationship"); });
});
