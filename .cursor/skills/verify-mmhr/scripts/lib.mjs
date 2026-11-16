#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "src/app"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not find the MMHR repository root from the verification helpers.");
}

export const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = findRepoRoot(skillRoot);
export const evidenceRoot = path.join(repoRoot, "artifacts/verify-mmhr");
export const runDir = path.join(evidenceRoot, ".run");
export const statePath = path.join(runDir, "current.json");

export const APP_HOST = "127.0.0.1";
export const APP_PORT = 3100;
export const APP_URL = `http://${APP_HOST}:${APP_PORT}`;
export const SUPABASE_API_PORT = 57021;
export const SUPABASE_DB_PORT = 57022;
export const INBUCKET_PORT = 57024;
export const PULSE_HEADING = "Compare HR software options with vendor names hidden.";
export const HOLDING_HEADING = "This site is not available yet.";
export const SIGN_IN_HEADING = "Sign in";
export const PLACEHOLDER_ANON_KEY = "verification-placeholder-anon-key";

export function evidenceDir(runId) {
  return path.join(evidenceRoot, runId);
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function readState() {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8"));
}

export function writeState(state) {
  ensureDir(runDir);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function descendantPids(rootPid) {
  const found = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.pop();
    let text = "";
    try {
      text = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8");
    } catch {
      continue;
    }
    for (const token of text.trim().split(/\s+/).filter(Boolean)) {
      const child = Number(token);
      if (!found.has(child)) {
        found.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}

function parseHexIpPort(value) {
  const [ipHex, portHex] = value.split(":");
  if (!ipHex || !portHex) return null;
  return Number.parseInt(portHex, 16);
}

function listeningInodes(port) {
  const inodes = new Set();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(table)) continue;
    const lines = readFileSync(table, "utf8").trim().split("\n").slice(1);
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      if (cols[3] !== "0A") continue;
      if (parseHexIpPort(cols[1]) !== port) continue;
      inodes.add(cols[9]);
    }
  }
  return inodes;
}

function pidsHoldingSocketInodes(inodes) {
  const pids = new Set();
  if (inodes.size === 0) return pids;
  let procEntries;
  try {
    procEntries = readdirSync("/proc");
  } catch {
    return pids;
  }
  for (const entry of procEntries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    let fds;
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let target = "";
      try {
        target = readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch {
        continue;
      }
      const match = target.match(/^socket:\[(\d+)\]$/);
      if (match && inodes.has(match[1])) pids.add(pid);
    }
  }
  return pids;
}

export function portOwnerPids(port) {
  const inodes = listeningInodes(port);
  if (inodes.size > 0) return pidsHoldingSocketInodes(inodes);
  try {
    const out = execFileSync("ss", ["-ltnp"], { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes(`:${port} `) && !line.endsWith(`:${port}`)) continue;
      for (const match of line.matchAll(/pid=(\d+)/g)) pids.add(Number(match[1]));
    }
    return pids;
  } catch {
    return new Set();
  }
}

export function portInUse(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: APP_HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error(`Timed out checking ${APP_HOST}:${port}`));
    });
  });
}

export async function fetchText(url, timeoutMs = 8000) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
  });
  const body = await response.text();
  return { url, status: response.status, headers: Object.fromEntries(response.headers), body };
}

export function supabaseAvailable() {
  try {
    execFileSync("supabase", ["--version"], { stdio: "ignore", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export function readSupabaseStatus() {
  const raw = execFileSync("supabase", ["status", "-o", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

export function commandExists(name) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [name] : ["-v", name], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function newRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `run-${stamp}`;
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`);
}
