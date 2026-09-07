import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const sql = readFileSync(path.join(process.cwd(), "drizzle", "0078_r8_follow_up_schedules.sql"), "utf8");
describe("R8 follow-up schedule migration", () => {
  test("defines scoped schedule storage and deny-first RLS", () => {
    expect(sql).toContain("CREATE TABLE public.follow_up_schedules");
    expect(sql).toContain("organization_id uuid NOT NULL REFERENCES public.orgs");
    expect(sql).toContain("subject_type IN ('vendor','customer','product','risk')");
    expect(sql).toContain("CREATE UNIQUE INDEX follow_up_schedules_scope_subject_uq");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("USING (false) WITH CHECK (false)");
  });
  test("defines audited command and raw table denial", () => {
    expect(sql).toContain("mmhr_record_follow_up_schedule");
    expect(sql).toContain("r1_start_security_command");
    expect(sql).toContain("r1_finish_security_command");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_follow_up_schedule");
    expect(sql).toContain("REVOKE ALL ON TABLE public.follow_up_schedules");
  });
});
