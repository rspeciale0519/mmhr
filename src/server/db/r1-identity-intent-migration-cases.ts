import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect } from "vitest";

import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asWorker, claimIntent, intentSnapshot, prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { asAuthenticated, createMembership, createSecurityPrincipal } from "./r1-security-command-fixtures";

const expectedPrefix = [
  "0000_light_vanisher", "0001_heavy_kulan_gath", "0002_r1_request_scoped_access",
  "0003_r1_permission_evaluation", "0004_r1_security_commands", "0005_r1_identity_recovery",
] as const;

async function readReviewedPrefix() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const journal = JSON.parse(await readFile(path.join(projectRoot, "drizzle/meta/_journal.json"), "utf8")) as {
    version: string; dialect: string; entries: { tag: string; idx: number }[];
  };
  if (journal.version !== "7" || journal.dialect !== "postgresql"
    || expectedPrefix.some((tag, index) => journal.entries[index]?.tag !== tag || journal.entries[index]?.idx !== index)) {
    throw new Error("The identity intent migration prefix differs from the reviewed0000–0005 sequence");
  }
  const files = await Promise.all(expectedPrefix.map(async (tag) => ({ tag,
    source: await readFile(path.join(projectRoot, "drizzle", `${tag}.sql`), "utf8"),
  })));
  return { journal, files };
}

type ReviewedPrefix = Awaited<ReturnType<typeof readReviewedPrefix>>;

async function writeReviewedPrefix(context: RehearsalContext, prefix: ReviewedPrefix, count: 5 | 6) {
  const prefixRoot = path.join(context.scratchRoot, `identity-intent-prefix-${count}`);
  const prefixMeta = path.join(prefixRoot, "meta");
  await mkdir(prefixMeta, { recursive: true });
  for (const { tag, source } of prefix.files.slice(0, count)) {
    await writeFile(path.join(prefixRoot, `${tag}.sql`), source, "utf8");
  }
  await writeFile(path.join(prefixMeta, "_journal.json"), `${JSON.stringify({
    ...prefix.journal, entries: prefix.journal.entries.slice(0, count),
  }, null, 2)}\n`, "utf8");
  expect((await readdir(prefixRoot)).sort()).toEqual([
    ...expectedPrefix.slice(0, count).map((tag) => `${tag}.sql`), "meta",
  ].sort());
  console.info("Reviewed identity intent migration prefix copied:", count, context.projectId);
  return prefixRoot;
}

