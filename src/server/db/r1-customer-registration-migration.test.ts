import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0101_r1_customer_registration.sql", "utf8");
describe("customer registration migration boundary", () => {
  test("creates only the registration table and preserves deny-first data access", () => {
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(1);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("USING (false) WITH CHECK (false)");
    expect(sql).not.toMatch(/DROP TABLE|DISABLE ROW LEVEL SECURITY/);
  });
  test("preserves serialized security writes and immutable command evidence", () => {
    expect(sql.indexOf("checked_at := mmhr_private.r1_lock_security()")).toBeLessThan(sql.indexOf("SELECT * INTO provider"));
    expect(sql).toContain("FOR UPDATE;");
    expect(sql).toContain("mmhr_private.r1_finish_security_command");
    expect(sql).toContain("bootstrap.second_target_identity_id IS NULL");
    expect(sql).toContain("m.role_key = 'organization_admin'");
    expect(sql).toContain("AND (m.identity_id<>c.identity_id OR m.role_key<>'contributor')");
  });
  test("has no caller-controlled authority or organization selection", () => {
    const setupSql = sql.slice(sql.indexOf("CREATE FUNCTION public.mmhr_start_customer_workspace"), sql.indexOf("CREATE FUNCTION public.mmhr_sync_my_identity"));
    expect(setupSql).toContain("IF auth.uid() IS NULL");
    expect(setupSql).toContain("lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)");
    expect(sql).toContain("mmhr_start_customer_workspace(correlation_id uuid)");
    expect(sql).toContain("WHERE i.auth_user_id=provider.id");
    expect(sql).toContain("actor.authorization_not_before IS NOT NULL");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_start_customer_workspace(uuid) TO authenticated");
  });
  test("keeps identity synchronization caller-bound and audit-backed", () => {
    const syncSql = sql.slice(sql.indexOf("CREATE FUNCTION public.mmhr_sync_my_identity"));
    expect(syncSql).toContain("CREATE FUNCTION public.mmhr_sync_my_identity(correlation_id uuid)");
    expect(syncSql).toContain("lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)");
    expect(syncSql).toContain("SELECT * INTO provider FROM auth.users u");
    expect(syncSql).toContain("FOR UPDATE;");
    expect(syncSql).toContain("actor.migration_review_required");
    expect(syncSql).toContain("INSERT INTO public.audit_events");
    expect(syncSql).toContain("security_command_receipts");
    expect(syncSql).toContain("identity.synchronize");
    expect(syncSql).not.toContain("r1_finish_security_command");
    expect(syncSql).toContain("REVOKE ALL ON FUNCTION public.mmhr_sync_my_identity(uuid) FROM PUBLIC, anon, service_role, mmhr_worker");
    expect(syncSql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_sync_my_identity(uuid) TO authenticated");
    expect(syncSql).not.toContain("organization_id");
    expect(syncSql).not.toContain("org_members");
  });
});
