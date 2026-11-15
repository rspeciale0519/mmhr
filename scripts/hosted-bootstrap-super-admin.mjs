#!/usr/bin/env node
// Two-person Super Admin bootstrap for one named hosted Supabase project.
// It runs the same SQL functions as scripts/r1-bootstrap-super-admin.mjs, but through
// `supabase db query --remote=<ref>` instead of a direct Postgres URL. There is no default target.
//
//   node scripts/hosted-bootstrap-super-admin.mjs session  --project-ref <ref>   (interactive; once per staff member)
//   node scripts/hosted-bootstrap-super-admin.mjs prepare  --project-ref <ref> < prepare.json
//   node scripts/hosted-bootstrap-super-admin.mjs complete --project-ref <ref> < complete.json
//
// Access tokens enter `complete` only on standard input. No step writes a token to the terminal or a log.
// `session` writes its one access token to standard output only when that output is captured.
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

// The owner named this project as the hosted development environment. Add a ref only with approval.
export const allowedProjectRefs = new Set(["mslbuffwyuckfmgoyivj"]);
const modes = new Set(["session", "prepare", "complete"]);
const inputLimit = 64 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Same rule as the local script and the SQL function.
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class HostedBootstrapError extends Error {}

function fail(message) {
  throw new HostedBootstrapError(message);
}

export function requireUuid(value, name) {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail(`${name} must be a UUID`);
  return value.toLowerCase();
}

export function requireReference(value, name) {
  if (typeof value !== "string" || !referencePattern.test(value) || value.includes("://")) fail(`${name} is invalid`);
  return value;
}

export function requireProjectRef(value) {
  if (typeof value !== "string" || !/^[a-z]{20}$/.test(value)) {
    fail("Pass the target explicitly: --project-ref <20-letter project ref>");
  }
  if (!allowedProjectRefs.has(value)) fail(`Project ${value} is not an approved hosted bootstrap target`);
  return value;
}

export function parseArguments(argv) {
  const [mode, ...rest] = argv;
  if (!modes.has(mode)) fail(usage());
  let projectRef;
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--project-ref" && projectRef === undefined) projectRef = rest[++index];
    else if (value.startsWith("--project-ref=") && projectRef === undefined) projectRef = value.slice("--project-ref=".length);
    // Tokens, identities, and approvals never come from arguments.
    else fail("Unsupported argument. Bootstrap values are read from standard input only.");
  }
  return { mode, projectRef: requireProjectRef(projectRef) };
}

function requireOnlyKeys(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail("Bootstrap input contains an unsupported field");
}

/** Same input contract as scripts/r1-bootstrap-super-admin.mjs. */
export function parseBootstrapInput(raw, mode) {
  if (typeof raw !== "string" || raw.length > inputLimit) fail("Bootstrap input is too large");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("Bootstrap input must be one JSON object");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Bootstrap input must be one JSON object");

  const correlationId = requireUuid(value.correlationId, "correlationId");
  if (mode === "prepare") {
    requireOnlyKeys(value, ["firstTargetIdentityId", "secondTargetIdentityId", "productApprovalReference", "securityApprovalReference", "correlationId"]);
    const firstTargetIdentityId = requireUuid(value.firstTargetIdentityId, "firstTargetIdentityId");
    const secondTargetIdentityId = requireUuid(value.secondTargetIdentityId, "secondTargetIdentityId");
    if (firstTargetIdentityId === secondTargetIdentityId) fail("Bootstrap targets must be distinct");
    const productApprovalReference = requireReference(value.productApprovalReference, "productApprovalReference");
    const securityApprovalReference = requireReference(value.securityApprovalReference, "securityApprovalReference");
    if (productApprovalReference === securityApprovalReference) fail("Product and security approvals must be distinct");
    return { firstTargetIdentityId, secondTargetIdentityId, productApprovalReference, securityApprovalReference, correlationId };
  }
  if (mode === "complete") {
    requireOnlyKeys(value, ["firstAccessToken", "secondAccessToken", "correlationId"]);
    if (typeof value.firstAccessToken !== "string" || value.firstAccessToken.length < 20 || value.firstAccessToken.length > 8192 ||
      typeof value.secondAccessToken !== "string" || value.secondAccessToken.length < 20 || value.secondAccessToken.length > 8192) {
      fail("Both current AAL2 access tokens are required in standard input");
    }
    if (value.firstAccessToken === value.secondAccessToken) fail("Bootstrap tokens must be distinct");
    return { firstAccessToken: value.firstAccessToken, secondAccessToken: value.secondAccessToken, correlationId };
  }
  fail("Use prepare or complete mode");
}

