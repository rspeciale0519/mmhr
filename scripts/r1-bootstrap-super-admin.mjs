import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import dotenv from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputLimit = 64 * 1024;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) {
  throw new Error(message);
}

function requireUuid(value, name) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    fail(`${name} must be a UUID`);
  }
  return value.toLowerCase();
}

function requireReference(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value) || value.includes("://")) {
    fail(`${name} is invalid`);
  }
  return value;
}

function requireOnlyKeys(value, keys) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail("Bootstrap input contains an unsupported field");
}

/** Validate the local-only endpoints before opening either client. */
export function validateLocalBootstrapEnvironment(env, configText) {
  if (env.NODE_ENV === "production") fail("The bootstrap is disabled in production");
  if (env.R1_BOOTSTRAP_LOCAL !== "1") fail("Set R1_BOOTSTRAP_LOCAL=1 for this local-only command");

  let supabaseUrl;
  let migrationUrl;
  try {
    supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    migrationUrl = new URL(env.MIGRATION_DATABASE_URL ?? "");
  } catch {
    fail("Local Supabase and migration URLs are required");
  }

  if (supabaseUrl.protocol !== "http:" || !loopbackHosts.has(supabaseUrl.hostname) || supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash || !["", "/"].includes(supabaseUrl.pathname)) {
    fail("NEXT_PUBLIC_SUPABASE_URL must use the local loopback Supabase API");
  }
  if (!["postgres:", "postgresql:"].includes(migrationUrl.protocol) || !loopbackHosts.has(migrationUrl.hostname) || migrationUrl.username.length === 0 || migrationUrl.password.length === 0 || migrationUrl.search || migrationUrl.hash) {
    fail("MIGRATION_DATABASE_URL must use a local loopback database");
  }
  if (typeof env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "string" || env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length === 0) {
    fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  }

  const projectId = configText.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const apiPort = configText.match(/\[api\]([\s\S]*?)(?:\r?\n\[|$)/)?.[1]?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
  const databasePort = configText.match(/\[db\]([\s\S]*?)(?:\r?\n\[|$)/)?.[1]?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
  if (projectId !== "mmhr" || !apiPort || !databasePort || supabaseUrl.port !== apiPort || migrationUrl.port !== databasePort) {
    fail("The endpoints do not match the local MMHR Supabase configuration");
  }

  return { supabaseUrl, migrationUrl };
}

export function parseBootstrapInput(raw, mode) {
  if (raw.length > inputLimit) fail("Bootstrap input is too large");
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
    return {
      firstTargetIdentityId,
      secondTargetIdentityId,
      productApprovalReference,
      securityApprovalReference,
      correlationId,
    };
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

export function parseVerifiedClaims(claims, now = Date.now()) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) fail("Auth claims were not verified");
  const subjectId = requireUuid(claims.sub, "Auth subject");
  const sessionId = requireUuid(claims.session_id, "Auth session");
  if (claims.role !== "authenticated" || claims.aal !== "aal2" || !Number.isInteger(claims.exp) || claims.exp * 1000 <= now) {
    fail("Both bootstrap identities require current AAL2 claims");
  }
  return { subjectId, sessionId, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

async function readStandardInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > inputLimit) fail("Bootstrap input is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function verifiedAal2Claims(client, token) {
  try {
    const response = await client.auth.getClaims(token);
    if (response.error || !response.data?.claims) fail("Auth claims were not verified");
    return parseVerifiedClaims(response.data.claims);
  } catch {
    fail("Both bootstrap identities require current AAL2 claims");
  }
}

async function run(mode, input, env) {
  dotenv.config({ path: path.join(projectRoot, ".env.local"), override: false });
  const effectiveEnv = { ...process.env, ...env };
  const configText = readFileSync(path.join(projectRoot, "supabase", "config.toml"), "utf8");
  const { supabaseUrl, migrationUrl } = validateLocalBootstrapEnvironment(effectiveEnv, configText);
  const client = createClient(supabaseUrl.toString().replace(/\/$/, ""), effectiveEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const owner = postgres(migrationUrl.toString(), { max: 1, prepare: true });
  try {
    if (mode === "prepare") {
      await owner`
        SELECT mmhr_private.r1_prepare_super_admin_bootstrap(
          ${input.firstTargetIdentityId}::uuid, ${input.secondTargetIdentityId}::uuid,
          ${input.productApprovalReference}, ${input.securityApprovalReference}, ${input.correlationId}::uuid
        )
      `;
      return "Bootstrap prepared.";
    }

    let firstToken = input.firstAccessToken;
    let secondToken = input.secondAccessToken;
    const firstClaims = await verifiedAal2Claims(client, firstToken);
    firstToken = "";
    delete input.firstAccessToken;
    const secondClaims = await verifiedAal2Claims(client, secondToken);
    secondToken = "";
    delete input.secondAccessToken;
    await owner`
      SELECT mmhr_private.r1_complete_super_admin_bootstrap(
        ${firstClaims.subjectId}::uuid, ${firstClaims.sessionId}::uuid, ${firstClaims.expiresAt}::timestamptz,
        ${secondClaims.subjectId}::uuid, ${secondClaims.sessionId}::uuid, ${secondClaims.expiresAt}::timestamptz,
        ${input.correlationId}::uuid
      )
    `;
    return "Bootstrap completed.";
  } finally {
    await owner.end({ timeout: 5 });
  }
}

function usage() {
  return "Usage: R1_BOOTSTRAP_LOCAL=1 node scripts/r1-bootstrap-super-admin.mjs <prepare|complete> < input.json";
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const mode = argv[0];
  if (mode === "--help" || mode === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (argv.length !== 1 || !["prepare", "complete"].includes(mode)) fail(usage());
  const raw = await readStandardInput();
  if (!raw) fail("Bootstrap input is required on standard input");
  const input = parseBootstrapInput(raw, mode);
  const output = await run(mode, input, env);
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write("Super Admin bootstrap failed closed. No credentials or personal data were printed.\n");
    process.exitCode = 1;
  });
}
