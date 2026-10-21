import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "drizzle", "0001_heavy_kulan_gath.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src/server/db/schema/audit.ts"), "utf8");

describe("R1 audit summary safety contract", () => {
  test("keeps both summary safety checks in SQL and Drizzle", () => {
    for (const name of ["audit_events_before_summary_safe_ck", "audit_events_after_summary_safe_ck"]) {
      expect(migration).toContain(name);
      expect(schema).toContain(name);
    }
    expect(migration).toContain("r1_audit_summary_is_safe");
  });
});
