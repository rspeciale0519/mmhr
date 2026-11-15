#!/usr/bin/env node
// Longer-lived runtime worker login for one named hosted Supabase project.
// A Vercel preview deployment has no renewer for the 1-10 minute ephemeral login,
// so it uses one mmhr_hosted_worker_<hex> login instead. That login has the same
// role flags and the same single mmhr_worker membership as an ephemeral login.
//
//   node scripts/hosted-worker-login.mjs create --project-ref <ref>
//   node scripts/hosted-worker-login.mjs list   --project-ref <ref>
//   node scripts/hosted-worker-login.mjs remove <login-name> --project-ref <ref>
//
// `create` makes the credential and its SCRAM verifier on this machine. Only the
// verifier goes to the database. The connection string goes only to the Vercel CLI
// on standard input. This command never prints the credential or the connection string.
// If the Vercel step fails, the new login is removed again.
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { allowedProjectRefs, createRunner, HostedBootstrapError, redact } from "./hosted-bootstrap-super-admin.mjs";
import { createScramVerifier } from "./scram-verifier.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modes = new Set(["create", "list", "remove"]);
export const loginNamePattern = /^mmhr_hosted_worker_[0-9a-f]{32}$/;
// Same rule as the SQL function and the ephemeral login function.
const verifierPattern = /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;
// Supabase session pooler (port 5432) for each approved project. Prepared statements work in session mode.
export const sessionPoolers = new Map([["mslbuffwyuckfmgoyivj", "aws-1-us-west-2.pooler.supabase.com"]]);
// Pinned Vercel CLI release. Change it only after reading `env add --help` of the new release.
export const vercelCliVersion = "65.9.0";
export const vercelEnvironment = "preview";
export const vercelGitBranch = "develop";

export class HostedWorkerLoginError extends Error {}

function fail(message) {
  throw new HostedWorkerLoginError(message);
}

export function requireProjectRef(value) {
  if (typeof value !== "string" || !/^[a-z]{20}$/.test(value)) {
    fail("Pass the target explicitly: --project-ref <20-letter project ref>");
  }
  if (!allowedProjectRefs.has(value) || !sessionPoolers.has(value)) {
    fail(`Project ${value} is not an approved hosted worker target`);
  }
  return value;
}

export function requireLoginName(value) {
  if (typeof value !== "string" || !loginNamePattern.test(value)) fail("The login name must match mmhr_hosted_worker_<32 hex>");
  return value;
}

export function parseArguments(argv) {
  const [mode, ...rest] = argv;
  if (!modes.has(mode)) fail(usage());
  let projectRef;
  let loginName;
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--project-ref" && projectRef === undefined) projectRef = rest[++index];
    else if (value.startsWith("--project-ref=") && projectRef === undefined) projectRef = value.slice("--project-ref=".length);
    else if (mode === "remove" && loginName === undefined && !value.startsWith("-")) loginName = value;
    // Credentials and connection strings never come from arguments.
    else fail(`Unsupported argument. ${usage()}`);
  }
  const parsed = { mode, projectRef: requireProjectRef(projectRef) };
  if (mode === "remove") parsed.loginName = requireLoginName(loginName);
  return parsed;
}

