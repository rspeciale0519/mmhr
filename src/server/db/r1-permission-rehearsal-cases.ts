import { readFile } from "node:fs/promises";
import { expect } from "vitest";

import {
  insertLegacyAuthUser,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import { anonymousPublicFunctions } from "./test/application-schema-inventory";

type ContainmentFunction = { name: string; signature: string; acl: string | null; authenticated_execute: boolean; anon_execute: boolean };
type ContainmentTable = { name: string; acl: string | null; rls: boolean; force_rls: boolean; column_acl: unknown; authenticated_access: boolean; anon_access: boolean };

async function containmentSnapshot(client: Pick<RehearsalContext["client"], "unsafe">) {
  const functions = await client.unsafe<ContainmentFunction[]>(`
    SELECT procedure.proname AS name, pg_get_function_identity_arguments(procedure.oid) AS signature,
      procedure.proacl::text AS acl,
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('anon', procedure.oid, 'EXECUTE') AS anon_execute
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public' AND procedure.proname LIKE 'mmhr_%'
    ORDER BY procedure.proname, signature
  `);
  const tables = await client.unsafe<ContainmentTable[]>(`
    SELECT relation.relname AS name, relation.relacl::text AS acl,
      relation.relrowsecurity AS rls, relation.relforcerowsecurity AS force_rls,
      coalesce((SELECT jsonb_object_agg(attribute.attname, attribute.attacl::text)
        FROM pg_attribute attribute WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND attribute.attacl IS NOT NULL), '{}'::jsonb) AS column_acl,
      (has_table_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) AS authenticated_access,
      (has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) AS anon_access
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p') ORDER BY relation.relname
  `);
  return { functions: [...functions], tables: [...tables] };
}

export async function verifyEmergencyContainment(context: RehearsalContext, expectedTables: readonly string[]) {
  const script = await readFile(new URL("../../../docs/security/r1-emergency-revocation.sql", import.meta.url), "utf8");
  const before = await containmentSnapshot(context.client);
  expect(before.functions.length).toBeGreaterThan(0);
  expect(before.functions.some((row) => row.authenticated_execute)).toBe(true);
  expect(
    before.functions
      .filter((row) => row.anon_execute)
      .map(({ name, signature }) => ({ name, signature })),
  ).toEqual(anonymousPublicFunctions);
  expect(before.tables.map((row) => row.name)).toEqual(expectedTables);
  expect(before.tables.every((row) => row.rls && !row.authenticated_access && !row.anon_access)).toBe(true);

  const rollback = Symbol("restore emergency containment grants");
  try {
    await context.client.begin(async (transaction) => {
      await transaction.unsafe(script);
      const contained = await containmentSnapshot(transaction);
      expect(contained.functions.map((row) => row.name)).toEqual(before.functions.map((row) => row.name));
      expect(contained.functions.every((row) => !row.authenticated_execute && !row.anon_execute)).toBe(true);
      expect(contained.tables).toEqual(before.tables);
      const probes = [
        "SELECT * FROM public.mmhr_authorize('workspace.access', NULL)",
        "SELECT * FROM public.mmhr_get_audit_events(NULL)",
        "SELECT * FROM public.mmhr_get_my_identity()",
        "SELECT * FROM public.mmhr_get_my_memberships()",
        "SELECT * FROM public.mmhr_get_organization(NULL)",
        "SELECT * FROM public.mmhr_get_organization_members(NULL)",
        ...expectedTables.map((name) => `SELECT * FROM public."${name.replaceAll('"', '""')}" LIMIT 0`),
      ];
      for (const statement of probes) {
        let assumedRole = false;
        await expect(transaction.savepoint(async (probe) => {
          await probe`SET LOCAL ROLE authenticated`;
          const [role] = await probe<{ role: string }[]>`SELECT current_user AS role`;
          expect(role!.role).toBe("authenticated");
          assumedRole = true;
          await probe.unsafe(statement);
        })).rejects.toMatchObject({ code: "42501" });
        expect(assumedRole).toBe(true);
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    // Compare actual ACL values, not just equivalent effective privileges.
    expect(await containmentSnapshot(context.client)).toEqual(before);
  }
}

export async function verifyRegistrySynchronization(context: RehearsalContext) {
  const [before] = await context.client<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM public.audit_events
  `;
  const [sync] = await context.client<{ inserted: number }[]>`
    SELECT mmhr_private.r1_sync_permission_registry() AS inserted
  `;
  expect(sync!.inserted).toBe(0);
  const [after] = await context.client<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM public.audit_events
  `;
  expect(after!.count).toBe(before!.count);

  // The failed synchronization rolls back the fixture drift. It must not
  // silently restore or lower live policy under a maintenance command.
  await expect(context.client.begin(async (transaction) => {
    await transaction`
      UPDATE public.permission_definitions
      SET minimum_assurance = 'aal1' WHERE key = 'admin.access'
    `;
    await transaction`SELECT mmhr_private.r1_sync_permission_registry()`;
  })).rejects.toThrow(/differs from the reviewed definitions/);
  const [permission] = await context.client<{ minimum_assurance: string }[]>`
    SELECT minimum_assurance FROM public.permission_definitions WHERE key = 'admin.access'
  `;
  expect(permission!.minimum_assurance).toBe("aal2");
}

export async function verifyRoleApprovalSerialization(context: RehearsalContext) {
  const [role] = await context.client<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    VALUES ('serialization_fixture', 1, 'platform', 'Serialization fixture')
    RETURNING id
  `;
  let releaseDefault: () => void = () => {};
  let reportDefault: () => void = () => {};
  let rejectDefault: (error: unknown) => void = () => {};
  const release = new Promise<void>((resolve) => { releaseDefault = resolve; });
  const written = new Promise<void>((resolve, reject) => {
    reportDefault = resolve;
    rejectDefault = reject;
  });

  const defaultChange = context.client.begin(async (transaction) => {
    await transaction`
      INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
      VALUES (${role!.id}, 'workspace.access', 'allow')
    `;
    reportDefault();
    await release;
  });
  void defaultChange.catch(rejectDefault);

  try {
    await written;
    await expect(context.client.begin(async (transaction) => {
      await transaction`SET LOCAL lock_timeout = '250ms'`;
      await transaction`
        UPDATE public.role_definitions
        SET state = 'approved', approved_at = now()
        WHERE id = ${role!.id}
      `;
    })).rejects.toThrow(/lock timeout/);
  } finally {
    releaseDefault();
    await defaultChange;
  }

  await context.client`
    UPDATE public.role_definitions SET state = 'approved', approved_at = now()
    WHERE id = ${role!.id}
  `;
  await expect(context.client`
    INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    VALUES (${role!.id}, 'admin.access', 'allow')
  `).rejects.toThrow(/draft role/);
}

export async function verifyRoleDefaultPrecedence(context: RehearsalContext) {
  const userId = await insertLegacyAuthUser(context, "role-default-fixture@example.com");
  const [identity] = await context.client<{ id: string }[]>`
    INSERT INTO public.identities (auth_user_id, normalized_email, email_verified_at, status, activated_at, migration_review_required)
    VALUES (${userId}, 'role-default-fixture@example.com', now(), 'active', now(), false)
    RETURNING id
  `;
  const [issuer] = await context.client<{ id: string }[]>`
    INSERT INTO public.identities DEFAULT VALUES RETURNING id
  `;
  const [organization] = await context.client<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Permission fixture', 'internal', 'active', now(), false)
    RETURNING id
  `;
  await context.client`
    INSERT INTO public.org_members (org_id, identity_id, user_id, role, role_key, migration_review_required)
    VALUES (${organization!.id}, ${identity!.id}, ${userId}, 'viewer', 'viewer', false)
  `;
  const [role] = await context.client<{ id: string }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    VALUES ('default_deny_fixture', 1, 'platform', 'Default deny fixture')
    RETURNING id
  `;
  await context.client`
    INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    VALUES (${role!.id}, 'workspace.access', 'deny')
  `;
  await context.client`
    UPDATE public.role_definitions SET state = 'approved', approved_at = now()
    WHERE id = ${role!.id}
  `;
  await context.client`
    UPDATE public.role_definitions SET state = 'active', activated_at = now()
    WHERE id = ${role!.id}
  `;
  const [assignment] = await context.client<{ id: string; assigned_at: string }[]>`
    INSERT INTO public.platform_role_assignments (identity_id, role_key, assignment_reason)
    VALUES (${identity!.id}, 'default_deny_fixture', 'Isolated role precedence test')
    RETURNING id, assigned_at
  `;
  await context.client`
    INSERT INTO public.role_authority_records
      (record_kind, authority_kind, platform_assignment_id, role_definition_id, correlation_id, created_at)
    VALUES ('platform_assignment', 'reviewed_owner', ${assignment!.id}, ${role!.id}, gen_random_uuid(), ${assignment!.assigned_at}::timestamptz)
  `;
  await context.client`
    INSERT INTO public.role_authority_records
      (record_kind, authority_kind, role_definition_id, activated_at, correlation_id, created_at)
    SELECT 'role_activation', 'reviewed_owner', id, activated_at, gen_random_uuid(), activated_at
    FROM public.role_definitions WHERE id = ${role!.id}
  `;

  const allowed = async () => {
    const [result] = await context.client<{ allowed: boolean }[]>`
      SELECT mmhr_private.r1_has_permission_for_identity(
        ${identity!.id}, 'workspace.access', ${organization!.id}, 'aal1', clock_timestamp()
      ) AS allowed
    `;
    return result!.allowed;
  };
  expect(await allowed()).toBe(false);
  await context.client`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, organization_id, scope_key,
      effect, issued_by_identity_id, issue_reason
    ) VALUES (
      ${identity!.id}, 'workspace.access', 'organization', ${organization!.id},
      ${`organization:${organization!.id}`}, 'allow', ${issuer!.id}, 'Isolated override test'
    )
  `;
  expect(await allowed()).toBe(true);
  await context.client`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, scope_key,
      effect, issued_by_identity_id, issue_reason
    ) VALUES (
      ${identity!.id}, 'workspace.access', 'platform', 'platform',
      'deny', ${issuer!.id}, 'Isolated cross-scope deny test'
    )
  `;
  expect(await allowed()).toBe(false);
}

async function internalOrganizationFixture(context: RehearsalContext, suffix: string) {
  const email = `scope-${suffix}@example.com`;
  const userId = await insertLegacyAuthUser(context, email);
  const [identity] = await context.client<{ id: string }[]>`
    INSERT INTO public.identities (auth_user_id, normalized_email, email_verified_at, status, activated_at, migration_review_required)
    VALUES (${userId}, ${email}, now(), 'active', now(), false) RETURNING id
  `;
  await context.client`
    INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    VALUES (gen_random_uuid(), ${userId}, 'totp', 'verified', now(), now())
  `;
  const [issuer] = await context.client<{ id: string }[]>`
    INSERT INTO public.identities DEFAULT VALUES RETURNING id
  `;
  const [organization] = await context.client<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Scope fixture', 'customer', 'active', now(), false) RETURNING id
  `;
  await context.client`
    INSERT INTO public.org_members (org_id, identity_id, user_id, role, role_key, migration_review_required)
    VALUES (${organization!.id}, ${identity!.id}, ${userId}, 'viewer', 'viewer', false)
  `;
  const [assignment] = await context.client<{ id: string; assigned_at: string }[]>`
    INSERT INTO public.platform_role_assignments (identity_id, role_key, assignment_reason)
    VALUES (${identity!.id}, 'super_admin', 'Isolated scope test') RETURNING id, assigned_at
  `;
  await context.client`
    INSERT INTO public.role_authority_records
      (record_kind, authority_kind, platform_assignment_id, role_definition_id, correlation_id, created_at)
    SELECT 'platform_assignment', 'reviewed_owner', ${assignment!.id}, r.id, gen_random_uuid(), ${assignment!.assigned_at}::timestamptz
    FROM public.role_definitions r WHERE r.stable_key = 'super_admin' AND r.kind = 'platform' AND r.state = 'active'
  `;
  return { identityId: identity!.id, issuerId: issuer!.id,
    organizationId: organization!.id, assignmentId: assignment!.id };
}

export async function verifyInternalScopeContinuity(context: RehearsalContext) {
  const fixture = await internalOrganizationFixture(context, "revocation");
  const allowed = async () => {
    const [result] = await context.client<{ allowed: boolean }[]>`
      SELECT mmhr_private.r1_has_permission_for_identity(
        ${fixture.identityId}, 'org.name.read', ${fixture.organizationId}, 'aal2', clock_timestamp()
      ) AS allowed
    `;
    return result!.allowed;
  };
  expect(await allowed()).toBe(false);
  await context.client`
    UPDATE public.platform_role_assignments
    SET state = 'revoked', revoked_at = now(), revocation_reason = 'Isolated revocation test'
    WHERE id = ${fixture.assignmentId}
  `;
  expect(await allowed()).toBe(false);
}

export async function verifyWorkspaceDefinitionGate(context: RehearsalContext) {
  const fixture = await internalOrganizationFixture(context, "workspace");
  await context.client`
    INSERT INTO public.user_permission_overrides (
      identity_id, permission_key, scope_kind, organization_id, scope_key,
      effect, issued_by_identity_id, issue_reason
    ) VALUES (
      ${fixture.identityId}, 'workspace.access', 'organization', ${fixture.organizationId},
      ${`organization:${fixture.organizationId}`}, 'allow', ${fixture.issuerId}, 'Isolated workspace test'
    )
  `;
  const rollback = Symbol("restore workspace fixture");
  try {
    await context.client.begin(async (transaction) => {
      const [before] = await transaction<{ allowed: boolean }[]>`
        SELECT mmhr_private.r1_has_permission_for_identity(
          ${fixture.identityId}, 'org.members.view', ${fixture.organizationId}, 'aal2', clock_timestamp()
        ) AS allowed
      `;
      expect(before!.allowed).toBe(true);
      await transaction`
        UPDATE public.permission_definitions SET active = false, retired_at = now()
        WHERE key = 'workspace.access'
      `;
      const [after] = await transaction<{ allowed: boolean }[]>`
        SELECT mmhr_private.r1_has_permission_for_identity(
          ${fixture.identityId}, 'org.members.view', ${fixture.organizationId}, 'aal2', clock_timestamp()
        ) AS allowed
      `;
      expect(after!.allowed).toBe(false);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
