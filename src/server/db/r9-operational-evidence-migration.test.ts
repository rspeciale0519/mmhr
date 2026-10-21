import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0089_r9_operational_evidence_commands.sql", "utf8");

describe("R9 operational evidence command migration", () => {
  test("uses a fixed audited command with replay protection", () => {
    expect(migration).toContain("mmhr_record_operational_evidence");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION");
  });

  test("keeps evidence organization scoped and redacted", () => {
    expect(migration).toContain("organization_id = v_org");
    expect(migration).toContain("availability_observation");
    expect(migration).toContain("performance_measurement");
    expect(migration).not.toContain("payload->>'raw'");
  });

  test("enforces bounded availability and performance inputs", () => {
    expect(migration).toContain("durationSeconds");
    expect(migration).toContain("duration_seconds");
    expect(migration).toContain("sampleCount");
    expect(migration).toContain("lcpP75Ms");
    expect(migration).toContain("inpP75Ms");
    expect(migration).toContain("86400");
    expect(migration).toContain("60000");
  });
});
