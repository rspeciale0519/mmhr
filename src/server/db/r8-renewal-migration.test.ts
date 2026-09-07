import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "drizzle", "0074_r8_renewal_commands.sql"), "utf8");
describe("R8 renewal migration", () => {
  test("defines an audited authenticated RPC", () => {
    expect(migration).toContain("mmhr_record_renewal");
    expect(migration).toContain("r1_start_security_command");
    expect(migration).toContain("r1_finish_security_command");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_renewal");
  });
  test("enforces transition and organization boundaries", () => {
    expect(migration).toContain("Renewal transition not allowed");
    expect(migration).toContain("sourceDealId");
    expect(migration).toContain("Follow-on deal denied");
    expect(migration).toContain("organization_id=v_org");
  });
});
