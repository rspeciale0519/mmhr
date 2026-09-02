import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0029_r2b_crm_exports.sql", "utf8");

describe("R2B CRM export migration review", () => {
  test("creates scoped request and decision records", () => {
    expect(migration).toContain("CREATE TABLE public.crm_export_requests");
    expect(migration).toContain("CREATE TABLE public.crm_export_decisions");
    expect(migration).toContain("crm_export_decisions_export_uq");
    expect(migration).toContain("crm_export_decisions_export_fk");
  });

  test("uses fixed security-definer commands and lifecycle helpers", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_create_crm_export_request");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_decide_crm_export");
    expect(migration).toContain("r1_start_security_command");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
  });

  test("enforces explicit approval and prevents self-approval", () => {
    expect(migration).toContain("'audit.export'");
    expect(migration).toContain("request.requested_by_identity_id = reviewer_id");
    expect(migration).toContain("request.state <> 'pending'");
  });

  test("denies raw table access and exposes only authenticated commands", () => {
    expect(migration).toContain("crm_export_requests_deny_all");
    expect(migration).toContain("crm_export_decisions_deny_all");
    expect(migration).toContain("REVOKE ALL ON TABLE public.crm_export_requests, public.crm_export_decisions");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_create_crm_export_request(jsonb,uuid,uuid),");
  });
});
