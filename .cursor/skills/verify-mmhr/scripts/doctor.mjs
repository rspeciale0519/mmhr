#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  APP_PORT,
  APP_URL,
  HOLDING_HEADING,
  PULSE_HEADING,
  SIGN_IN_HEADING,
  SUPABASE_API_PORT,
  descendantPids,
  fetchText,
  pidAlive,
  portOwnerPids,
  readState,
  readSupabaseStatus,
} from "./lib.mjs";

function line(key, value) {
  console.log(`${key}: ${value}`);
}

async function main() {
  const state = readState();
  if (!state || state.cleanedAt) {
    console.log("VERIFY-MMHR DOCTOR");
    line("ready", "no");
    line("reason", "No live verification instance. Run launch first.");
    process.exitCode = 1;
    return;
  }

  const problems = [];
  const alive = pidAlive(state.pid);
  if (!alive) problems.push(`recorded pid ${state.pid} is not running`);

  const descendants = alive ? descendantPids(state.pid) : new Set();
  const owners = portOwnerPids(APP_PORT);
  const ownedByUs = [...owners].some((pid) => descendants.has(pid));
  if (owners.size === 0) problems.push(`nothing is listening on ${APP_PORT}`);
  else if (!ownedByUs) problems.push(`port ${APP_PORT} is owned by pid(s) ${[...owners].join(",")}, not the launch tree`);

  let home;
  try {
    home = await fetchText(APP_URL);
  } catch (error) {
    problems.push(`GET / failed: ${error.message}`);
  }
  if (home) {
    if (home.status !== 200) problems.push(`GET / returned ${home.status}`);
    if (!home.body.includes(PULSE_HEADING)) problems.push("Pulse heading missing from /");
    if (home.body.includes(HOLDING_HEADING)) problems.push("public-release holding page is serving /; use next dev, not next start");
  }

  let signIn;
  try {
    signIn = await fetchText(`${APP_URL}/sign-in`);
  } catch (error) {
    problems.push(`GET /sign-in failed: ${error.message}`);
  }
  if (signIn) {
    if (signIn.status !== 200) problems.push(`GET /sign-in returned ${signIn.status}`);
    if (!signIn.body.includes(SIGN_IN_HEADING)) problems.push("Sign in heading missing from /sign-in");
  }

  if (state.mode === "full") {
    try {
      const status = readSupabaseStatus();
      const api = new URL(status.API_URL);
      if (api.hostname !== "127.0.0.1" || Number(api.port) !== SUPABASE_API_PORT) {
        problems.push("Supabase API is not this project's local stack");
      }
      if (!status.ANON_KEY) problems.push("Supabase ANON_KEY is missing");
    } catch {
      problems.push("supabase status failed; the local stack is not usable");
    }
  }

  const ready = problems.length === 0;
  console.log("VERIFY-MMHR DOCTOR");
  line("ready", ready ? "yes" : "no");
  line("mode", state.mode);
  line("run", state.runId);
  line("url", state.url);
  line("pid", String(state.pid));
  line("pid_alive", alive ? "yes" : "no");
  line("port", String(APP_PORT));
  line("port_owners", [...owners].join(",") || "none");
  line("port_owned_by_launch", ownedByUs ? "yes" : "no");
  line("pulse_heading", home?.body.includes(PULSE_HEADING) ? "present" : "absent");
  line("holding_page", home?.body.includes(HOLDING_HEADING) ? "present" : "absent");
  line("sign_in", signIn?.body.includes(SIGN_IN_HEADING) ? "present" : "absent");
  line("evidence", state.evidenceDir);
  if (state.standInReason) line("stand_in", state.standInReason);
  if (!ready) {
    for (const problem of problems) line("problem", problem);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
