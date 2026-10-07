import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function localDevelopmentEnvironment(stack, config, args = []) {
  if (args.length && (args.length !== 2 || args[0] !== "--port")) throw new Error("Use --port followed by a local port.");
  const port = args[1] ?? "3000";
  if (!/^\d{4,5}$/.test(port) || Number(port) > 65535 || Number(port) < 1024) throw new Error("Use a port from 1024 to 65535.");
  const configuredPort = section => config.match(new RegExp(`\\[${section}\\]([\\s\\S]*?)(?:\\r?\\n\\[|$)`))?.[1].match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
  let database, api;
  try { database = new URL(stack.DB_URL); api = new URL(stack.API_URL); }
  catch { throw new Error("The local Supabase endpoints are unavailable."); }
  if (database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1" || database.port !== configuredPort("db") ||
      api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== configuredPort("api") || !stack.ANON_KEY) {
    throw new Error("Supabase must use this project's configured local ports.");
  }
  return {
    MIGRATION_DATABASE_URL: stack.DB_URL,
    NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.ANON_KEY,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    PORT: port,
  };
}

async function portInUse(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", error => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(new Error("Could not check the local application port."));
    });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("The local port check timed out.")); });
  });
}

async function start() {
  let stack;
  try {
    const status = execFileSync(process.platform === "win32" ? "supabase.exe" : "supabase", ["status", "-o", "json"], {
      cwd: projectRoot, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 20000,
    });
    stack = JSON.parse(status);
  } catch { throw new Error("Start Docker Desktop and run supabase start in this project. Then retry npm run dev:local."); }
  const environment = localDevelopmentEnvironment(stack, readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"), process.argv.slice(2));
  if (await portInUse(environment.PORT)) throw new Error(`Port ${environment.PORT} is already in use. Reuse the existing server or select another port.`);
  console.log(`Starting MMHR at ${environment.NEXT_PUBLIC_APP_URL} with local Supabase.`);
  const child = spawn(process.execPath, ["scripts/r1-with-local-worker.mjs", "--", "node", "node_modules/next/dist/bin/next", "dev"], {
    cwd: projectRoot, env: { ...process.env, ...environment }, stdio: "inherit", windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  child.once("error", () => { console.error("The local development server could not start."); process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 1; });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
