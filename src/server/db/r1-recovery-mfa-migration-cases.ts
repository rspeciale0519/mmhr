import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect } from "vitest";

import { asWorker, claimIntent, prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { createRecoveryMfaFixture, recoveryMfaContext } from "./r1-recovery-mfa-fixtures";
import { applyRecoveryMfaPrefix, readRecoveryMfaPrefix, writeRecoveryMfaPrefix } from "./r1-recovery-mfa-prefix";
import { asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal } from "./r1-security-command-fixtures";

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function migrationSnapshot(context: RehearsalContext) {
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
    UNION ALL SELECT 'index', relation.qualified_name, to_jsonb(pg_get_indexdef(index_row.indexrelid))
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
    WHERE schemaname IN ('public', 'mmhr_private', 'drizzle') ORDER BY schemaname, tablename`;
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    const qualified = [table.schema_name, table.table_name].map(quoteIdentifier).join(".");
    const rows = await context.client.unsafe<{ row: unknown }[]>(
      `SELECT to_jsonb(record) AS row FROM ${qualified} record ORDER BY to_jsonb(record)::text`,
    );
    data[`${table.schema_name}.${table.table_name}`] = rows.map((row) => row.row);
  }
  return { schema: [...schema], data };
}

const backupTables = ["auth.users", "auth.mfa_factors", "auth.sessions", "public.identities", "public.orgs",
  "public.org_members", "public.invitations", "public.identity_admin_intents", "public.audit_events"] as const;
type BackupTable = typeof backupTables[number];
type BackupRecord = { table: BackupTable; id: string; columns: string[]; row: Record<string, unknown> };

async function captureRecord(context: RehearsalContext, table: BackupTable, id: string, columns?: string[]): Promise<BackupRecord> {
  const selected = columns ?? (await context.client<{ name: string }[]>`SELECT attname AS name FROM pg_attribute
    WHERE attrelid = ${table}::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum`)
    .map((column) => column.name);
  const rows = await context.client.unsafe<{ record: Record<string, unknown> }[]>(
    `SELECT to_jsonb(record) AS record FROM ${table} record WHERE id = $1::uuid`, [id],
  );
  expect(rows).toHaveLength(1);
  return { table, id, columns: selected,
    row: Object.fromEntries(selected.map((column) => [column, rows[0]!.record[column]])) };
}

async function seedLegacyRows(context: RehearsalContext) {
  const seeded = await context.client.begin(async (sql) => {
    const principal = await createSecurityPrincipal(sql);
    const organizationId = randomUUID();
    const invitationId = randomUUID();
    const intentId = randomUUID();
    const auditId = randomUUID();
    await sql`INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
      VALUES (${organizationId}::uuid, 'Synthetic pre-MFA migration organization', 'customer', 'active', now(), false)`;
    const membershipId = await createMembership(sql, organizationId, principal, "organization_admin");
    const email = `legacy-mfa-${randomUUID()}@example.invalid`;
    await sql`INSERT INTO public.invitations (id, org_id, email, normalized_email, role, role_key, created_by_identity_id, expires_at)
      VALUES (${invitationId}::uuid, ${organizationId}::uuid, ${email}, ${email}, 'viewer', 'viewer',
        ${principal.identityId}::uuid, now() + interval '1 hour')`;
    await sql`INSERT INTO public.identity_admin_intents (id, operation, invitation_id, idempotency_key)
      VALUES (${intentId}::uuid, 'invitation_delivery', ${invitationId}::uuid, ${randomUUID()})`;
    await sql`INSERT INTO public.audit_events
      (id, actor_type, actor_reference, organization_id, command, action, entity_type, entity_id, reason, correlation_id)
      VALUES (${auditId}::uuid, 'migration', 'synthetic-pre-MFA', ${organizationId}::uuid,
        'identity.intent.fixture', 'identity.intent.fixture', 'identity_intent', ${intentId},
        'Preserve synthetic pre-MFA history', ${randomUUID()}::uuid)`;
    return { principal, organizationId, membershipId, invitationId, intentId, auditId };
  });
  const ids = [seeded.principal.subject, seeded.principal.factorId, seeded.principal.sessionId, seeded.principal.identityId,
    seeded.organizationId, seeded.membershipId, seeded.invitationId, seeded.intentId, seeded.auditId];
  const records = await Promise.all(backupTables.map((table, index) => captureRecord(context, table, ids[index]!)));
  expect(records[0]!.row.email).toMatch(/@example\.invalid$/);
  return { ...seeded, records };
}

type LegacyBackup = Awaited<ReturnType<typeof seedLegacyRows>>;

async function assertLegacyRows(context: RehearsalContext, backup: LegacyBackup) {
  const current = await Promise.all(backup.records.map((record) => captureRecord(context, record.table, record.id, record.columns)));
  expect(current).toEqual(backup.records);
}

async function restoreLegacyRows(context: RehearsalContext, backup: LegacyBackup) {
  await context.client.begin(async (sql) => {
    for (const record of backup.records) {
      expect(backupTables).toContain(record.table);
      const columns = record.columns.map(quoteIdentifier).join(",");
      await sql.unsafe(`INSERT INTO ${record.table} (${columns}) SELECT ${columns}
        FROM jsonb_populate_record(NULL::${record.table}, $1::jsonb)`, [JSON.stringify(record.row)]);
    }
  });
  await assertLegacyRows(context, backup);
}

async function assertLegacyCompatibility(context: RehearsalContext, backup: LegacyBackup) {
  await assertLegacyRows(context, backup);
  const before = await migrationSnapshot(context);
  await context.client.begin(async (sql) => {
    expect(await asWorker(sql, (worker) => claimIntent(worker, backup.intentId))).toBeNull();
    expect(await asWorker(sql, (worker) => claimIntent(worker, backup.intentId, true))).toBeNull();
    expect(await asAuthenticated(sql, backup.principal, (caller) => caller<{ id: string }[]>`
      SELECT id FROM public.mmhr_get_my_identity()`, "aal1")).toEqual([{ id: backup.principal.identityId }]);
    expect(await asAuthenticated(sql, backup.principal, recoveryMfaContext, "aal1")).toEqual([]);
  });
  // Both worker claim functions advance the serialization guard even when no
  // claim is available. No application, audit, lease, or history row may change.
  const expectedGuard = before.data["mmhr_private.security_authority_guard"]!.map((row) => {
    if (typeof row !== "object" || row === null || !("revision" in row)
      || typeof row.revision !== "number" || !Number.isSafeInteger(row.revision)) {
      throw new Error("The migration fixture serialization guard is invalid");
    }
    return { ...row, revision: row.revision + 2 };
  });
  expect(await migrationSnapshot(context)).toEqual({ ...before,
    data: { ...before.data, "mmhr_private.security_authority_guard": expectedGuard },
  });
  expect(await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${backup.intentId}::uuid`).toHaveLength(0);
}

