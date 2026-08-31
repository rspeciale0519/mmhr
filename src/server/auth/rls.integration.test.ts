import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

import { enrollTestTotp } from "./permission-test-fixtures";

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;

if (!apiUrl || !anonKey || !serviceRoleKey || !migrationUrl) {
  throw new Error("R1.3 integration environment is incomplete");
}

const parsedApiUrl = new URL(apiUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedApiUrl.hostname) ||
  parsedApiUrl.port !== "56321"
) {
  throw new Error("R1.3 integration tests require the local MMHR API");
}

const owner = postgres(migrationUrl, { max: 2, prepare: true });
const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
let viewerUserId = "";
let identityId = "";
let viewerIdentityId = "";
let organizationId = "";
let otherOrganizationId = "";
let adminEmail = "";
let viewerEmail = "";
let adminMfaClient: SupabaseClient;
let viewerMfaClient: SupabaseClient;

async function createConfirmedUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "r1-3-integration-password",
    email_confirm: true,
  });
  expect(error).toBeNull();
  if (!data.user) throw new Error("Auth fixture creation failed");
  return data.user;
}

async function signIn(userEmail: string): Promise<SupabaseClient> {
  const client = createClient(apiUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: userEmail,
    password: "r1-3-integration-password",
  });
  expect(error).toBeNull();
  return client;
}

