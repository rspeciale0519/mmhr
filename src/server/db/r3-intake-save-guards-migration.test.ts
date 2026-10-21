import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0103_r3_intake_save_guards.sql", "utf8");

describe("intake save guard migration", () => {
  test("preserves the existing audited writer and closes its private entry point", () => {
    expect(sql).toContain("ALTER FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) SET SCHEMA mmhr_private");
    expect(sql).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_save_intake_impl(jsonb,uuid,uuid)");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(sql).toContain("RETURN mmhr_private.r3_save_intake_impl(payload,correlation_id,idempotency_key)");
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|DISABLE ROW LEVEL SECURITY/);
  });

  test("validates nested data and the PostgreSQL revision range", () => {
    expect(sql).toContain("pg_column_size(value) > 100000");
    expect(sql).toContain("jsonb_object_keys(field.value)) > 50");
    expect(sql).toContain("length(item.value #>> '{}') > 2000");
    expect(sql).toContain("WHEN field.key='stakeholders' THEN 100 ELSE 50");
    expect(sql).toContain("NOT BETWEEN 1 AND 200");
    expect(sql).toContain("(payload->>'expectedRevision')::numeric > 2147483646");
    expect(sql).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_intake_data_is_valid(jsonb)");
  });

  test("checks scope and serializes lifecycle validation without weakening authentication", () => {
    expect(sql).toContain("mmhr_private.r1_start_security_command(");
    expect(sql).toContain("IS DISTINCT FROM context.actor_identity_id");
    expect(sql).toContain("WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE");
    expect(sql).toContain("intake.status NOT IN ('draft','in_progress')");
    expect(sql).toContain("intake.status='in_progress' AND requested_status='draft'");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION mmhr_private.r1_security_actor");
  });

  test("requires applicable requirements for first submission but permits a no-write retry", () => {
    expect(sql.indexOf("r1_checked_receipt(")).toBeLessThan(sql.indexOf("IF receipt IS NULL AND"));
    expect(sql).toContain("v_intake_id IS NULL AND (expected_revision<>0 OR requested_status='submitted')");
    expect(sql).toContain("r.intake_id=intake.id AND r.organization_id=intake.organization_id");
    expect(sql).toContain("r.status='active' AND r.importance IN ('must','nice')");
  });
});
