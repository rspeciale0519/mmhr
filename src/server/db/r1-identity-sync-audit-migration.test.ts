import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const original = readFileSync("drizzle/0101_r1_customer_registration.sql", "utf8").split(
  "CREATE FUNCTION public.mmhr_sync_my_identity",
)[1]!;
const migration = readFileSync("drizzle/0107_r1_identity_sync_audit.sql", "utf8");

test("keeps the existing caller, session and identity restrictions unchanged", () => {
  const guardSection = (sql: string) => sql.slice(sql.indexOf("  checked_at :="), sql.indexOf("  input :="));
  expect(guardSection(migration)).toBe(guardSection(original));
  expect(migration).toContain("SET search_path = ''");
  expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_sync_my_identity(uuid) FROM PUBLIC, anon, service_role, mmhr_worker");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_sync_my_identity(uuid) TO authenticated");
});

test("fixes the writer without widening audit summaries or changing stored history", () => {
  const write = migration.slice(migration.indexOf("  INSERT INTO public.audit_events"), migration.indexOf("  RETURN jsonb_build_object(\n    'identityId'"));
  expect(write).toContain("jsonb_build_object('status',actor.status)");
  expect(write).not.toMatch(/jsonb_build_object\('identityId'|'outcome'|'correlationId'/);
  expect(write.match(/'identity\.synchronize\.' \|\| outcome/g)).toHaveLength(2);
  expect(migration).not.toMatch(/ALTER TABLE|DROP |DISABLE |UPDATE public\.audit_events|DELETE FROM/);
  expect(migration).not.toContain("FUNCTION mmhr_private.r1_audit_summary_is_safe");
});

test("reconstructs the original result only from matching immutable evidence", () => {
  expect(migration).toContain("r1_checked_receipt(actor.id,'identity.synchronize',correlation_id,input)");
  expect(migration).toContain("event.actor_identity_id=actor.id AND event.command='identity.synchronize'");
  expect(migration).toContain("event.correlation_id=mmhr_sync_my_identity.correlation_id");
  expect(migration).toContain("replay_action IS DISTINCT FROM replay->>'action'");
  for (const outcome of ["created", "unchanged", "synchronized"]) {
    expect(migration).toContain(`WHEN 'identity.synchronize.${outcome}' THEN '${outcome}'`);
  }
  expect(migration).toContain("coalesce(replay_summary->>'status','') NOT IN ('pending','active')");
  expect(migration).toContain("'outcome',outcome,'correlationId',correlation_id");
});