// The CLI has no bind parameters. Each value is checked against a pattern without quotes first.
function literal(text, pattern, name) {
  if (typeof text !== "string" || !pattern.test(text) || /['\\\0]/.test(text)) fail(`Refusing an unsafe ${name}`);
  return `'${text}'::text`;
}

export function createSql(loginName, passwordVerifier) {
  // The expiry uses the database clock, so a local clock offset cannot pass the 90 day limit.
  return `SELECT 'created' AS result FROM (SELECT mmhr_private.r1_create_hosted_worker_login(
  ${literal(loginName, loginNamePattern, "login name")}, ${literal(passwordVerifier, verifierPattern, "password verifier")},
  clock_timestamp() + interval '90 days'
)) AS called;\n`;
}

export function disableSql(loginName) {
  return `SELECT 'disabled' AS result FROM (SELECT mmhr_private.r1_disable_hosted_worker_login(${literal(loginName, loginNamePattern, "login name")})) AS called;\n`;
}

export function removeSql(loginName) {
  return `SELECT 'removed' AS result FROM (SELECT mmhr_private.r1_remove_hosted_worker_login(${literal(loginName, loginNamePattern, "login name")})) AS called;\n`;
}

export const removeExpiredSql = "SELECT mmhr_private.r1_remove_expired_hosted_worker_logins() AS removed;\n";

export const listSql = `SELECT r.rolname AS name, r.rolcanlogin AS can_login, r.rolvaliduntil AS valid_until,
  (r.rolvaliduntil IS NULL OR r.rolvaliduntil <= clock_timestamp()) AS expired,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity a WHERE a.usename = r.rolname)::integer AS sessions
FROM pg_catalog.pg_roles r
WHERE r.rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'
ORDER BY r.rolvaliduntil NULLS FIRST, r.rolname;\n`;

const truthy = (value) => value === true || value === "t" || value === "true";

/** Keeps only known, non-secret columns from the CLI rows. */
export function parseLogins(rows) {
  if (!Array.isArray(rows)) fail("Could not read the hosted worker logins");
  return rows.map((row) => {
    if (!row || typeof row !== "object" || !loginNamePattern.test(String(row.name))) fail("Unexpected hosted worker login row");
    return {
      name: String(row.name),
      canLogin: truthy(row.can_login),
      validUntil: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
      expired: truthy(row.expired),
      sessions: Number(row.sessions) || 0,
    };
  });
}

export function sessionPoolerUrl(projectRef, loginName, credential) {
  const host = sessionPoolers.get(requireProjectRef(projectRef));
  requireLoginName(loginName);
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential)) fail("The generated credential has an unexpected form");
  // Built with URL setters so no literal credential URL sits in the source (repository secret scan).
  const url = new URL(`postgresql://${host}:5432/postgres`);
  url.username = `${loginName}.${projectRef}`;
  url.password = credential;
  url.searchParams.set("sslmode", "require");
  return url.toString();
}

