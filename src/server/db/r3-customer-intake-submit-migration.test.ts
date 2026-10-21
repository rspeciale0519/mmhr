import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const sql = readFileSync("drizzle/0110_r3_customer_intake_submit.sql", "utf8");
const rpc = sql.slice(sql.indexOf("CREATE FUNCTION public.mmhr_submit_customer_intake"));

test("adds only the explicit customer submission action to new immutable role bundles", () => {
  expect(sql).toContain("('intake.submit', 'action', 'Submit saved intake answers in an authorized customer portal.', false, true, 'aal1', false, 'customer')");
  for (const role of ["('super_admin'::text, 6)", "('organization_admin'::text, 4)", "('contributor'::text, 4)"]) expect(sql).toContain(role);
  expect(sql).toContain("VALUES (next_role.id, 'intake.submit', 'allow')");
  expect(sql).toContain("WHERE d.role_definition_id = prior.id");
  expect(sql).toContain("prior_authority_id");
  expect(sql).not.toMatch(/DROP TABLE|DISABLE ROW LEVEL SECURITY|DELETE FROM/);
});

test("checks exact payload bounds and current actor authority before replay", () => {
  expect(rpc).toContain("k.key NOT IN ('intakeId','organizationId','expectedRevision')");
  expect(rpc).toContain("NOT BETWEEN 1 AND 2147483646");
  const lock = rpc.indexOf("checked_at := mmhr_private.r1_lock_security()");
  const authority = rpc.indexOf("r1_evaluate_permission(actor.id,'intake.submit'");
  const receipt = rpc.indexOf("receipt := mmhr_private.r1_checked_receipt");
  expect(lock).toBeGreaterThan(0);
  expect(authority).toBeGreaterThan(lock);
  expect(receipt).toBeGreaterThan(authority);
  for (const check of ["r1_request_identity_id() IS DISTINCT FROM actor.id", "r1_session_is_aal2", "auth.sessions", "email_confirmed_at IS NOT NULL", "'portal.customer.access'"]) expect(rpc).toContain(check);
  expect(rpc).not.toContain("actorIdentityId");
});

test("submits saved answers with applicable requirements without accepting replacement data", () => {
  expect(rpc).toContain("intake.revision<>expected_revision");
  expect(rpc).toContain("intake.status NOT IN ('draft','in_progress')");
  expect(rpc).toContain("r.status='active' AND r.importance IN ('must','nice')");
  expect(rpc).toContain("status='submitted', submitted_at=checked_at");
  expect(rpc).not.toContain("payload->'data'");
  expect(rpc).not.toContain("SET company_context");
});

test("preserves ordered immutable revision references and legacy evidence atomically", () => {
  expect(rpc).toContain("'requirementId',r.id,'revision',r.revision) ORDER BY r.id");
  expect(rpc).toContain("pg_column_size(submission_snapshot)>100000");
  expect(rpc).toContain("NULL,NULL,checked_at,'legacy_backfill',r.correlation_id");
  expect(rpc).toContain("mmhr_private.r3_requirement_snapshot(r)");
  expect(rpc).toContain("INSERT INTO public.intake_history");
  expect(rpc).toContain("r1_finish_security_command");
  expect(rpc).toContain("jsonb_build_object('version',1),jsonb_build_object('version',1),checked_at");
  expect(rpc).not.toContain("EXCEPTION WHEN");
});

test("keeps runtime grants narrow and generated migration metadata present", () => {
  expect(rpc).toContain("SECURITY DEFINER SET search_path = ''");
  expect(rpc).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(rpc).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_submit_customer_intake(jsonb,uuid,uuid) TO authenticated");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  expect(journal.entries).toContainEqual(expect.objectContaining({ idx: 110, tag: "0110_r3_customer_intake_submit" }));
});