function migrationFailure(error: unknown) {
  const visited = new Set<unknown>();
  let candidate = error;
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    if ("code" in candidate && candidate.code === "P0001") return candidate;
    visited.add(candidate);
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return undefined;
}

async function inScratch<T>(label: string, run: (context: RehearsalContext) => Promise<T>) {
  const context = await startRehearsal(label);
  let failure: unknown;
  try { return await run(context); }
  catch (error) { failure = error; throw error; }
  finally {
    try {
      await stopRehearsal(context);
      console.info("Recovery MFA migration exact scratch cleanup completed:", context.projectId);
    } catch (cleanupError) {
      if (failure) throw new AggregateError([failure, cleanupError], "Recovery MFA migration and scratch cleanup failed");
      throw cleanupError;
    }
  }
}

export async function rehearseRecoveryMfaMigration() {
  // Keep this exact reviewed prefix and synthetic backup in memory. The second
  // scratch database restores selected compatible rows, not real user accounts.
  const prefix = await readRecoveryMfaPrefix();
  const backup = await inScratch("intentmfafail", async (context) => {
    await applyRecoveryMfaPrefix(context, prefix, 9);
    await prepareWorkerFixtureRole(context);
    const backup = await seedLegacyRows(context);
    const foundation = await context.client.begin(createCommandFixture);
    const recovery = await context.client.begin((sql) => createRecoveryMfaFixture(sql, foundation));
    const before = await migrationSnapshot(context);
    expect(before.data["drizzle.__drizzle_migrations"]).toHaveLength(9);
    const prefixRoot = await writeRecoveryMfaPrefix(context, prefix);
    const finalMigration = prefix.files[9]!;
    await writeFile(path.join(prefixRoot, `${finalMigration.tag}.sql`), `${finalMigration.source}
--> statement-breakpoint
DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Recovery MFA migration fault fixture'; END $$;
`, "utf8");
    let failure: unknown;
    try { await migrate(context.db, { migrationsFolder: prefixRoot }); }
    catch (error) { failure = error; }
    expect(migrationFailure(failure)).toMatchObject({ code: "P0001", message: "Recovery MFA migration fault fixture" });
    expect(await migrationSnapshot(context)).toEqual(before);
    expect(await context.client`SELECT to_regprocedure('public.mmhr_get_recovery_mfa_context()') AS routine`).toEqual([{ routine: null }]);
    await assertLegacyRows(context, backup);
    await applyRecoveryMfaPrefix(context, prefix);
    const after = await migrationSnapshot(context);
    const { "drizzle.__drizzle_migrations": beforeLedger, ...beforeData } = before.data;
    const { "drizzle.__drizzle_migrations": afterLedger, ...afterData } = after.data;
    expect(beforeLedger).toHaveLength(9);
    expect(afterLedger).toHaveLength(10);
    expect(afterData).toEqual(beforeData);
    await context.client.begin(async (sql) => {
      expect(await asAuthenticated(sql, recovery.target, recoveryMfaContext, "aal1")).toEqual([{
        recovery_request_id: recovery.requestId, recovery_presence_id: recovery.presenceId,
        expected_factor_id: null, state: "enrollment_required",
      }]);
    });
    await assertLegacyCompatibility(context, backup);
    return backup;
  });
  await inScratch("intentmfarest", async (context) => {
    await applyRecoveryMfaPrefix(context, prefix, 9);
    await prepareWorkerFixtureRole(context);
    await restoreLegacyRows(context, backup);
    await applyRecoveryMfaPrefix(context, prefix);
    await assertLegacyCompatibility(context, backup);
  });
}