/** Removes every known secret first, then the generic connection-string and token patterns. */
export function redactSecrets(text, secrets = []) {
  let value = String(text);
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return redact(value.replace(/SCRAM-SHA-256\$[^\s'";]+/g, "[redacted-verifier]"));
}

export function vercelInvocation(platform = process.platform) {
  const args = ["--yes", `vercel@${vercelCliVersion}`, "env", "add", "DATABASE_URL",
    "--environment", vercelEnvironment, "--git-branch", vercelGitBranch, "--sensitive", "--force", "--yes"];
  // npx is a .cmd shim on Windows, which Node starts only through a shell. Every argument is a fixed constant.
  return platform === "win32" ? { command: "npx.cmd", args, shell: true } : { command: "npx", args, shell: false };
}

export function assertVercelLink(root) {
  if (!existsSync(path.join(root, ".vercel", "project.json")) && !existsSync(path.join(root, ".vercel", "repo.json"))) {
    fail("This checkout is not linked to Vercel. Run `npx vercel login` and `npx vercel link` first. Nothing was changed.");
  }
}

/** Sends the connection string to the Vercel CLI on standard input. Its output is never printed unredacted. */
export function addVercelDatabaseUrl(url, { spawn = spawnSync, env = process.env, platform = process.platform, root = projectRoot } = {}) {
  const { command, args, shell } = vercelInvocation(platform);
  const secrets = [url, decodeURIComponent(new URL(url).password)];
  const environment = { ...env, VERCEL_TELEMETRY_DISABLED: "1" };
  delete environment.DATABASE_URL;
  const result = spawn(command, args, {
    cwd: root, env: environment, input: url, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, shell, windowsHide: true,
  });
  if (result.error) fail(`The Vercel CLI did not start: ${redactSecrets(result.error.message, secrets)}`);
  if (result.status !== 0) {
    const detail = redactSecrets(`${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim(), secrets).slice(0, 600);
    fail(`The Vercel CLI refused DATABASE_URL (exit ${result.status}): ${detail}`);
  }
}

export function readLogins(runner) {
  return parseLogins(runner.query(listSql, { readOnly: true }));
}

function removeLogin(runner, loginName) {
  // Two separate transactions: the lockout commits before the removal, which can fail.
  runner.query(disableSql(loginName), { readOnly: false });
  runner.query(removeSql(loginName), { readOnly: false });
  if (readLogins(runner).some((login) => login.name === loginName)) fail(`Login ${loginName} is disabled but still exists`);
}

async function runCreate(projectRef, io) {
  assertVercelLink(io.projectRoot);
  const runner = createRunner(projectRef, io);
  const loginName = `mmhr_hosted_worker_${io.randomBytes(16).toString("hex")}`;
  let credential = io.randomBytes(32).toString("base64url");
  let url = "";
  let created = false;
  try {
    const removed = Number(runner.query(removeExpiredSql, { readOnly: false })[0]?.removed ?? 0);
    if (removed > 0) io.stderr.write(`Removed ${removed} expired hosted worker login(s).\n`);
    const before = readLogins(runner);
    if (before.length >= 2) {
      fail(`Two hosted worker logins already exist. Remove one first: ${before.map((login) => login.name).join(", ")}. Nothing was changed.`);
    }

    // Set first: a CLI failure after the database commit must still remove the login.
    // Disable and remove are no-ops for a login that does not exist.
    created = true;
    runner.query(createSql(loginName, createScramVerifier(credential)), { readOnly: false });
    const login = readLogins(runner).find((row) => row.name === loginName);
    if (!login || !login.canLogin || login.expired) fail("The new login could not be confirmed");

    url = sessionPoolerUrl(projectRef, loginName, credential);
    credential = "";
    try {
      addVercelDatabaseUrl(url, { spawn: io.spawn, env: io.env, platform: io.platform, root: io.projectRoot });
    } finally {
      url = "";
    }
    created = false;
    const previous = before.filter((row) => row.name !== loginName).map((row) => row.name);
    return [
      `Created hosted worker login ${loginName}, valid until ${login.validUntil}.`,
      `DATABASE_URL for Vercel ${vercelEnvironment} (branch ${vercelGitBranch}) now uses this login as a sensitive value.`,
      "Redeploy the preview to use it.",
      ...previous.map((name) => `After the new preview works, remove the old login: node scripts/hosted-worker-login.mjs remove ${name} --project-ref ${projectRef}`),
    ].join("\n");
  } catch (error) {
    if (created) {
      try {
        removeLogin(runner, loginName);
      } catch (cleanupError) {
        const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        fail(`${error instanceof Error ? error.message : String(error)}\nThe new login ${loginName} could not be removed (${detail}). ` +
          `Run: node scripts/hosted-worker-login.mjs remove ${loginName} --project-ref ${projectRef}`);
      }
      fail(`${error instanceof Error ? error.message : String(error)}\nThe new login ${loginName} was removed. Nothing else was changed.`);
    }
    throw error;
  } finally {
    credential = "";
    url = "";
    runner.close();
  }
}

function runList(projectRef, io) {
  const runner = createRunner(projectRef, io);
  try {
    const logins = readLogins(runner);
    if (logins.length === 0) return "No hosted worker logins exist.";
    return logins.map((login) => `${login.name}  valid until ${login.validUntil ?? "never"}  ` +
      `${login.canLogin && !login.expired ? "active" : login.canLogin ? "expired" : "disabled"}  sessions ${login.sessions}`).join("\n");
  } finally {
    runner.close();
  }
}

function runRemove(projectRef, loginName, io) {
  const runner = createRunner(projectRef, io);
  try {
    if (!readLogins(runner).some((login) => login.name === loginName)) return `Login ${loginName} does not exist. Nothing was changed.`;
    removeLogin(runner, loginName);
    return `Removed hosted worker login ${loginName}. A deployment that still uses it can no longer connect.`;
  } finally {
    runner.close();
  }
}

export function usage() {
  return "Usage: node scripts/hosted-worker-login.mjs <create|list|remove <login-name>> --project-ref <ref>";
}

export async function main(argv = process.argv.slice(2), overrides = {}) {
  const io = {
    stdout: process.stdout, stderr: process.stderr, env: process.env, spawn: spawnSync,
    platform: process.platform, projectRoot, randomBytes: nodeRandomBytes, ...overrides,
  };
  if (argv[0] === "--help" || argv[0] === "-h") {
    io.stdout.write(`${usage()}\n`);
    return;
  }
  if (io.env.NODE_ENV === "production") fail("The hosted worker login command is disabled in production mode");
  const { mode, projectRef, loginName } = parseArguments(argv);
  const output = mode === "create" ? await runCreate(projectRef, io)
    : mode === "list" ? runList(projectRef, io)
      : runRemove(projectRef, loginName, io);
  io.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const detail = error instanceof HostedWorkerLoginError || error instanceof HostedBootstrapError
      ? error.message
      : `Unexpected ${error?.name ?? "error"}: ${error?.message ?? ""}`;
    process.stderr.write(`hosted-worker-login: ${redactSecrets(detail)}\nThe command failed closed. No credential or connection string was printed.\n`);
    process.exitCode = 1;
  });
}