/** Same claim rules as the local script, plus the issuer of the named hosted project. */
export function parseVerifiedClaims(claims, issuer, now = Date.now()) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) fail("Auth claims were not verified");
  const subjectId = requireUuid(claims.sub, "Auth subject");
  const sessionId = requireUuid(claims.session_id, "Auth session");
  if (claims.role !== "authenticated" || claims.aal !== "aal2" || !Number.isInteger(claims.exp) || claims.exp * 1000 <= now) {
    fail("Both bootstrap identities require current AAL2 claims");
  }
  if (claims.iss !== issuer) fail("The access token was not issued by the named project");
  return { subjectId, sessionId, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

// The CLI has no bind parameters. Every value is validated again here, and the allowed
// characters exclude quotes and backslashes, so a literal cannot end early.
function literal(text) {
  if (/['\\\0]/.test(text)) fail("Refusing an unsafe SQL value");
  return `'${text}'`;
}
export function sqlUuid(value, name = "value") {
  return `${literal(requireUuid(value, name))}::uuid`;
}
export function sqlReference(value, name = "reference") {
  return `${literal(requireReference(value, name))}::text`;
}
export function sqlTimestamp(value, name = "timestamp") {
  if (typeof value !== "string" || !isoTimestampPattern.test(value) || new Date(value).toISOString() !== value) {
    fail(`${name} must be an ISO timestamp`);
  }
  return `${literal(value)}::timestamptz`;
}

export function prepareSql(input) {
  return `SELECT 'prepared' AS result FROM (SELECT mmhr_private.r1_prepare_super_admin_bootstrap(
  ${sqlUuid(input.firstTargetIdentityId, "firstTargetIdentityId")}, ${sqlUuid(input.secondTargetIdentityId, "secondTargetIdentityId")},
  ${sqlReference(input.productApprovalReference, "productApprovalReference")}, ${sqlReference(input.securityApprovalReference, "securityApprovalReference")},
  ${sqlUuid(input.correlationId, "correlationId")}
)) AS called;\n`;
}

export function completeSql(first, second, correlationId) {
  return `SELECT 'completed' AS result FROM (SELECT mmhr_private.r1_complete_super_admin_bootstrap(
  ${sqlUuid(first.subjectId)}, ${sqlUuid(first.sessionId)}, ${sqlTimestamp(first.expiresAt)},
  ${sqlUuid(second.subjectId)}, ${sqlUuid(second.sessionId)}, ${sqlTimestamp(second.expiresAt)},
  ${sqlUuid(correlationId, "correlationId")}
)) AS called;\n`;
}

export const bootstrapStateSql = `SELECT json_build_object(
  'rows', (SELECT count(*) FROM public.security_bootstrap_state),
  'state', (SELECT b.state::text FROM public.security_bootstrap_state b WHERE b.singleton_key = 1),
  'firstTarget', (SELECT b.target_identity_id FROM public.security_bootstrap_state b WHERE b.singleton_key = 1),
  'secondTarget', (SELECT b.second_target_identity_id FROM public.security_bootstrap_state b WHERE b.singleton_key = 1),
  'firstSubject', (SELECT i.auth_user_id FROM public.security_bootstrap_state b
    JOIN public.identities i ON i.id = b.target_identity_id WHERE b.singleton_key = 1),
  'secondSubject', (SELECT i.auth_user_id FROM public.security_bootstrap_state b
    JOIN public.identities i ON i.id = b.second_target_identity_id WHERE b.singleton_key = 1),
  'activePlatformRoles', (SELECT count(*) FROM public.platform_role_assignments a WHERE a.state = 'active')
) AS state;\n`;

/** Refuses a consumed bootstrap and any step that does not match the current state. */
export function checkBootstrapState(state, mode) {
  if (!state || typeof state !== "object") fail("Could not read the bootstrap state");
  if (state.state === "consumed") fail("The bootstrap is already consumed on this project. Nothing was changed.");
  if (Number(state.activePlatformRoles) !== 0) fail("Active platform roles already exist. Nothing was changed.");
  if (mode === "prepare" && Number(state.rows) !== 0) {
    fail("The bootstrap is already prepared. Run complete, or review the prepared identities.");
  }
  if (mode === "complete" && state.state !== "prepared") fail("The bootstrap is not prepared. Run prepare first.");
  return state;
}

/** Checks that each token belongs to the prepared identity in the same position. */
export function checkTokenOrder(state, firstClaims, secondClaims) {
  const firstSubject = String(state.firstSubject ?? "").toLowerCase();
  const secondSubject = String(state.secondSubject ?? "").toLowerCase();
  if (firstClaims.subjectId === secondSubject && secondClaims.subjectId === firstSubject) {
    fail("The tokens are in the wrong order. firstAccessToken must belong to firstTargetIdentityId.");
  }
  if (firstClaims.subjectId !== firstSubject || secondClaims.subjectId !== secondSubject) {
    fail("The tokens do not belong to the two prepared identities.");
  }
}

// Never echo credentials that a CLI or database message could carry.
export function redact(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-connection-string]")
    .replace(/\bsbp_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/\b(?:sb_secret|sb_publishable)_[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/<!DOCTYPE[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*/i, "HTML error page: $1");
}

function cliEnvironment(env) {
  const environment = { ...env };
  // A stale exported token overrides the operator's CLI login on the owner machine.
  delete environment.SUPABASE_ACCESS_TOKEN;
  delete environment.SUPABASE_YES;
  return environment;
}

function runCli(spawn, args, env, workdir) {
  const result = spawn("supabase", [...args, "--workdir", workdir, "--output-format", "json"], {
    cwd: workdir, env: cliEnvironment(env), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (result.error) fail(`Supabase CLI did not start: ${redact(result.error.message)}`);
  return result;
}

/** Runs SQL on the named project. An empty work directory keeps the CLI away from supabase/config.toml. */
export function createRunner(projectRef, { spawn = spawnSync, env = process.env } = {}) {
  const workdir = mkdtempSync(path.join(tmpdir(), "mmhr-hosted-bootstrap-"));
  let counter = 0;
  return {
    workdir,
    query(sql, { readOnly }) {
      counter += 1;
      const file = path.join(workdir, `query-${counter}.sql`);
      writeFileSync(file, sql, "utf8");
      let result;
      try {
        result = runCli(spawn, ["db", "query", `--remote=${projectRef}`, readOnly ? "--read-only" : "--yes", "-f", file], env, workdir);
      } finally {
        rmSync(file, { force: true });
      }
      const stderr = result.stderr ?? "";
      // The CLI prints the resolved target on stderr. Refuse output for another project.
      const target = stderr.match(/Target: project [^\r\n]*/)?.[0] ?? "";
      if (!target.includes(projectRef)) fail(`CLI did not confirm target ${projectRef}: ${redact(stderr.trim())}`);
      let parsed;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        fail(`Unreadable CLI output (exit ${result.status}): ${redact(stderr.trim())}`);
      }
      if (result.status !== 0 || parsed._tag === "Error" || parsed.error) {
        fail(`The query was refused: ${redact(parsed.error?.message ?? JSON.stringify(parsed))}`);
      }
      return parsed.rows ?? [];
    },
    close() {
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

export function readBootstrapState(runner) {
  const [row] = runner.query(bootstrapStateSql, { readOnly: true });
  const state = typeof row?.state === "string" ? JSON.parse(row.state) : row?.state;
  if (!state || typeof state !== "object") fail("Could not read the bootstrap state");
  return state;
}

/** Picks only the public (publishable or legacy anon) key. The listing also holds a full service_role key. */
export function selectPublicApiKey(listing, projectRef) {
  if (listing?.target?.project_ref !== projectRef || !Array.isArray(listing.keys)) {
    fail(`The API key listing is not for project ${projectRef}`);
  }
  const publishable = listing.keys.find((key) => key?.type === "publishable" && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key.api_key ?? ""));
  const anon = listing.keys.find((key) => key?.type === "legacy" && key?.name === "anon" && typeof key.api_key === "string" && key.api_key.length > 20);
  const key = publishable ?? anon;
  if (!key) fail("No publishable key was found for the project");
  return key.api_key;
}

export function resolvePublicApi(projectRef, { spawn = spawnSync, env = process.env } = {}) {
  const workdir = mkdtempSync(path.join(tmpdir(), "mmhr-hosted-keys-"));
  try {
    // No --reveal: secret keys stay masked. Raw output is never printed because it holds the legacy service_role key.
    const result = runCli(spawn, ["projects", "api-keys", `--remote=${projectRef}`], env, workdir);
    let listing;
    try {
      listing = JSON.parse(result.stdout);
    } catch {
      fail(`Could not read the API keys (exit ${result.status}): ${redact(result.stderr ?? "")}`);
    }
    const url = `https://${projectRef}.supabase.co`;
    return { url, key: selectPublicApiKey(listing, projectRef), issuer: `${url}/auth/v1` };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function authClient(factory, api) {
  return factory(api.url, api.key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

async function verifiedAal2Claims(client, token, issuer) {
  let response;
  try {
    response = await client.auth.getClaims(token);
  } catch {
    fail("Both bootstrap identities require current AAL2 claims");
  }
  if (response?.error || !response?.data?.claims) fail("Both bootstrap identities require current AAL2 claims");
  return parseVerifiedClaims(response.data.claims, issuer);
}

export async function readStandardInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > inputLimit) fail("Bootstrap input is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "").trim();
}

/** Reads one line from an interactive terminal. Hidden input echoes nothing. */
function readTerminalLine(stdin, stderr, question, { hidden = false } = {}) {
  stderr.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") return finish(new HostedBootstrapError("Stopped by the operator"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0 && !hidden) stderr.write("\b \b");
          value = value.slice(0, -1);
        } else if (character >= " " && value.length < 1024) {
          value += character;
          if (!hidden) stderr.write(character);
        }
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** Credentials come only from a terminal, and the token goes only to captured output. */
export function assertSessionTerminal(io) {
  if (!io.stdin.isTTY || typeof io.stdin.setRawMode !== "function") {
    fail("The session step needs an interactive terminal. Credentials are never read from a pipe or a file.");
  }
  if (io.stdout.isTTY) {
    fail("Capture the output in a variable, for example: $first = node scripts/hosted-bootstrap-super-admin.mjs session --project-ref <ref>");
  }
}

async function runSession(api, io) {
  assertSessionTerminal(io);
  const client = authClient(io.createClient, api);
  const email = (await readTerminalLine(io.stdin, io.stderr, "Staff email: ")).trim();
  let password = await readTerminalLine(io.stdin, io.stderr, "Password (hidden): ", { hidden: true });
  const signIn = await client.auth.signInWithPassword({ email, password });
  password = "";
  if (signIn.error || !signIn.data?.session) fail("Sign-in failed. Check the email, the password, and that the user is confirmed.");

  const factors = await client.auth.mfa.listFactors();
  if (factors.error) fail("Could not read the MFA factors");
  let factorId = (factors.data?.totp ?? []).find((factor) => factor.status === "verified")?.id;
  if (!factorId) {
    const enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `MMHR staff ${new Date().toISOString()}` });
    if (enrollment.error || !enrollment.data) fail("Could not start TOTP enrollment. Check that TOTP MFA is enabled.");
    factorId = enrollment.data.id;
    // The operator must copy this setup key into an authenticator app once. It is shown only on this terminal.
    io.stderr.write(`\nAdd this account to your authenticator app with manual entry.\nSetup key: ${enrollment.data.totp.secret}\n\n`);
  }
  const code = (await readTerminalLine(io.stdin, io.stderr, "Six digit code from the authenticator app: ")).trim();
  if (!/^\d{6}$/.test(code)) fail("The code must have six digits");
  const verified = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (verified.error) fail("The code was not accepted. Wait for the next code and run the step again.");

  // The verify response carries the new AAL2 access token; getClaims below verifies it.
  const token = verified.data?.access_token;
  if (typeof token !== "string") fail("No session was returned");
  const claims = await verifiedAal2Claims(client, token, api.issuer);
  const sync = await client.rpc("mmhr_sync_my_identity", { correlation_id: randomUUID() });
  if (sync.error || !sync.data) fail("Could not create or read the identity record");
  const identityId = requireUuid(sync.data.identityId, "identityId");
  if (!["pending", "active"].includes(sync.data.status)) fail("The identity is not usable for the bootstrap");
  io.stderr.write(`Identity id: ${identityId}\nThe session is valid until ${claims.expiresAt}. Run complete before that time.\n`);
  io.stdout.write(`${token}\n`);
}

async function runPrepare(projectRef, input, io) {
  const runner = createRunner(projectRef, io);
  try {
    checkBootstrapState(readBootstrapState(runner), "prepare");
    runner.query(prepareSql(input), { readOnly: false });
    const state = readBootstrapState(runner);
    if (state.state !== "prepared" || state.firstTarget !== input.firstTargetIdentityId || state.secondTarget !== input.secondTargetIdentityId) {
      fail("The prepared state does not match the input");
    }
    return "Bootstrap prepared.";
  } finally {
    runner.close();
  }
}

async function runComplete(projectRef, api, input, io) {
  const runner = createRunner(projectRef, io);
  try {
    const before = checkBootstrapState(readBootstrapState(runner), "complete");
    const client = authClient(io.createClient, api);
    const firstClaims = await verifiedAal2Claims(client, input.firstAccessToken, api.issuer);
    delete input.firstAccessToken;
    const secondClaims = await verifiedAal2Claims(client, input.secondAccessToken, api.issuer);
    delete input.secondAccessToken;
    checkTokenOrder(before, firstClaims, secondClaims);
    runner.query(completeSql(firstClaims, secondClaims, input.correlationId), { readOnly: false });
    const after = readBootstrapState(runner);
    if (after.state !== "consumed" || Number(after.activePlatformRoles) !== 2) fail("The completed state could not be confirmed");
    return "Bootstrap completed. Two Super Admins are active.";
  } finally {
    runner.close();
  }
}

export function usage() {
  return "Usage: node scripts/hosted-bootstrap-super-admin.mjs <session|prepare|complete> --project-ref <ref> [< input.json]";
}

export async function main(argv = process.argv.slice(2), overrides = {}) {
  const io = {
    stdin: process.stdin, stdout: process.stdout, stderr: process.stderr,
    env: process.env, spawn: spawnSync, createClient, ...overrides,
  };
  if (argv[0] === "--help" || argv[0] === "-h") {
    io.stdout.write(`${usage()}\n`);
    return;
  }
  if (io.env.NODE_ENV === "production") fail("The bootstrap is disabled in production mode");
  const { mode, projectRef } = parseArguments(argv);

  let input;
  if (mode === "session") assertSessionTerminal(io);
  else {
    const raw = await readStandardInput(io.stdin);
    if (!raw) fail("Bootstrap input is required on standard input");
    input = parseBootstrapInput(raw, mode);
  }
  if (mode === "prepare") {
    io.stdout.write(`${await runPrepare(projectRef, input, io)}\n`);
    return;
  }
  const api = resolvePublicApi(projectRef, io);
  if (mode === "session") await runSession(api, io);
  else io.stdout.write(`${await runComplete(projectRef, api, input, io)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const detail = error instanceof HostedBootstrapError
      ? error.message
      : `Unexpected ${error?.name ?? "error"}: ${error?.message ?? ""}`;
    process.stderr.write(`hosted-bootstrap: ${redact(detail)}\nThe bootstrap failed closed. No token, key, or password was printed.\n`);
    process.exitCode = 1;
  });
}
