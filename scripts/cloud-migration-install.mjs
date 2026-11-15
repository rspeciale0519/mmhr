#!/usr/bin/env node
// Installs the Drizzle migrations on one hosted Supabase project through the Supabase CLI.
// drizzle.config.ts refuses non-loopback databases on purpose, so this script never uses
// drizzle-kit or a connection string. It reproduces the drizzle-orm 0.45 pg migrator record:
// drizzle.__drizzle_migrations(id serial, hash text, created_at bigint), where hash is the
// sha256 hex of the file text and created_at is the journal entry "when" value.
//
// Usage: node scripts/cloud-migration-install.mjs --project-ref <ref> [--dry-run]
//
// Each pending file runs in its own transaction together with its journal row.
// A re-run skips recorded files after it verifies their hashes against the local files.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(projectRoot, "drizzle");
const breakpoint = "--> statement-breakpoint";

class InstallError extends Error {}

function fail(message) {
  throw new InstallError(message);
}

function parseArguments(argv) {
  const options = { projectRef: undefined, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--project-ref") options.projectRef = argv[++index];
    else if (value.startsWith("--project-ref=")) options.projectRef = value.slice("--project-ref=".length);
    else fail(`unknown argument "${value}"`);
  }
  // A hosted project ref is 20 lowercase letters. There is no default and no linked-project fallback.
  if (!options.projectRef || !/^[a-z]{20}$/.test(options.projectRef)) {
    fail("pass the target explicitly: --project-ref <20-letter project ref>");
  }
  return options;
}

// Same reading as drizzle-orm readMigrationFiles: text of each journal tag, split on the breakpoint.
function readMigrations() {
  const journal = JSON.parse(readFileSync(path.join(migrationsRoot, "meta/_journal.json"), "utf8"));
  let previousWhen = -Infinity;
  return journal.entries.map((entry, index) => {
    if (!/^\d{4}_[a-z0-9_-]+$/i.test(entry.tag)) fail(`invalid journal tag "${entry.tag}"`);
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousWhen) {
      // drizzle only applies files whose "when" is above the last recorded created_at.
      fail(`journal "when" values must increase; check entry ${index} (${entry.tag})`);
    }
    previousWhen = entry.when;
    const text = readFileSync(path.join(migrationsRoot, `${entry.tag}.sql`)).toString();
    return {
      index,
      tag: entry.tag,
      when: entry.when,
      hash: createHash("sha256").update(text).digest("hex"),
      statements: text.split(breakpoint),
    };
  });
}

// Never echo credentials that a CLI or database message could carry.
function redact(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-connection-string]")
    .replace(/\bsbp_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+/g, "[redacted-key]")
    // Keep only the title of an HTML gateway error page.
    .replace(/<!DOCTYPE[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*/i, "HTML error page: $1");
}

