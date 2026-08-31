import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  throw new Error("R1 security integration environment is incomplete");
}

const owner = postgres(migrationUrl, { max: 1, prepare: true });
const applicationTables = [
  "admin_delegation_grants",
  "audit_events",
  "audit_log",
  "identities",
  "identity_admin_intents",
  "identity_recovery_approvals",
  "identity_recovery_presence",
  "identity_recovery_requests",
  "invitations",
  "leads",
  "org_members",
  "orgs",
  "permission_definitions",
  "platform_role_assignments",
  "portal_access_grants",
  "role_definitions",
  "role_permission_defaults",
  "security_bootstrap_state",
  "user_permission_overrides",
] as const;

describe("R1 local security boundary evidence", () => {
  afterAll(async () => {
    await owner.end();
  });

  test("every current application table has RLS, a policy, and no raw runtime read grant", async () => {
    const rows = await owner<{
      table_name: string;
      rls_enabled: boolean;
      policy_count: number;
      anon_select: boolean;
      authenticated_select: boolean;
    }[]>`
      SELECT c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        count(p.policyname)::integer AS policy_count,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies p
        ON p.schemaname = n.nspname AND p.tablename = c.relname
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = ANY(${applicationTables}::text[])
      GROUP BY c.relname, c.relrowsecurity
      ORDER BY c.relname
    `;

    expect(rows).toHaveLength(applicationTables.length);
    expect(rows.every((row) => row.rls_enabled)).toBe(true);
    expect(rows.every((row) => row.policy_count > 0)).toBe(true);
    expect(rows.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
  });

  test("exposes authorization only to the authenticated request boundary", async () => {
    const rows = await owner<{ role_name: string; can_execute: boolean }[]>`
      SELECT role_name,
        has_function_privilege(role_name, 'public.mmhr_authorize(text, uuid)', 'EXECUTE') AS can_execute
      FROM (VALUES ('anon'::name), ('authenticated'::name)) AS roles(role_name)
      ORDER BY role_name
    `;

    expect(rows).toEqual([
      { role_name: "anon", can_execute: false },
      { role_name: "authenticated", can_execute: true },
    ]);
  });
});