async function applyReviewedPrefix(context: RehearsalContext, prefix: ReviewedPrefix, count: 5 | 6) {
  const prefixRoot = await writeReviewedPrefix(context, prefix, count);
  await migrate(context.db, { migrationsFolder: prefixRoot });
  const [applied] = await context.client<{ count: number }[]>`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
  expect(applied!.count).toBe(count);
  return prefixRoot;
}

export async function applyIdentityIntentMigrations(context: RehearsalContext, count: 5 | 6 = 6) {
  return applyReviewedPrefix(context, await readReviewedPrefix(), count);
}

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
  const tables = await context.client<{ schema_name: string; table_name: string }[]>`SELECT schemaname AS schema_name,
    tablename AS table_name FROM pg_tables WHERE schemaname IN ('public', 'mmhr_private', 'drizzle')
    ORDER BY schemaname, tablename`;
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
const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function captureRecord(context: RehearsalContext, table: BackupTable, id: string, columns?: string[]): Promise<BackupRecord> {
  const selected = columns ?? (await context.client<{ name: string }[]>`SELECT attname AS name FROM pg_attribute
    WHERE attrelid = ${table}::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum`)
    .map((column) => column.name);
  const rows = await context.client.unsafe<{ record: Record<string, unknown> }[]>(
    `SELECT to_jsonb(record) AS record FROM ${table} record WHERE id = $1::uuid`, [id],
  );
  expect(rows).toHaveLength(1);
  return { table, id, columns: selected, row: Object.fromEntries(selected.map((column) => [column, rows[0]!.record[column]])) };
}

async function seedLegacyIntent(context: RehearsalContext) {
  const seeded = await context.client.begin(async (sql) => {
    const principal = await createSecurityPrincipal(sql);
    const organizationId = randomUUID();
    const invitationId = randomUUID();
    const intentId = randomUUID();
    const auditId = randomUUID();
    await sql`INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
      VALUES (${organizationId}::uuid, 'Synthetic legacy intent organization', 'customer', 'active', now(), false)`;
    const membershipId = await createMembership(sql, organizationId, principal, "organization_admin");
    const email = `legacy-${randomUUID()}@example.invalid`;
    await sql`INSERT INTO public.invitations (id, org_id, email, normalized_email, role, role_key, created_by_identity_id, expires_at)
      VALUES (${invitationId}::uuid, ${organizationId}::uuid, ${email}, ${email}, 'viewer', 'viewer',
        ${principal.identityId}::uuid, now() + interval '1 hour')`;
    await sql`INSERT INTO public.identity_admin_intents (id, operation, invitation_id, idempotency_key)
      VALUES (${intentId}::uuid, 'invitation_delivery', ${invitationId}::uuid, ${randomUUID()})`;
    await sql`INSERT INTO public.audit_events
      (id, actor_type, actor_reference, organization_id, command, action, entity_type, entity_id, reason, correlation_id)
      VALUES (${auditId}::uuid, 'migration', 'synthetic-legacy-intent', ${organizationId}::uuid,
        'identity.intent.fixture', 'identity.intent.fixture', 'identity_intent', ${intentId},
        'Preserve this synthetic legacy record', ${randomUUID()}::uuid)`;
    return { principal, organizationId, membershipId, invitationId, intentId, auditId };
  });
  const ids = [seeded.principal.subject, seeded.principal.factorId, seeded.principal.sessionId, seeded.principal.identityId,
    seeded.organizationId, seeded.membershipId, seeded.invitationId, seeded.intentId, seeded.auditId];
  const records = await Promise.all(backupTables.map((table, index) => captureRecord(context, table, ids[index]!)));
  expect(records[0]!.row.email).toMatch(/@example\.invalid$/);
  return { ...seeded, records };
}

type LegacyIntentBackup = Awaited<ReturnType<typeof seedLegacyIntent>>;

async function assertLegacyRows(context: RehearsalContext, backup: LegacyIntentBackup) {
  const current = await Promise.all(backup.records.map((record) => captureRecord(context, record.table, record.id, record.columns)));
  expect(current).toEqual(backup.records);
}

async function restoreLegacyRows(context: RehearsalContext, backup: LegacyIntentBackup) {
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

async function assertLegacyCompatibility(context: RehearsalContext, backup: LegacyIntentBackup) {
  await assertLegacyRows(context, backup);
  await prepareWorkerFixtureRole(context);
  const before = await intentSnapshot(context.client);
  await context.client.begin(async (sql) => {
    expect(await asWorker(sql, (worker) => claimIntent(worker, backup.intentId))).toBeNull();
    expect(await asWorker(sql, (worker) => claimIntent(worker, backup.intentId, true))).toBeNull();
    expect(await asAuthenticated(sql, backup.principal, (runtime) => runtime<{ id: string }[]>`
      SELECT id FROM public.mmhr_get_my_identity()`)).toEqual([{ id: backup.principal.identityId }]);
  });
  expect(await intentSnapshot(context.client)).toEqual(before);
  expect(await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${backup.intentId}::uuid`).toHaveLength(0);
  const [contextFields] = await context.client`SELECT correlation_id, initiated_by_identity_id, auth_subject_id,
    lease_token, work_mode, dispatch_count FROM public.identity_admin_intents WHERE id = ${backup.intentId}::uuid`;
  expect(contextFields).toEqual({ correlation_id: null, initiated_by_identity_id: null, auth_subject_id: null,
    lease_token: null, work_mode: null, dispatch_count: 0 });
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
  console.info("Identity intent migration scratch project:", context.projectId);
  let failure: unknown;
  try { return await run(context); }
  catch (error) { failure = error; throw error; }
  finally {
    try { await stopRehearsal(context); }
    catch (cleanupError) {
      if (failure) throw new AggregateError([failure, cleanupError], "Identity intent migration and scratch cleanup failed");
      throw cleanupError;
    }
  }
}

export async function rehearseIdentityIntentMigration() {
  // Keep the reviewed SQL and this synthetic backup in memory across disposal.
  // No production database or provider account participates in this rehearsal.
  const prefix = await readReviewedPrefix();
  const backup = await inScratch("intentfailure", async (context) => {
    await applyReviewedPrefix(context, prefix, 5);
    const backup = await seedLegacyIntent(context);
    const before = await migrationSnapshot(context);
    expect(before.data["drizzle.__drizzle_migrations"]).toHaveLength(5);
    const prefixRoot = await writeReviewedPrefix(context, prefix, 6);
    const finalMigration = prefix.files[5]!;
    await writeFile(path.join(prefixRoot, `${finalMigration.tag}.sql`), `${finalMigration.source}
--> statement-breakpoint
DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Identity intent migration fault fixture'; END $$;
`, "utf8");
    let failure: unknown;
    try { await migrate(context.db, { migrationsFolder: prefixRoot }); }
    catch (error) { failure = error; }
    expect(migrationFailure(failure)).toMatchObject({ code: "P0001", message: "Identity intent migration fault fixture" });
    expect(await migrationSnapshot(context)).toEqual(before);
    await assertLegacyRows(context, backup);
    await applyReviewedPrefix(context, prefix, 6);
    await assertLegacyCompatibility(context, backup);
    return backup;
  });
  await inScratch("intentrestore", async (context) => {
    await applyReviewedPrefix(context, prefix, 5);
    await restoreLegacyRows(context, backup);
    await applyReviewedPrefix(context, prefix, 6);
    await assertLegacyCompatibility(context, backup);
  });
}