describe("R1.3 request-scoped grants and RLS", () => {
  beforeAll(async () => {
    adminEmail = `r13-admin-${Date.now()}@example.com`;
    viewerEmail = `r13-viewer-${Date.now()}@example.com`;
    const user = await createConfirmedUser(adminEmail);
    userId = user.id;
    const viewer = await createConfirmedUser(viewerEmail);
    viewerUserId = viewer.id;

    const [identity] = await owner`
      INSERT INTO public.identities
        (auth_user_id, normalized_email, email_verified_at, status, activated_at, migration_review_required)
      VALUES
        (${user.id}, ${user.email!.toLowerCase()}, now(), 'active', now(), false)
      RETURNING id
    `;
    identityId = identity!.id;
    const [viewerIdentity] = await owner`
      INSERT INTO public.identities
        (auth_user_id, normalized_email, email_verified_at, status, activated_at, migration_review_required)
      VALUES
        (${viewer.id}, ${viewer.email!.toLowerCase()}, now(), 'active', now(), false)
      RETURNING id
    `;
    viewerIdentityId = viewerIdentity!.id;

    const [organization] = await owner`
      INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
      VALUES ('R1.3 customer', 'customer', 'active', now(), false)
      RETURNING id
    `;
    organizationId = organization!.id;
    const [otherOrganization] = await owner`
      INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
      VALUES ('R1.3 other', 'vendor', 'active', now(), false)
      RETURNING id
    `;
    otherOrganizationId = otherOrganization!.id;

    await owner`
      INSERT INTO public.org_members
        (org_id, identity_id, user_id, role, role_key, status, activated_at, migration_review_required)
      VALUES
        (${organizationId}, ${identityId}, ${userId}, 'admin', 'organization_admin', 'active', now(), false),
        (${organizationId}, ${viewerIdentityId}, ${viewerUserId}, 'viewer', 'viewer', 'active', now(), false)
    `;
    adminMfaClient = await signIn(adminEmail);
    await enrollTestTotp(adminMfaClient);
    viewerMfaClient = await signIn(viewerEmail);
    await enrollTestTotp(viewerMfaClient);
  }, 60_000);

  afterAll(async () => {
    const organizationIds = [organizationId, otherOrganizationId].filter(Boolean);
    const identityIds = [identityId, viewerIdentityId].filter(Boolean);
    const failures: string[] = [];
    async function attempt(label: string, action: () => Promise<unknown>) {
      try { await action(); } catch { failures.push(label); }
    }
    await attempt("memberships", async () => {
      if (organizationIds.length) await owner`DELETE FROM public.org_members WHERE org_id = ANY(${organizationIds}::uuid[])`;
    });
    await attempt("organizations", async () => {
      if (organizationIds.length) await owner`DELETE FROM public.orgs WHERE id = ANY(${organizationIds}::uuid[])`;
    });
    await attempt("identities", async () => {
      if (identityIds.length) await owner`DELETE FROM public.identities WHERE id = ANY(${identityIds}::uuid[])`;
    });
    for (const id of [userId, viewerUserId].filter(Boolean)) {
      await attempt("Auth user", async () => {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error) throw new Error("RLS Auth fixture cleanup failed");
      });
    }
    await attempt("owner connection", () => owner.end({ timeout: 5 }));
    if (failures.length) throw new Error(`RLS fixture cleanup failed: ${failures.join(", ")}`);
  });

  test("anonymous clients cannot read tables or fixed functions", async () => {
    const anonymous = createClient(apiUrl!, anonKey!);
    const tableRead = await anonymous.from("orgs").select("id");
    expect(tableRead.error).not.toBeNull();

    const functionRead = await anonymous.rpc("mmhr_get_my_memberships");
    expect(functionRead.error).not.toBeNull();
    const authorization = await anonymous.rpc("mmhr_authorize", {
      permission_key: "workspace.access",
    });
    expect(authorization.error).not.toBeNull();
  });

  test("active members receive only fixed, field-safe organization data", async () => {
    const member = await signIn(adminEmail);
    const identity = await member.rpc("mmhr_get_my_identity");
    expect(identity.error).toBeNull();
    expect(identity.data).toEqual([
      expect.objectContaining({ id: identityId, status: "active" }),
    ]);

    const organization = await member.rpc("mmhr_get_organization", {
      organization_id: organizationId,
    });
    expect(organization.error).toBeNull();
    expect(organization.data).toEqual([
      { id: organizationId, name: "R1.3 customer", type: "customer", status: "active" },
    ]);

    const memberships = await member.rpc("mmhr_get_my_memberships");
    expect(memberships.error).toBeNull();
    expect(memberships.data).toHaveLength(1);
    expect(memberships.data[0]).not.toHaveProperty("created_at");

    const audit = await member.rpc("mmhr_get_audit_events", {
      organization_id: organizationId,
    });
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([]);
  });

  test("cross-organization and forged identifiers return no rows", async () => {
    const member = await signIn(adminEmail);
    const crossOrg = await member.rpc("mmhr_get_organization", {
      organization_id: otherOrganizationId,
    });
    expect(crossOrg.error).toBeNull();
    expect(crossOrg.data).toEqual([]);

    const forged = await member.rpc("mmhr_get_organization", {
      organization_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(forged.error).toBeNull();
    expect(forged.data).toEqual([]);

    const raw = await member.from("orgs").select("*").eq("id", organizationId);
    expect(raw.error).not.toBeNull();
  });

  test("raw table operations fail closed for every request method", async () => {
    const member = await signIn(adminEmail);
    const table = member.from("orgs");
    const select = await table.select("id").eq("id", organizationId);
    const count = await table.select("id", { count: "exact", head: true });
    const insert = await table.insert({ name: "must not be inserted" });
    const update = await table.update({ name: "must not be updated" }).eq("id", organizationId);
    const remove = await table.delete().eq("id", organizationId);
    expect(select.error).not.toBeNull();
    expect(count.error).not.toBeNull();
    expect(insert.error).not.toBeNull();
    expect(update.error).not.toBeNull();
    expect(remove.error).not.toBeNull();
  });

  test("organization admins require AAL2 for member roles, viewers remain denied", async () => {
    const adminClient = await signIn(adminEmail);
    const lowAssurance = await adminClient.rpc("mmhr_get_organization_members", {
      organization_id: organizationId,
    });
    expect(lowAssurance.error).toBeNull();
    expect(lowAssurance.data).toEqual([]);

    const members = await adminMfaClient.rpc("mmhr_get_organization_members", {
      organization_id: organizationId,
    });
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(2);

    const viewerClient = await signIn(viewerEmail);
    const denied = await viewerClient.rpc("mmhr_get_organization_members", {
      organization_id: organizationId,
    });
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
    const elevatedDenied = await viewerMfaClient.rpc("mmhr_get_organization_members", {
      organization_id: organizationId,
    });
    expect(elevatedDenied.error).toBeNull();
    expect(elevatedDenied.data).toEqual([]);
  });

  test("suspending the identity revokes an old active token", async () => {
    const member = await signIn(adminEmail);
    await owner`
      UPDATE public.identities
      SET status = 'suspended', suspended_at = now()
      WHERE id = ${identityId}
    `;
    const denied = await member.rpc("mmhr_get_my_memberships");
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
    await owner`
      UPDATE public.identities
      SET status = 'active', suspended_at = null
      WHERE id = ${identityId}
    `;
  });

  test("every current application table has an explicit deny policy", async () => {
    const rows = await owner<{ table_name: string; policy_count: number }[]>`
      SELECT c.relname AS table_name, count(p.policyname)::integer AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN (
          'audit_events', 'audit_log', 'identity_admin_intents',
          'identity_recovery_approvals', 'identity_recovery_presence',
          'identity_recovery_requests', 'security_bootstrap_state', 'identities',
          'invitations', 'org_members', 'orgs', 'leads', 'admin_delegation_grants',
          'permission_definitions', 'platform_role_assignments', 'portal_access_grants',
          'role_definitions', 'role_permission_defaults', 'user_permission_overrides',
          'customer_profiles', 'vendor_profiles', 'products', 'contacts', 'relationships'
        )
      GROUP BY c.relname
      ORDER BY c.relname
    `;
    expect(rows).toHaveLength(24);
    expect(rows.every((row) => row.policy_count >= 1)).toBe(true);
  });

  test("anonymous and authenticated roles have no raw table grants", async () => {
    const rows = await owner<{ role_name: string; table_name: string; can_select: boolean }[]>`
      SELECT role_name, table_name,
        has_table_privilege(role_name, 'public.' || table_name, 'SELECT') AS can_select
      FROM (VALUES ('anon'::name), ('authenticated'::name)) AS roles(role_name)
      CROSS JOIN (VALUES ('orgs'::text), ('identities'::text), ('org_members'::text), ('leads'::text)) AS tables(table_name)
      ORDER BY role_name, table_name
    `;
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => !row.can_select)).toBe(true);

    const functions = await owner<{ role_name: string; can_execute: boolean }[]>`
      SELECT role_name,
        has_function_privilege(role_name, 'public.mmhr_get_organization(uuid)', 'EXECUTE') AS can_execute
      FROM (VALUES ('anon'::name), ('authenticated'::name)) AS roles(role_name)
      ORDER BY role_name
    `;
    expect(functions).toEqual([
      { role_name: "anon", can_execute: false },
      { role_name: "authenticated", can_execute: true },
    ]);
  });

  test("fixed functions are security definer functions with an empty search path", async () => {
    const functions = await owner<{
      proname: string;
      security_definer: boolean;
      configuration: string;
    }[]>`
      SELECT p.proname, p.prosecdef AS security_definer,
        coalesce(array_to_string(p.proconfig, ','), '') AS configuration
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'mmhr_%'
      ORDER BY p.proname
    `;
    expect(functions).toHaveLength(6);
    expect(functions.map((fn) => fn.proname)).toEqual([
      "mmhr_authorize",
      "mmhr_get_audit_events",
      "mmhr_get_my_identity",
      "mmhr_get_my_memberships",
      "mmhr_get_organization",
      "mmhr_get_organization_members",
    ]);
    expect(functions.every((fn) => fn.security_definer)).toBe(true);
    expect(functions.every((fn) => fn.configuration.includes("search_path="))).toBe(true);
  });
});
