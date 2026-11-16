#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  descendantPids,
  pidAlive,
  readState,
  repoRoot,
  writeState,
} from "./lib.mjs";
import { isVerificationLaunchCmdline, readProcCmdline, readProcPgid } from "./proc.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateTree(rootPid) {
  const tree = descendantPids(rootPid);
  const pids = [...tree].sort((a, b) => b - a);
  for (const pid of pids) {
    if (!pidAlive(pid)) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process exited between the alive check and the signal.
    }
  }
  return pids;
}

async function waitUntilDead(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !pidAlive(pid))) return true;
    await sleep(250);
  }
  return pids.every((pid) => !pidAlive(pid));
}

function killRemaining(pids) {
  for (const pid of pids) {
    if (!pidAlive(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

async function main() {
  const state = readState();
  if (!state) {
    console.log("verify-mmhr cleanup: no recorded instance");
    return;
  }
  if (state.cleanedAt && !pidAlive(state.pid)) {
    console.log(`verify-mmhr cleanup: already cleaned run=${state.runId}`);
    console.log(`evidence ${state.evidenceDir} exists=${existsSync(state.evidenceDir)}`);
    return;
  }

  if (state.pid && pidAlive(state.pid)) {
    const cmdline = readProcCmdline(state.pid);
    const pgid = readProcPgid(state.pid);
    const recordedPid = state.pid;
    if (!isVerificationLaunchCmdline(cmdline) || pgid !== recordedPid) {
      console.error(
        `Cleanup refused: pid ${state.pid} cmdline=${JSON.stringify(cmdline)} pgid=${pgid} does not match the recorded launch (dev-local.mjs or next dev, pgid == pid ${recordedPid}).`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const signaled = state.pid ? terminateTree(state.pid) : [];
  const dead = await waitUntilDead(signaled, 8000);
  if (!dead) killRemaining(signaled);
  await waitUntilDead(signaled, 3000);

  if (state.startedSupabase) {
    execFileSync("supabase", ["stop"], {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 120000,
    });
  }

  const stillAlive = signaled.filter((pid) => pidAlive(pid));
  writeState({
    ...state,
    cleanedAt: new Date().toISOString(),
    killedPids: signaled,
    stillAlive,
  });

  const evidenceExists = existsSync(state.evidenceDir);
  console.log(`verify-mmhr cleanup run=${state.runId}`);
  console.log(`signaled ${signaled.join(",") || "none"}`);
  console.log(`still_alive ${stillAlive.join(",") || "none"}`);
  console.log(`evidence ${state.evidenceDir} exists=${evidenceExists}`);
  if (!evidenceExists) {
    console.error("Cleanup must never delete evidence. The evidence directory is missing.");
    process.exitCode = 1;
  }
  if (stillAlive.length) {
    console.error("Some launch-tree processes are still alive. Do not kill by process name; inspect the recorded pids.");
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
