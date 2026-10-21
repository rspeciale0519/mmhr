import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/0085_r2b_vendor_acquisition.sql", "utf8");
describe("R2B vendor acquisition migration", () => { test("defines manual and automated run states", () => { expect(sql).toContain("vendor_acquisition_runs"); expect(sql).toContain("mode IN ('manual', 'automated')"); expect(sql).toContain("mmhr_record_vendor_acquisition"); }); test("closes raw access and redacts failures", () => { expect(sql).toContain("r2b_deny_anon_authenticated_vendor_acquisition_runs"); expect(sql).toContain("failure_code"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_vendor_acquisition"); }); });
