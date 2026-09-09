import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0102_r2a_lead_rate_limit.sql"), "utf8");

describe("R2A durable lead rate limit migration", () => {
  test("keeps aggregate counters closed and independent of caller identifiers", () => {
    expect(migration).toContain('CREATE TABLE "lead_rate_limits"');
    expect(migration).toContain('CONSTRAINT "lead_rate_limits_key_ck"');
    expect(migration).toContain('CONSTRAINT "lead_rate_limits_count_ck"');
    expect(migration).toContain("CREATE INDEX \"lead_rate_limits_window_idx\"");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (false) WITH CHECK (false)");
    expect(migration).toContain("REVOKE ALL ON TABLE public.lead_rate_limits");
    expect(migration).not.toMatch(/request.headers|x-forwarded-for|x-real-ip|cf-connecting-ip/);
  });

  test("enforces the limit inside the fixed public lead command", () => {
    expect(migration).toContain("r2a_consume_lead_rate_limit");
    expect(migration).toContain("'rate_limited'::text");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_create_lead");
    expect(migration).toContain("WHERE limits.request_count < 100");
    expect(migration).toContain("EXCEPTION WHEN SQLSTATE 'P4290'");
    expect(migration).not.toMatch(/WHEN others|DELETE FROM|DROP TABLE|DISABLE ROW LEVEL SECURITY/);
  });
});
