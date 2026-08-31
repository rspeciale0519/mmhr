import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";
import {
  verifyEmergencyContainment,
  verifyInternalScopeContinuity,
  verifyRegistrySynchronization,
  verifyRoleApprovalSerialization,
  verifyRoleDefaultPrecedence,
  verifyWorkspaceDefinitionGate,
} from "./r1-permission-rehearsal-cases";

const expectedTables = [
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
];

describe("R1.4 empty database migration", () => {
  let context: RehearsalContext | undefined;

  beforeAll(async () => {
    context = await startRehearsal("empty");
    await applyAllMigrations(context);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates the exact public table set with RLS enabled", async () => {
    const tables = await context!.client<
      { tablename: string; rowsecurity: boolean }[]
    >`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    expect(tables.map((table) => table.tablename)).toEqual(expectedTables);
    expect(tables.every((table) => table.rowsecurity)).toBe(true);
  });

  test("creates only the approved active role definitions", async () => {
    const roles = await context!.client<
      { stable_key: string; version: number; kind: string; state: string }[]
    >`
      SELECT stable_key, version, kind, state
      FROM role_definitions
      WHERE state = 'active'
      ORDER BY stable_key
    `;

    expect(roles).toEqual([
      { stable_key: "admin", version: 2, kind: "platform", state: "active" },
      {
        stable_key: "contributor",
        version: 2,
        kind: "organization",
        state: "active",
      },
      {
        stable_key: "organization_admin",
        version: 2,
        kind: "organization",
        state: "active",
      },
      { stable_key: "staff", version: 2, kind: "platform", state: "active" },
      {
        stable_key: "super_admin",
        version: 2,
        kind: "platform",
        state: "active",
      },
      { stable_key: "viewer", version: 2, kind: "organization", state: "active" },
    ]);

    const previous = await context!.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM role_definitions
      WHERE version = 1 AND state = 'approved' AND activated_at IS NULL
    `;
    expect(previous[0]!.count).toBe(6);
    const previousDefaults = await context!.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM role_permission_defaults AS defaults
      JOIN role_definitions AS role ON role.id = defaults.role_definition_id
      WHERE role.version = 1
    `;
    expect(previousDefaults[0]!.count).toBe(0);
  });

  test("records the R1 migration audit events", async () => {
    const events = await context!.client<{ action: string; count: number }[]>`
      SELECT action, count(*)::integer AS count
      FROM audit_events
      GROUP BY action
      ORDER BY action
    `;

    expect(events).toEqual([
      { action: "permission_registry.sync", count: 1 },
      { action: "r1.2_schema.add", count: 1 },
      { action: "r1.3_access.add", count: 1 },
      { action: "r1.4_permissions.add", count: 1 },
      { action: "role_version.activate", count: 12 },
      { action: "role_version.deactivate", count: 6 },
    ]);
  });

  test("keeps the shared worker role restricted", async () => {
    const [worker] = await context!.client<
      {
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }[]
    >`
      SELECT
        rolcanlogin,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolinherit,
        rolreplication,
        rolbypassrls
      FROM pg_roles
      WHERE rolname = 'mmhr_worker'
    `;

    expect(worker).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
    });

    const [schemaAccess] = await context!.client<{ allowed: boolean }[]>`
      SELECT has_schema_privilege('mmhr_worker', 'mmhr_private', 'USAGE') AS allowed
    `;
    expect(schemaAccess?.allowed).toBe(false);
  });

  test("does not activate worker commands or recovery commands", async () => {
    const workerFunctions = await context!.client<
      { proname: string; worker_execute: boolean }[]
    >`
      SELECT
        procedures.proname,
        has_function_privilege('mmhr_worker', procedures.oid, 'EXECUTE') AS worker_execute
      FROM pg_proc AS procedures
      INNER JOIN pg_namespace AS namespaces
        ON namespaces.oid = procedures.pronamespace
      WHERE namespaces.nspname = 'mmhr_private'
        AND procedures.proname LIKE 'r1_%'
      ORDER BY procedures.proname
    `;

    expect(workerFunctions.map((item) => item.proname)).toEqual([
      "r1_audit_summary_is_safe",
      "r1_create_ephemeral_worker_login",
      "r1_disable_ephemeral_worker_login",
      "r1_disable_expired_worker_logins",
      "r1_enforce_state_transition",
      "r1_has_permission_for_identity",
      "r1_permission_registry",
      "r1_protect_legacy_invitation_token",
      "r1_protect_role_definition_history",
      "r1_protect_role_permission_defaults",
      "r1_reject_immutable_mutation",
      "r1_remove_ephemeral_worker_login",
      "r1_remove_expired_worker_logins",
      "r1_renew_ephemeral_worker_login",
      "r1_request_has_membership",
      "r1_request_has_permission",
      "r1_request_identity_id",
      "r1_request_is_org_admin",
      "r1_sync_permission_registry",
      "r1_worker_role_is_safe",
    ]);
    expect(workerFunctions.every((item) => !item.worker_execute)).toBe(true);

    const recoveryFunctions = await context!.client<{ proname: string }[]>`
      SELECT procedures.proname
      FROM pg_proc AS procedures
      INNER JOIN pg_namespace AS namespaces
        ON namespaces.oid = procedures.pronamespace
      WHERE namespaces.nspname IN ('public', 'mmhr_private')
        AND procedures.proname ILIKE '%recovery%'
    `;
    expect(recoveryFunctions).toHaveLength(0);

    const protectedRows = await context!.client<
      { table_name: string; count: number }[]
    >`
      SELECT 'admin_delegation_grants' AS table_name, count(*)::integer AS count FROM admin_delegation_grants
      UNION ALL SELECT 'identity_admin_intents', count(*)::integer FROM identity_admin_intents
      UNION ALL SELECT 'identity_recovery_approvals', count(*)::integer FROM identity_recovery_approvals
      UNION ALL SELECT 'identity_recovery_presence', count(*)::integer FROM identity_recovery_presence
      UNION ALL SELECT 'identity_recovery_requests', count(*)::integer FROM identity_recovery_requests
      UNION ALL SELECT 'platform_role_assignments', count(*)::integer FROM platform_role_assignments
      UNION ALL SELECT 'portal_access_grants', count(*)::integer FROM portal_access_grants
      UNION ALL SELECT 'security_bootstrap_state', count(*)::integer FROM security_bootstrap_state
      UNION ALL SELECT 'user_permission_overrides', count(*)::integer FROM user_permission_overrides
      ORDER BY table_name
    `;
    expect(protectedRows.every((item) => item.count === 0)).toBe(true);
  });

  test("synchronizes registry definitions without silently changing policy", async () => {
    await verifyRegistrySynchronization(context!);
  });

  test("emergency containment revokes all R1 RPCs and rolls back exact grants", async () => {
    await verifyEmergencyContainment(context!, expectedTables);
  });

  test("serializes draft-default changes with role approval", async () => {
    await verifyRoleApprovalSerialization(context!);
  });

  test("applies deny and override precedence across real role versions", async () => {
    await verifyRoleDefaultPrecedence(context!);
  });

  test("platform revocation cannot convert an internal principal into an external member", async () => {
    await verifyInternalScopeContinuity(context!);
  });

  test("workspace registry retirement denies organization action access", async () => {
    await verifyWorkspaceDefinitionGate(context!);
  });
});
