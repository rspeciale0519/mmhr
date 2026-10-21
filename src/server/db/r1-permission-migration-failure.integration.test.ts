import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  applyMigrationsBeforePermissions,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "@/server/db/r1-migration-rehearsal";

async function snapshot(context: RehearsalContext) {
  const schema = await context.client<{ kind: string; identity: string; definition: unknown }[]>`
    WITH namespaces AS (
      SELECT * FROM pg_namespace WHERE nspname IN ('public', 'mmhr_private', 'drizzle')
    ), relations AS (
      SELECT relation.*, namespaces.nspname,
        format('%I.%I', namespaces.nspname, relation.relname) AS qualified_name
      FROM pg_class relation JOIN namespaces ON namespaces.oid = relation.relnamespace
    )
    SELECT 'namespace' AS kind, nspname AS identity,
      jsonb_build_object('owner', nspowner, 'acl', nspacl::text) AS definition FROM namespaces
    UNION ALL SELECT 'relation', qualified_name,
      jsonb_build_object('kind', relkind, 'owner', relowner, 'acl', relacl::text,
        'rls', relrowsecurity, 'force_rls', relforcerowsecurity) FROM relations
    UNION ALL SELECT 'column', relation.qualified_name || '.' || quote_ident(attribute.attname),
      jsonb_build_object('position', attribute.attnum, 'type', format_type(attribute.atttypid, attribute.atttypmod),
        'not_null', attribute.attnotnull, 'identity', attribute.attidentity, 'generated', attribute.attgenerated,
        'acl', attribute.attacl::text, 'default', pg_get_expr(defaults.adbin, defaults.adrelid))
      FROM relations relation JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      LEFT JOIN pg_attrdef defaults ON defaults.adrelid = relation.oid AND defaults.adnum = attribute.attnum
      WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
    UNION ALL SELECT 'constraint', relation.qualified_name || '.' || quote_ident(constraint_row.conname),
      jsonb_build_object('definition', pg_get_constraintdef(constraint_row.oid, false),
        'validated', constraint_row.convalidated, 'deferrable', constraint_row.condeferrable,
        'deferred', constraint_row.condeferred)
      FROM relations relation JOIN pg_constraint constraint_row ON constraint_row.conrelid = relation.oid
    UNION ALL SELECT 'index', relation.qualified_name,
      to_jsonb(pg_get_indexdef(index_row.indexrelid))
      FROM relations relation JOIN pg_index index_row ON index_row.indexrelid = relation.oid
    UNION ALL SELECT 'trigger', relation.qualified_name || '.' || quote_ident(trigger_row.tgname),
      jsonb_build_object('definition', pg_get_triggerdef(trigger_row.oid, false),
        'enabled', trigger_row.tgenabled, 'internal', trigger_row.tgisinternal)
      FROM relations relation JOIN pg_trigger trigger_row ON trigger_row.tgrelid = relation.oid
    UNION ALL SELECT 'policy', format('%I.%I.%I', schemaname, tablename, policyname),
      to_jsonb(policy) FROM pg_policies policy WHERE schemaname IN ('public', 'mmhr_private', 'drizzle')
    UNION ALL SELECT 'function', format('%I.%I(%s)', namespaces.nspname, routine.proname,
        pg_get_function_identity_arguments(routine.oid)),
      jsonb_build_object('definition', pg_get_functiondef(routine.oid),
        'owner', routine.proowner, 'acl', routine.proacl::text, 'configuration', routine.proconfig)
      FROM pg_proc routine JOIN namespaces ON namespaces.oid = routine.pronamespace
      WHERE routine.prokind IN ('f', 'p')
    UNION ALL SELECT 'enum', format('%I.%I:%s', namespaces.nspname, type_row.typname, enum_row.enumsortorder),
      to_jsonb(enum_row.enumlabel)
      FROM pg_type type_row JOIN namespaces ON namespaces.oid = type_row.typnamespace
      JOIN pg_enum enum_row ON enum_row.enumtypid = type_row.oid
    UNION ALL SELECT 'default_acl', format('%s:%s:%s', defaclrole, defaclnamespace, defaclobjtype),
      to_jsonb(defaclacl::text) FROM pg_default_acl
      WHERE defaclnamespace = 0 OR defaclnamespace IN (SELECT oid FROM namespaces)
    ORDER BY kind, identity
  `;
  const tables = await context.client<{ schema_name: string; table_name: string }[]>`
    SELECT schemaname AS schema_name, tablename AS table_name FROM pg_tables
    WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, tablename
  `;
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    const qualified = [table.schema_name, table.table_name]
      .map((name) => `"${name.replaceAll('"', '""')}"`).join(".");
    const rows = await context.client.unsafe<{ row: unknown }[]>(
      `SELECT to_jsonb(record) AS row FROM ${qualified} record ORDER BY to_jsonb(record)::text`,
    );
    data[`${table.schema_name}.${table.table_name}`] = rows.map((row) => row.row);
  }
  return { schema: [...schema], data };
}

function constraintFailure(error: unknown): object | undefined {
  const visited = new Set<unknown>();
  let candidate = error;
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    if ("code" in candidate && candidate.code === "23514") return candidate;
    visited.add(candidate);
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return undefined;
}

describe.each(["permission_registry.sync", "r1.4_permissions.add"] as const)(
  "R1.4 atomic migration when audit action %s fails", (action) => {
    let context: RehearsalContext | undefined;

    beforeAll(async () => {
      context = await startRehearsal(action === "permission_registry.sync" ? "auditfirst" : "auditfinal");
      await applyMigrationsBeforePermissions(context);
    }, 240_000);

    afterAll(async () => {
      if (context) await stopRehearsal(context);
    }, 180_000);

    test("restores exact schema, application rows, audit history, and migration ledger", async () => {
      // Add a stricter fixture check. Existing constraints and triggers stay enabled.
      // The unique disposable context retains this check until stack disposal.
      if (action === "permission_registry.sync") {
        await context!.client`ALTER TABLE public.audit_events
          ADD CONSTRAINT r14_audit_insert_failure_fixture
          CHECK (action <> 'permission_registry.sync') NOT VALID`;
      } else {
        await context!.client`ALTER TABLE public.audit_events
          ADD CONSTRAINT r14_audit_insert_failure_fixture
          CHECK (action <> 'r1.4_permissions.add') NOT VALID`;
      }
      const before = await snapshot(context!);
      expect(before.data["drizzle.__drizzle_migrations"]).toHaveLength(3);
      expect(before.data["public.permission_definitions"]).toEqual([]);
      expect(before.data["public.role_definitions"]).toHaveLength(6);
      let failure: unknown;
      try { await applyAllMigrations(context!); }
      catch (error) { failure = error; }
      expect(failure).toBeDefined();
      expect(constraintFailure(failure)).toMatchObject({
        code: "23514", schema_name: "public", table_name: "audit_events",
        constraint_name: "r14_audit_insert_failure_fixture",
      });
      expect(await snapshot(context!)).toEqual(before);
    }, 60_000);
  },
);
