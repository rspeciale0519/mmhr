#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  APP_HOST,
  APP_PORT,
  APP_URL,
  PULSE_HEADING,
  HOLDING_HEADING,
  SUPABASE_API_PORT,
  dockerAvailable,
  evidenceDir,
  ensureDir,
  fetchText,
  newRunId,
  pidAlive,
  portInUse,
  readState,
  readSupabaseStatus,
  repoRoot,
  supabaseAvailable,
  writeState,
  writeText,
} from "./lib.mjs";

function usage() {
  return `Usage: node .cursor/skills/verify-mmhr/scripts/launch.mjs [--stand-in]

Starts one MMHR verification instance at ${APP_URL}.
Full mode needs Docker and the Supabase CLI. --stand-in is only for machines
that cannot start that stack; doctor then reports STAND-IN.`;
}

function parseArgs(argv) {
  const standIn = argv.includes("--stand-in");
  const unknown = argv.filter((arg) => arg !== "--stand-in");
  if (unknown.length) throw new Error(usage());
  return { standIn };
}

function spawnLogged(command, args, env, logPath) {
  ensureDir(path.dirname(logPath));
  const logFd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  return child;
}

async function waitForPulse(timeoutMs, logPath) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await fetchText(APP_URL, 8000);
      const usable = last.status === 200 && last.body.includes(PULSE_HEADING) && !last.body.includes(HOLDING_HEADING);
      if (usable) return last;
    } catch (error) {
      last = { error: error.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  writeText(logPath.replace(/launch\.log$/, "ready-last.json"), JSON.stringify(last, null, 2));
  throw new Error(`Timed out waiting for a usable Pulse page at ${APP_URL}. See ${logPath}.`);
}

function startSupabaseIfNeeded() {
  try {
    const status = readSupabaseStatus();
    const api = new URL(status.API_URL);
    if (api.hostname !== APP_HOST || Number(api.port) !== SUPABASE_API_PORT) {
      throw new Error("A different Supabase stack is using this project. Stop it before verification.");
    }
    return { started: false, status };
  } catch (error) {
    if (String(error.message).includes("different Supabase")) throw error;
  }
  execFileSync("supabase", ["start"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300000,
  });
  return { started: true, status: readSupabaseStatus() };
}

function migrate(status) {
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    cwd: repoRoot,
    env: { ...process.env, MIGRATION_DATABASE_URL: status.DB_URL },
    stdio: "inherit",
    timeout: 180000,
  });
}

async function launchFull(runId) {
  if (!dockerAvailable()) throw new Error("Docker is not available. Start Docker, or use --stand-in only if this machine cannot run the local stack.");
  if (!supabaseAvailable()) throw new Error("The supabase CLI is not on PATH. Install it, or use --stand-in only if this machine cannot run the local stack.");
  if (await portInUse(APP_PORT)) throw new Error(`Port ${APP_PORT} is already in use. Reuse that instance only after doctor passes, or free the port.`);
  const supabase = startSupabaseIfNeeded();
  migrate(supabase.status);
  const logPath = path.join(evidenceDir(runId), "launch.log");
  const child = spawnLogged(process.execPath, ["scripts/dev-local.mjs"], process.env, logPath);
  return {
    mode: "full",
    pid: child.pid,
    logPath,
    startedSupabase: supabase.started,
    standInReason: null,
  };
}

async function launchStandIn(runId) {
  if (await portInUse(APP_PORT)) throw new Error(`Port ${APP_PORT} is already in use. Reuse that instance only after doctor passes, or free the port.`);
  const logPath = path.join(evidenceDir(runId), "launch.log");
  const env = {
    ...process.env,
    PORT: String(APP_PORT),
    NEXT_PUBLIC_APP_URL: APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: `http://${APP_HOST}:${SUPABASE_API_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ["stand-in", "anon", APP_HOST].join("-"),
    NEXT_PUBLIC_BRAND_NAME: "MatchMaker HR",
    MMHR_LAUNCH_CANDIDATE: "A",
    PUBLIC_RELEASE_ENABLED: "0",
    AGENTID_SIGN_IN_ENABLED: "0",
    IDENTITY_INTENT_WORKER_ENABLED: "0",
  };
  const child = spawnLogged(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", APP_HOST, "-p", String(APP_PORT)],
    env,
    logPath,
  );
  return {
    mode: "stand-in",
    pid: child.pid,
    logPath,
    startedSupabase: false,
    standInReason: "Launched next dev without Docker, Supabase, the worker wrapper, or migrations.",
  };
}

async function main() {
  const { standIn } = parseArgs(process.argv.slice(2));
  const existing = readState();
  if (existing?.pid && pidAlive(existing.pid) && existing.cleanedAt == null) {
    throw new Error(`A verification instance is already recorded at pid ${existing.pid} (${existing.runId}). Run doctor, or cleanup first.`);
  }
  const runId = newRunId();
  const dir = evidenceDir(runId);
  ensureDir(dir);
  writeText(path.join(dir, "README.txt"), `MMHR verification evidence for ${runId}. Cleanup must not delete this directory.`);
  const started = standIn ? await launchStandIn(runId) : await launchFull(runId);
  const state = {
    runId,
    mode: started.mode,
    pid: started.pid,
    pgid: started.pid,
    port: APP_PORT,
    url: APP_URL,
    evidenceDir: dir,
    logPath: started.logPath,
    startedSupabase: started.startedSupabase,
    standInReason: started.standInReason,
    startedAt: new Date().toISOString(),
    cleanedAt: null,
  };
  writeState(state);
  try {
    const page = await waitForPulse(180000, started.logPath);
    writeText(path.join(dir, "ready.html"), page.body);
    console.log(`verify-mmhr launch ${started.mode} run=${runId}`);
    console.log(`url ${APP_URL}`);
    console.log(`pid ${started.pid}`);
    console.log(`evidence ${dir}`);
    if (started.standInReason) console.log(`stand-in ${started.standInReason}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