function createRunner(projectRef) {
  // An empty work directory keeps the CLI away from the repository supabase/config.toml.
  const workdir = mkdtempSync(path.join(tmpdir(), "mmhr-cloud-install-"));
  const environment = { ...process.env };
  // A stale exported token overrides the operator's CLI login on the owner machine.
  delete environment.SUPABASE_ACCESS_TOKEN;
  delete environment.SUPABASE_YES;
  let fileCounter = 0;

  function run(sql, { readOnly }) {
    fileCounter += 1;
    const file = path.join(workdir, `query-${fileCounter}.sql`);
    writeFileSync(file, sql, "utf8");
    const args = ["db", "query", `--remote=${projectRef}`, "--workdir", workdir, "--output-format", "json", "-f", file];
    args.push(readOnly ? "--read-only" : "--yes");
    const result = spawnSync("supabase", args, {
      cwd: workdir,
      env: environment,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    rmSync(file, { force: true });
    if (result.error) return { ok: false, message: redact(result.error.message) };
    const stderr = result.stderr ?? "";
    // The CLI prints the resolved target on stderr. Refuse any output for another project.
    const target = stderr.match(/Target: project [^\r\n]*/)?.[0] ?? "";
    if (!target.includes(projectRef)) {
      return { ok: false, message: `CLI did not confirm target ${projectRef}: ${redact(stderr.trim())}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      return { ok: false, message: `unreadable CLI output (exit ${result.status}): ${redact(`${result.stdout}\n${stderr}`.trim())}` };
    }
    if (result.status !== 0 || parsed._tag === "Error" || parsed.error) {
      const message = parsed.error?.message ?? JSON.stringify(parsed);
      return { ok: false, message: redact(message) };
    }
    return { ok: true, rows: parsed.rows ?? [] };
  }

  return {
    query(sql, options = { readOnly: true }) {
      const result = run(sql, options);
      if (!result.ok) fail(`query failed: ${result.message}`);
      return result.rows;
    },
    execute(sql) {
      return run(sql, { readOnly: false });
    },
    close() {
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

function readState(db) {
  const [state] = db.query(`SELECT json_build_object(
    'publicTables', (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'),
    'privateSchema', EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'mmhr_private'),
    'mmhrRoles', (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname LIKE 'mmhr\\_%'),
    'journalTable', to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
  ) AS state;`);
  const value = state?.state;
  if (!value) fail("could not read the target state");
  const records = value.journalTable
    ? db.query("SELECT id, hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id;")
    : [];
  return { ...value, records };
}

// The target must be empty, or hold an exact prefix of the local journal.
function checkState(state, migrations) {
  if (!state.journalTable || state.records.length === 0) {
    if (Number(state.publicTables) !== 0 || state.privateSchema || Number(state.mmhrRoles) !== 0) {
      fail(`target is not empty and has no migration records (public tables: ${state.publicTables}, `
        + `mmhr_private: ${state.privateSchema}, mmhr_* roles: ${state.mmhrRoles}); refusing to continue`);
    }
    return 0;
  }
  if (state.records.length > migrations.length) {
    fail(`target records ${state.records.length} migrations but the local journal has ${migrations.length}`);
  }
  state.records.forEach((record, position) => {
    const local = migrations[position];
    if (record.hash !== local.hash || record.created_at !== String(local.when)) {
      fail(`recorded migration ${position + 1} (id ${record.id}) does not match local ${local.tag}.sql; refusing to continue`);
    }
  });
  return state.records.length;
}

// Hosted and local projects differ before any migration runs. On a hosted project, new objects that
// postgres creates in public are still auto-exposed: tables to service_role (SELECT, INSERT, UPDATE,
// DELETE), sequences (SELECT, USAGE) and functions (EXECUTE) to anon, authenticated and service_role.
// The local stack that CI installs on does not auto-expose them. These revokes give the hosted
// project the local default privileges, so the migrations produce the same grants as in CI.
const defaultPrivilegeAlignment = `BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, USAGE ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
DO $mmhr_defaults$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace
      AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND ((d.defaclobjtype = 'r' AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
        OR (d.defaclobjtype = 'S' AND a.privilege_type IN ('SELECT', 'USAGE'))
        OR (d.defaclobjtype = 'f' AND a.privilege_type = 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'public default privileges still expose new objects to API roles';
  END IF;
END $mmhr_defaults$;
COMMIT;`;

const journalBootstrap = `CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);`;

function migrationScript(migration, expectedRecords) {
  // The lock and count guard stop a second concurrent run from applying the same file.
  return [
    "BEGIN;",
    'LOCK TABLE "drizzle"."__drizzle_migrations" IN EXCLUSIVE MODE;',
    `DO $mmhr_guard$ BEGIN
  IF (SELECT count(*) FROM "drizzle"."__drizzle_migrations") <> ${expectedRecords} THEN
    RAISE EXCEPTION 'migration journal changed during install; expected ${expectedRecords} records';
  END IF;
END $mmhr_guard$;`,
    // Statements stay in file order. The extra separators are empty statements.
    migration.statements.join("\n;\n"),
    ";",
    `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${migration.hash}', ${migration.when});`,
    "COMMIT;",
    "",
  ].join("\n");
}

// Gateway and rate-limit errors come from the API, not from the database.
function isTransportError(message) {
  return /unexpected status (?:429|5\d\d)/.test(message) && !/Failed to run sql query/.test(message);
}

function applyMigration(db, migration, migrations) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = db.execute(migrationScript(migration, migration.index));
    if (result.ok) return attempt;
    if (!isTransportError(result.message)) {
      fail(`${migration.tag}.sql failed; its transaction was rolled back. Files applied before it: ${migration.index}.\n${result.message}`);
    }
    // A transport error does not show whether the transaction committed. The journal shows it.
    const recorded = checkState(readState(db), migrations);
    if (recorded === migration.index + 1) return attempt;
    if (recorded !== migration.index) fail(`unexpected journal size ${recorded} after a transport error on ${migration.tag}.sql`);
    console.warn(`transport error on ${migration.tag}.sql (attempt ${attempt}); it is not recorded. ${result.message}`);
  }
  fail(`${migration.tag}.sql was not applied after ${maxAttempts} attempts; re-run the script to continue`);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const migrations = readMigrations();
  const db = createRunner(options.projectRef);
  const started = Date.now();
  try {
    const recorded = checkState(readState(db), migrations);
    const pending = migrations.slice(recorded);
    console.log(`Target ${options.projectRef}: ${recorded} recorded, ${pending.length} pending of ${migrations.length}.`);
    if (options.dryRun || pending.length === 0) return;

    const alignment = db.execute(defaultPrivilegeAlignment);
    if (!alignment.ok) fail(`could not align public default privileges: ${alignment.message}`);
    const bootstrap = db.execute(journalBootstrap);
    if (!bootstrap.ok) fail(`could not create the migration journal: ${bootstrap.message}`);

    for (const migration of pending) {
      const fileStarted = Date.now();
      const attempts = applyMigration(db, migration, migrations);
      const note = attempts > 1 ? `, ${attempts} attempts` : "";
      console.log(`applied ${migration.tag}.sql (${Date.now() - fileStarted} ms${note})`);
    }

    const finalRecords = checkState(readState(db), migrations);
    if (finalRecords !== migrations.length) fail(`expected ${migrations.length} records after install, found ${finalRecords}`);
    console.log(`Installed ${pending.length} migrations; ${finalRecords} records verified in ${Math.round((Date.now() - started) / 1000)} s.`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof InstallError ? error.message : redact(error?.stack ?? error);
  console.error(`cloud-migration-install: ${message}`);
  process.exitCode = 1;
}
