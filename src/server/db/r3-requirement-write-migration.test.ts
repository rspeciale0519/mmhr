import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sql = readFileSync("drizzle/0105_0105_r3_requirement_commands.sql", "utf8");
test("protects requirement history from raw access and destructive changes", () => {
  expect(sql).toContain("ALTER TABLE public.intake_requirement_history ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.intake_requirement_history");
  expect(sql).toContain("BEFORE TRUNCATE ON public.intake_requirement_history");
  expect(sql).toContain("AFTER INSERT OR UPDATE ON public.intake_requirements");
  expect(sql).toContain("'legacy_backfill'");
  expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|DROP TABLE|DELETE FROM public/i);
});
test("retains audited AAL2 commands and checks parent lifecycle for new writes", () => {
  expect(sql.match(/r1_start_security_command\(/g)).toHaveLength(3);
  expect(sql.match(/r1_finish_security_command\(/g)).toHaveLength(2);
  expect(sql.match(/intake.status NOT IN \('draft','in_progress'\)/g)).toHaveLength(2);
  expect(sql.match(/r1_checked_receipt\(/g)).toHaveLength(3);
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION mmhr_private.r1_security_actor");
});
test("checks an exact authorized legacy update receipt before new-write validation", () => {
  const wrapper = sql.split("CREATE FUNCTION public.mmhr_update_intake_requirement")[1]!
    .split("CREATE FUNCTION public.mmhr_create_intake_requirement")[0]!;
  expect(wrapper.indexOf("r1_start_security_command(")).toBeLessThan(wrapper.indexOf("r1_checked_receipt("));
  expect(wrapper.indexOf("r1_checked_receipt(")).toBeLessThan(wrapper.indexOf("r3_requirement_payload_is_valid("));
  expect(wrapper).toContain("ir.id=(payload->>'requirementId')::uuid");
  expect(wrapper).toContain("IS DISTINCT FROM context.actor_identity_id");
});
test("keeps request metadata optional without changing existing receipt payloads", () => {
  const required = sql.match(/payload \?& ARRAY\[([\s\S]*?)\]/)?.[1];
  expect(required).toBeDefined();
  expect(required).not.toContain("'correlationId'");
  expect(required).not.toContain("'idempotencyKey'");
  expect(sql.match(/payload \? 'correlationId'/g)?.length).toBeGreaterThanOrEqual(2);
  expect(sql.match(/payload \? 'idempotencyKey'/g)?.length).toBeGreaterThanOrEqual(2);
});
test("rejects malformed bounds explicitly rather than hiding SQL errors", () => {
  expect(sql).not.toMatch(/EXCEPTION WHEN others/i);
  expect(sql).toContain("jsonb_typeof(payload->'expectedRevision')");
  expect(sql).toContain("jsonb_typeof(payload->'weight')");
  expect(sql).toContain("2147483646");
  expect(sql).toContain("depth > 5");
  expect(sql).toContain("pg_column_size(value) > 10000");
  expect(sql).toContain("jsonb_typeof(payload) <> 'object' THEN RETURN false; END IF;");
  expect(sql.indexOf("(payload->>'expectedRevision')::numeric > 2147483646"))
    .toBeLessThan(sql.indexOf("expected_revision := (payload->>'expectedRevision')::integer"));
});
