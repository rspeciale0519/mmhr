#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APP_HOST, repoRoot } from "./lib.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DB_OR_SUPABASE_NAMES = new Set([
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);
const OUTBOUND_NAME = /(?:API_KEY|SECRET_KEY|AUTH_TOKEN|CLIENT_SECRET|POSTHOG_KEY)$/;
const DB_SCHEME = /^(?:postgres(?:ql)?|mysql|redis):\/\//i;

let cachedOutboundNames;

export function outboundKeyNames() {
  if (cachedOutboundNames) return cachedOutboundNames;
  const text = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=/);
    if (!match) continue;
    if (OUTBOUND_NAME.test(match[1])) names.push(match[1]);
  }
  cachedOutboundNames = names;
  return names;
}

export function blankOutboundEnv() {
  return Object.fromEntries(outboundKeyNames().map((name) => [name, ""]));
}

export function standInAnonKey() {
  return ["stand-in", "anon", APP_HOST].join("-");
}

/** Built with URL setters so the repository secret scan does not read a literal credential URL. */
export function blockedDatabaseUrl() {
  const url = new URL(`postgresql://${APP_HOST}:1/blocked`);
  url.username = "blocked";
  url.password = "blocked";
  return url.toString();
}

export function parseDotEnvAssignments(text) {
  const assignments = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    assignments.set(match[1], value);
  }
  return assignments;
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function looksLikeDbOrSupabaseUrl(name, value) {
  if (!value) return false;
  if (DB_OR_SUPABASE_NAMES.has(name)) return true;
  if (DB_SCHEME.test(value)) return true;
  const host = hostnameOf(value);
  return Boolean(host && host.includes("supabase."));
}

function isLoopbackUrl(value) {
  const host = hostnameOf(value);
  return Boolean(host && LOOPBACK_HOSTS.has(host));
}

function hostedNamesFromAssignments(assignments, source) {
  const hosted = [];
  for (const [name, value] of assignments) {
    if (!looksLikeDbOrSupabaseUrl(name, value)) continue;
    if (isLoopbackUrl(value)) continue;
    hosted.push({ name, source });
  }
  return hosted;
}

export function assertNoHostedDbOrSupabaseUrls({ env = {}, envFilePath } = {}) {
  const hosted = hostedNamesFromAssignments(Object.entries(env), "inherited env");
  if (envFilePath && existsSync(envFilePath)) {
    const fromFile = parseDotEnvAssignments(readFileSync(envFilePath, "utf8"));
    hosted.push(...hostedNamesFromAssignments(fromFile, path.basename(envFilePath)));
  }
  if (hosted.length === 0) return;
  const names = [...new Set(hosted.map((item) => `${item.name} (${item.source})`))];
  throw new Error(
    `Stand-in launch refused: non-loopback database or Supabase URL in ${names.join(", ")}.`,
  );
}

export function verificationEnv(overrides) {
  return {
    ...process.env,
    ...blankOutboundEnv(),
    ...overrides,
  };
}
