import { createOriginalVerificationExecutor, verifyOriginalVerificationCandidates } from '@/server/workflows/original-verification-executor';
import { createOriginalVerifierSockets } from '@/server/workflows/original-verification-sockets';
import type { Socket } from 'node:net';
import { spawn } from "node:child_process";
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { getFreeScratchPort } from "./test/rehearsal-port";
import { selectRfpReceiptMigration } from "./test/r4-rfp-receipt-migration-selection";
import { selectTaskRequestMigration } from "./test/r8-task-request-migration-selection";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  createScratchNetwork, removeScratchNetwork, verifyScratchApiBindings, verifyScratchDatabaseBindings,
  verifyScratchNetworkIfPresent, resolveLocalDockerEndpoint, type ScratchNetwork,
} from "@/server/auth/security-command-api-isolation";
import { startScratchDockerGuard } from "@/server/auth/security-command-api-docker-guard";
import { assertScratchCliVersions, disableScratchSchemaCache, disableScratchService, resolveScratchGoCompanion } from "@/server/auth/security-command-api-cli";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const excludedServices = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");
const cliEnvironmentNames = new Set(
  [
    "APPDATA",
    "CI",
    "COMSPEC",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "HOME",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PROGRAMDATA",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
  ].map((name) => name.toLowerCase()),
);

export type RehearsalContext = Awaited<ReturnType<typeof startRehearsal>>;
export type RehearsalApi = Readonly<{ url: string; publicKey: string; adminKey: string }>;
export type RestrictedRehearsal = Readonly<{
  context: RehearsalContext;
  workerUrl: string;
  close: () => Promise<void>;
}>;
const activeRestrictedRehearsals = new WeakSet<RestrictedRehearsal>();
type OwnedRehearsalAddress = Readonly<{
  label: string; projectId: string; databaseUrl: string; databasePort: number; apiLoopbackOnly: boolean;
  scratchRoot: string; configDigest: string; db: object; client: object;
}>;
const activeRehearsalContexts = new WeakMap<object, OwnedRehearsalAddress>();

function assertDocumentRehearsal(context: RehearsalContext, kind: "worker" | "observer") {
  const owned = activeRehearsalContexts.get(context);
  if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1" || !owned) {
    throw new Error("An active owned document database rehearsal is required");
  }
  const address = new URL(owned.databaseUrl);
  const expectedPurpose = kind === "observer" ? owned.label === "r4-document-uploads"
    : ["commandapi", "r4-document-worker"].includes(owned.label);
  // The lifecycle removes punctuation and truncates labels to ten characters.
  // Worker and upload project names collide; retain their actual purpose instead.
  if (!expectedPurpose || !/^mmhr-r1-(?:commandapi|r4document)-[0-9a-f]{8}$/.test(owned.projectId)
    || context.projectId !== owned.projectId || context.databaseUrl !== owned.databaseUrl
    || context.ports.database !== owned.databasePort || context.apiLoopbackOnly !== owned.apiLoopbackOnly
    || address.protocol !== "postgresql:" || address.hostname !== "127.0.0.1" || address.port !== String(owned.databasePort)
    || address.pathname !== "/postgres" || address.username !== "postgres" || address.search || address.hash
    || [3000,5432,57022].includes(owned.databasePort)
    || (owned.projectId.includes("-commandapi-") && (!context.api || !owned.apiLoopbackOnly))) {
    throw new Error("An active owned document database rehearsal is required");
  }
  return owned;
}

/** Keep all driver construction inside the existing test-only database boundary. */
export async function openDocumentRehearsalWorker(context: RehearsalContext, loginName: string, credential: string) {
  const owned = assertDocumentRehearsal(context, "worker");
  if (!/^mmhr_document_worker_[0-9a-f]{32}$/.test(loginName) || !/^[A-Za-z0-9_-]{43}$/.test(credential)) {
    throw new Error("Invalid disposable document worker credentials");
  }
  const address = new URL(owned.databaseUrl); address.username = loginName; address.password = credential;
  const client = postgres(address.toString(), { max: 1 });
  try {
    const [role] = await client`SELECT current_user AS role,session_user AS session`;
    if (role?.role !== loginName || role?.session !== loginName) throw new Error("Disposable document worker role mismatch");
    await client`SELECT version_id FROM mmhr_private.r4_list_document_scan_candidates()`;
    return { client, db: drizzle(client), close: () => client.end({ timeout: 5 }) };
  } catch {
    await client.end({ timeout: 5 });
    throw new Error("Disposable document worker connection validation failed");
  }
}

export function openDocumentRehearsalObserver(context: RehearsalContext) {
  const owned = assertDocumentRehearsal(context, "observer");
  const client = postgres(owned.databaseUrl, { max: 1 });
  return { client, close: () => client.end({ timeout: 5 }) };
}

export function assertRestrictedRehearsal(value: RestrictedRehearsal) {
  if (process.env.NODE_ENV !== "test" || !activeRestrictedRehearsals.has(value)
    || !value.context.api || !value.context.apiLoopbackOnly) {
    throw new Error("An active guarded security rehearsal is required");
  }
}

// The five original security suites use this same isolated lifecycle as newer suites.
// No caller-supplied URL can widen their fixture access to another local database.
export async function startRestrictedRehearsal(label: string): Promise<RestrictedRehearsal> {
  if (process.env.NODE_ENV !== "test") throw new Error("Security rehearsals are test-only");
  const context = await startRehearsal(label, { api: true });
  const login = `mmhr_worker_${randomBytes(16).toString("hex")}`;
  let provisioned = false;
  let renewal: ReturnType<typeof setInterval> | undefined;
  let renewalFailure = false;
  let renewalRequest: Promise<void> | undefined;
  try {
    if (!context.api || !context.apiLoopbackOnly) throw new Error("An isolated local API is required");
    Object.freeze(context.api);
    Object.freeze(context);
    await applyAllMigrations(context);
    await context.client`NOTIFY pgrst,'reload schema'`;
    const credential = randomBytes(32).toString("base64url"), salt = randomBytes(16);
    const salted = pbkdf2Sync(credential, salt, 4096, 32, "sha256");
    const clientKey = createHmac("sha256", salted).update("Client Key").digest();
    const verifier = `SCRAM-SHA-256$4096:${salt.toString("base64")}$${createHash("sha256").update(clientKey).digest("base64")}:${createHmac("sha256", salted).update("Server Key").digest("base64")}`;
    await context.client`SELECT mmhr_private.r1_create_ephemeral_worker_login(${login},${verifier},${new Date(Date.now() + 300000).toISOString()}::timestamptz)`;
    provisioned = true;
    const url = new URL(context.databaseUrl);
    url.username = login;
    url.password = credential;
    const result: RestrictedRehearsal = Object.freeze({ context, workerUrl: url.toString(), close: async () => {
      activeRestrictedRehearsals.delete(result);
      if (renewal) clearInterval(renewal);
      await renewalRequest;
      try {
        await context.client`SELECT mmhr_private.r1_disable_ephemeral_worker_login(${login})`;
        await context.client`SELECT mmhr_private.r1_remove_ephemeral_worker_login(${login})`;
      } finally { await stopRehearsal(context); }
      if (renewalFailure) throw new Error("Restricted security worker renewal failed");
    } });
    activeRestrictedRehearsals.add(result);
    renewal = setInterval(() => {
      if (renewalRequest) return;
      renewalRequest = (async () => {
        try { await context.client`SELECT mmhr_private.r1_renew_ephemeral_worker_login(${login},${new Date(Date.now() + 300000).toISOString()}::timestamptz)`; }
        catch { renewalFailure = true; if (renewal) clearInterval(renewal); }
        finally { renewalRequest = undefined; }
      })();
    }, 60000);
    return result;
  } catch (error) {
    try {
      if (provisioned) {
        await context.client`SELECT mmhr_private.r1_disable_ephemeral_worker_login(${login})`;
        await context.client`SELECT mmhr_private.r1_remove_ephemeral_worker_login(${login})`;
      }
    } finally { await stopRehearsal(context); }
    throw error;
  }
}
type ScratchPorts = Readonly<{ database: number; api: number; mail: number; all: readonly number[] }>;
const originalPorts = [57020, 57021, 57022, 57023, 57024, 57027, 57029, 8083];

function supabaseCliEnvironment(workdir: string): NodeJS.ProcessEnv {
  const environment = {
    NODE_ENV: process.env.NODE_ENV ?? "test",
    SUPABASE_TELEMETRY_DISABLED: "1",
    SUPABASE_WORKDIR: workdir,
  } as NodeJS.ProcessEnv;
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && cliEnvironmentNames.has(name.toLowerCase())) {
      environment[name] = value;
    }
  }
  return environment;
}

function redact(value: string) {
  return value
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9._-]+/gi, "[supabase-key]")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[credential]@")
    .replace(/(x-mmhr-scratch-guard)\s*[:=]\s*[^\s,}\]]+/gi, "$1=[redacted]")
    .replace(
      /"(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    )
    .replace(
      /(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET)\s*[=:]\s*[^\s,}]+/gi,
      "$1=[redacted]",
    );
}

async function runLocalCli(
  tool: "supabase" | "docker",
  args: string[],
  workdir: string,
  timeoutMs = 180_000,
  childEnvironment: Partial<NodeJS.ProcessEnv> = {},
  executableOverride?: string,
) {
  const executable = executableOverride ?? (process.platform === "win32" ? `${tool}.exe` : tool);
  const environment = { ...supabaseCliEnvironment(workdir), ...childEnvironment };
  // An empty or inherited Docker context takes precedence over DOCKER_HOST in
  // the Docker client. Remove it when the caller deliberately supplies the
  // per-run guarded socket so the CLI cannot bypass the IPC policy.
  if (childEnvironment.DOCKER_CONTEXT === undefined) delete environment.DOCKER_CONTEXT;
  const child = spawn(executable, args, {
    cwd: tool === "supabase" ? workdir : projectRoot,
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    forceTimer.unref();
  }, timeoutMs);
  let result: { code: number | null; signal: string | null };
  try {
    result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timer);
    if (forceTimer) clearTimeout(forceTimer);
  }

  if (result.code !== 0) {
    const safeTail = redact(`${stdout}\n${stderr}`).slice(-2_000);
    throw new Error(
      `${tool} command failed with code ${result.code ?? "signal"}: ${safeTail}`,
    );
  }

  return stdout;
}

const runSupabase = (
  args: string[], workdir: string, timeoutMs?: number,
  childEnvironment?: Partial<NodeJS.ProcessEnv>, executableOverride?: string,
) => runLocalCli("supabase", executableOverride ? args.map((arg) => arg === "--output-format" ? "--output" : arg) : args,
  workdir, timeoutMs, childEnvironment, executableOverride);
const scratchDocker = (workdir: string) => (args: string[]) =>
  runLocalCli("docker", args, workdir, 30_000);

async function getFreePort() {
  return getFreeScratchPort();
}

async function buildScratchConfig(projectId: string, apiEnabled: boolean) {
  const source = await readFile(
    path.join(projectRoot, "supabase", "config.toml"),
    "utf8",
  );
  const allocated = new Set<number>();
  for (let attempt = 0; allocated.size < originalPorts.length && attempt < 64; attempt++) {
    const port = await getFreePort();
    if (!originalPorts.includes(port) && port !== 3000) allocated.add(port);
  }
  if (allocated.size !== originalPorts.length) throw new Error("Could not allocate distinct scratch ports");
  const replacements = [...allocated];
  let config = source.replace(
    /^project_id\s*=\s*"[^"]+"\s*$/m,
    `project_id = "${projectId}"`,
  );

  for (const [index, original] of originalPorts.entries()) {
    const expression = new RegExp(`\\b${original}\\b`, "g");
    const matches = config.match(expression) ?? [];
    if (matches.length === 0) {
      throw new Error(`Scratch config did not find expected port ${original}`);
    }
    config = config.replace(expression, String(replacements[index]));
  }

  const ports: ScratchPorts = {
    database: replacements[originalPorts.indexOf(57022)],
    api: replacements[originalPorts.indexOf(57021)],
    mail: replacements[originalPorts.indexOf(57024)],
    all: replacements,
  };
  if (apiEnabled) {
    const scratchOrigin = `http://127.0.0.1:${ports.api}`;
    config = config.replace(/^site_url\s*=.*$/m, `site_url = "${scratchOrigin}"`)
      .replace(/^additional_redirect_urls\s*=.*$/m, `additional_redirect_urls = ["${scratchOrigin}"]`);
    // The optional pg-delta catalog exporter mounts its workdir read/write.
    // These tests apply Drizzle migrations directly and need no diff cache.
    config = disableScratchSchemaCache(config);
    // The installed CLI has started Realtime despite --exclude in prior runs.
    // Disable it in the disposable config as a second, local-only boundary.
    config = disableScratchService(config, "realtime");
  }
  return { config, ports };
}

function verifyStatusOutput(output: string, ports: ScratchPorts, apiEnabled: boolean): RehearsalApi | null {
  let status: Record<string, unknown>;
  try {
    status = JSON.parse(output) as Record<string, unknown>;
  } catch {
    throw new Error("Scratch Supabase status did not return valid JSON");
  }

  const databaseUrl = status.DB_URL ?? status.db_url;
  if (typeof databaseUrl !== "string") {
    throw new Error("Scratch Supabase status did not include a database URL");
  }
  const parsed = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.port !== String(ports.database)
  ) {
    throw new Error("Scratch Supabase status returned the wrong database port");
  }
  if (!apiEnabled) return null;
  const apiUrl = status.API_URL ?? status.api_url;
  const publicKey = status.ANON_KEY ?? status.anon_key;
  const adminKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
  if (typeof apiUrl !== "string" || typeof publicKey !== "string" || !publicKey ||
    typeof adminKey !== "string" || !adminKey) throw new Error("Scratch API status is incomplete");
  const api = new URL(apiUrl);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) ||
    api.port !== String(ports.api) || api.username || api.password || api.search || api.hash ||
    api.pathname !== "/") throw new Error("Scratch Supabase status returned an unsafe API URL");
  // Return ephemeral values in memory only. Never include this object in errors.
  return { url: api.origin, publicKey, adminKey };
}

async function waitForDatabase(client: postgres.Sql) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await client`select 1`;
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Scratch Supabase database did not become ready");
}

export async function startRehearsal(label: string, options: { api?: boolean; storage?: boolean } = {}) {
  if (process.env.R1_MIGRATION_REHEARSAL !== "1") {
    throw new Error("R1 migration rehearsals require the guarded npm wrapper");
  }

  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (!safeLabel) {
    throw new Error("A rehearsal label must contain a letter or number");
  }
  if (options.storage === true && options.api !== true) {
    throw new Error("Storage rehearsals require the guarded disposable API stack");
  }
  const companion = await resolveScratchGoCompanion();
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "mmhr-r1-"));
  try {
    const versions = await Promise.allSettled([
      runLocalCli("supabase", ["--workdir", scratchRoot, "--version"], scratchRoot, 15_000, {}, companion.shellExecutable),
      runLocalCli("supabase", ["--workdir", scratchRoot, "--version"], scratchRoot, 15_000, {}, companion.goExecutable),
    ]);
    if (versions[0].status === "rejected") throw versions[0].reason;
    if (versions[1].status === "rejected") throw versions[1].reason;
    assertScratchCliVersions(versions[0].value, versions[1].value);
  } catch (error) {
    // Both owned version children have closed before their generated cache is removed.
    try {
      if (path.dirname(path.resolve(scratchRoot)) !== path.resolve(tmpdir()) || !/^mmhr-r1-[A-Za-z0-9]{6}$/.test(path.basename(scratchRoot))) {
        throw new Error("Scratch version cleanup target changed");
      }
      await rm(scratchRoot, { recursive: true, force: false });
    }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Scratch version probe and cleanup failed"); }
    throw error;
  }
  // The shell binary owns lifecycle commands. Its paired Go binary attests the same installation.
  const supabaseExecutable = companion.shellExecutable;
  const projectId = `mmhr-r1-${safeLabel}-${randomBytes(4).toString("hex")}`;
  const supabaseDirectory = path.join(scratchRoot, "supabase");
  await mkdir(supabaseDirectory, { recursive: true });
  const apiEnabled = options.api === true;
  const { config, ports } = await buildScratchConfig(projectId, apiEnabled);
  const configDigest = createHash("sha256").update(config).digest("hex");
  await writeFile(path.join(supabaseDirectory, "config.toml"), config, "utf8");

  let client: postgres.Sql | undefined;
  let network: ScratchNetwork | null = null;
  try {
    let creationGuard: Awaited<ReturnType<typeof startScratchDockerGuard>> | null = null;
    network = await createScratchNetwork(projectId, scratchDocker(scratchRoot), {
      dockerHost: process.env.DOCKER_HOST, dockerContext: process.env.DOCKER_CONTEXT,
    });
    if (!await verifyScratchNetworkIfPresent(network, scratchDocker(scratchRoot))) {
      throw new Error("The scratch loopback network disappeared before startup");
    }
    const dockerEndpoint = await resolveLocalDockerEndpoint(scratchDocker(scratchRoot), {
      dockerHost: process.env.DOCKER_HOST, dockerContext: process.env.DOCKER_CONTEXT,
    });
    creationGuard = await startScratchDockerGuard({ network, scratchRoot, ports, dockerEndpoint });
    try {
      if (creationGuard) {
        let absent = false;
        try {
          await runSupabase(["status", "--workdir", scratchRoot, "--output-format", "json"], scratchRoot, 30_000,
            creationGuard.environment, supabaseExecutable);
        } catch { absent = true; }
        if (!absent) throw new Error("The disposable scratch project unexpectedly already exists");
        // Recent Supabase CLI versions can answer `status` without a Docker
        // container-list request. Make the guarded, project-filtered read
        // explicit before enabling any write operation.
        await runLocalCli(
          "docker",
          ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"],
          scratchRoot,
          30_000,
          creationGuard.environment,
        );
        creationGuard.enableWritesAfterRoutingProbe();
      }
      await runSupabase(
        [
          "start",
          "--workdir",
          scratchRoot,
          "--yes",
          // The CLI creates networks by name. Independent HostIp enforcement and
          // actual binding verification remain required on Docker Desktop.
          ...(network ? ["--network-id", network.name] : []),
          "--exclude",
          apiEnabled
            ? excludedServices.split(",").filter((service) => !["gotrue", "kong", "postgrest", "mailpit",
              ...(options.storage === true ? ["storage-api"] : [])].includes(service)).join(",")
            : excludedServices,
          "--output-format",
          "json",
        ],
        scratchRoot,
        180_000,
        creationGuard?.environment,
        supabaseExecutable,
      );
      if (creationGuard) {
        const counts = creationGuard.counts();
        if (counts.deniedRequests || !counts.createdContainers || !counts.adjustedBindings) {
          throw new Error(`Scratch Docker guard did not verify startup (${counts.lastDenial ?? "missing_creation"})`);
        }
      }
    } catch (error) {
      const observed = creationGuard?.counts();
      const codes = observed?.denialCodes ?? [];
      if (codes.length) throw new Error(`Scratch Docker startup failed for ${projectId} (${codes.join(", ")})`, { cause: error });
      if (observed) {
        const counters = {
          createdContainers: observed.createdContainers,
          adjustedBindings: observed.adjustedBindings,
          scopedReads: observed.scopedReads,
          deniedRequests: observed.deniedRequests,
          lastDenial: observed.lastDenial,
        };
        throw new Error(`Scratch Docker startup failed for ${projectId} (${JSON.stringify(counters)})`, { cause: error });
      }
      throw error;
    } finally {
      if (creationGuard) await creationGuard.close();
    }
    if (!network) throw new Error("The scratch database has no checked loopback network");
    let apiLoopbackOnly = false;
    if (apiEnabled) {
      apiLoopbackOnly = await verifyScratchApiBindings(network, ports, scratchDocker(scratchRoot));
    } else {
      await verifyScratchDatabaseBindings(network, ports, scratchDocker(scratchRoot));
    }
    const statusOutput = await runSupabase(
      ["status", "--workdir", scratchRoot, "--output-format", "json"],
      scratchRoot,
      30_000,
      undefined,
      supabaseExecutable,
    );
    const api = verifyStatusOutput(statusOutput, ports, apiEnabled);

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres`;
    client = postgres(databaseUrl, { max: 2, prepare: true });
    await waitForDatabase(client);

    const context = {
      projectId,
      scratchRoot,
      databaseUrl,
      api,
      ports,
      configDigest,
      supabaseExecutable,
      network,
      apiLoopbackOnly,
      client,
      db: drizzle(client),
    };
    activeRehearsalContexts.set(context, Object.freeze({ label, projectId, databaseUrl,
      databasePort: ports.database, apiLoopbackOnly, scratchRoot, configDigest, db: context.db, client }));
    return context;
  } catch (error) {
    const errors: unknown[] = [error];
    if (client) {
      try {
        await client.end({ timeout: 2 });
      } catch (closeError) {
        errors.push(closeError);
      }
    }
    try {
      await stopScratchProject(projectId, scratchRoot, ports, configDigest, network);
    } catch (cleanupError) {
      errors.push(cleanupError);
    }
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `Scratch rehearsal ${projectId} setup and cleanup failed`,
      );
    }
    throw error;
  }
}

export async function applyAllMigrations(context: RehearsalContext) {
  await migrate(context.db, {
    migrationsFolder: path.join(projectRoot, "drizzle"),
  });
}

export async function prepareTaskRequestEvidenceMigration(context: RehearsalContext) {
  async function assertOwnedTarget() {
    const owned = activeRehearsalContexts.get(context);
    if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1" || !owned) {
      throw new Error("An active owned task Auth rehearsal is required");
    }
    const address = new URL(owned.databaseUrl), scratchRoot = path.resolve(owned.scratchRoot);
    if (owned.label !== "commandapi" || !/^mmhr-r1-commandapi-[0-9a-f]{8}$/.test(owned.projectId)
      || context.projectId !== owned.projectId || context.databaseUrl !== owned.databaseUrl
      || context.ports.database !== owned.databasePort || context.apiLoopbackOnly !== owned.apiLoopbackOnly
      || !owned.apiLoopbackOnly || !context.api || context.db !== owned.db || context.client !== owned.client
      || context.scratchRoot !== owned.scratchRoot || context.configDigest !== owned.configDigest
      || !scratchRoot.startsWith(`${path.resolve(tmpdir())}${path.sep}`) || !path.basename(scratchRoot).startsWith("mmhr-r1-")
      || address.protocol !== "postgresql:" || address.hostname !== "127.0.0.1" || address.port !== String(owned.databasePort)
      || address.pathname !== "/postgres" || address.username !== "postgres" || address.search || address.hash
      || [3000,5432,57022].includes(owned.databasePort)) {
      throw new Error("An active owned task Auth rehearsal is required");
    }
    const config = await readFile(path.join(scratchRoot,"supabase/config.toml"),"utf8");
    if (createHash("sha256").update(config).digest("hex") !== owned.configDigest) {
      throw new Error("Owned task Auth rehearsal configuration changed");
    }
    return owned;
  }
  const owned = await assertOwnedTarget();
  const [existing] = await context.client<{ migrated: boolean }[]>`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migrated`;
  if (existing!.migrated) throw new Error("Task historical capture requires a fresh owned database");
  const source = path.join(projectRoot,"drizzle"), journalText = await readFile(path.join(source,"meta/_journal.json"),"utf8");
  const parsed: unknown = JSON.parse(journalText);
  if (!parsed || typeof parsed !== "object" || !("entries" in parsed) || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid task request migration journal");
  }
  const sqlByTag = new Map<string,string>();
  for (const entry of parsed.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag)) {
      throw new Error("Invalid reviewed task request migration tag");
    }
    sqlByTag.set(entry.tag,await readFile(path.join(source,`${entry.tag}.sql`),"utf8"));
  }
  const selection = selectTaskRequestMigration(journalText,sqlByTag);
  if (await readFile(path.join(source,"meta/_journal.json"),"utf8") !== journalText) throw new Error("Task migration source journal changed during capture");
  for (const [tag,bytes] of sqlByTag) {
    if (await readFile(path.join(source,`${tag}.sql`),"utf8") !== bytes) throw new Error("Task migration source changed during capture");
  }
  const target = path.join(owned.scratchRoot,"task-request-evidence-drizzle"), prefix = path.join(owned.scratchRoot,"pre-task-request-evidence-drizzle");
  await mkdir(path.join(target,"meta"),{recursive:true}); await mkdir(path.join(prefix,"meta"),{recursive:true});
  const capturedJournal = JSON.stringify(selection.journal), prefixJournal = JSON.stringify({ ...selection.journal,entries:selection.journal.entries.slice(0,selection.boundary) });
  const hashes = selection.journal.entries.map(entry => ({tag:entry.tag,sha256:createHash("sha256").update(sqlByTag.get(entry.tag)!).digest("hex")}));
  for (const [index,entry] of selection.journal.entries.entries()) {
    const bytes = sqlByTag.get(entry.tag)!;
    await writeFile(path.join(target,`${entry.tag}.sql`),bytes,"utf8");
    if (index < selection.boundary) await writeFile(path.join(prefix,`${entry.tag}.sql`),bytes,"utf8");
  }
  await writeFile(path.join(target,"meta/_journal.json"),capturedJournal,"utf8");
  await writeFile(path.join(prefix,"meta/_journal.json"),prefixJournal,"utf8");
  async function verifyCaptured(directory: string, expectedJournal: string, count: number) {
    if (await readFile(path.join(directory,"meta/_journal.json"),"utf8") !== expectedJournal) {
      throw new Error("Captured task migration journal changed");
    }
    for (const proof of hashes.slice(0,count)) {
      const bytes = await readFile(path.join(directory,`${proof.tag}.sql`),"utf8");
      if (createHash("sha256").update(bytes).digest("hex") !== proof.sha256) throw new Error("Captured task migration source changed");
    }
  }
  await assertOwnedTarget(); await verifyCaptured(prefix,prefixJournal,selection.boundary);
  await migrate(context.db,{migrationsFolder:prefix});
  const [state] = await context.client<{ legacy: boolean }[]>`SELECT
    to_regprocedure('public.mmhr_record_deal_follow_up(jsonb,uuid,uuid)') IS NOT NULL
    AND to_regprocedure('mmhr_private.r8_task_assert_request_evidence(public.deal_follow_up_events)') IS NULL
    AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='deal_follow_up_events' AND column_name='original_request') AS legacy`;
  if (!state!.legacy) throw new Error("Historical task command boundary was not preserved");
  let stage: "prepared" | "applying" | "finished" = "prepared";
  const manifest = Object.freeze({boundaryTag:selection.boundaryTag,baselineCount:selection.boundary,totalCount:hashes.length,
    journalSha256:createHash("sha256").update(capturedJournal).digest("hex"),migrations:Object.freeze(hashes.map(proof => Object.freeze(proof)))});
  return {manifest,async finish() {
    if (stage !== "prepared") throw new Error("The captured task evidence migration is already finished or applying");
    stage = "applying";
    try {
      await assertOwnedTarget(); await verifyCaptured(target,capturedJournal,hashes.length);
      await migrate(context.db,{migrationsFolder:target});
      const [current] = await context.client<{ expanded: boolean }[]>`SELECT
        to_regprocedure('mmhr_private.r8_task_assert_request_evidence(public.deal_follow_up_events)') IS NOT NULL
        AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='deal_follow_up_events' AND column_name='original_request' AND is_nullable='YES') AS expanded`;
      if (!current!.expanded) throw new Error("Task request evidence expansion did not complete");
      stage = "finished";
    } catch (error) { stage = "prepared"; throw error; }
  }};
}

/** Seeds existing portal history before the additive notification migration. */
export async function applyMigrationsBeforeRfpNotifications(context: RehearsalContext) {
  const owned = activeRehearsalContexts.get(context);
  if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1" || !owned) {
    throw new Error("An active owned notification database rehearsal is required");
  }
  const address = new URL(owned.databaseUrl);
  const scratchRoot = path.resolve(owned.scratchRoot);
  if (owned.label !== "r4-notification" || !/^mmhr-r1-r4notifica-[0-9a-f]{8}$/.test(owned.projectId)
    || context.projectId !== owned.projectId || context.databaseUrl !== owned.databaseUrl
    || context.ports.database !== owned.databasePort || context.apiLoopbackOnly !== owned.apiLoopbackOnly
    || context.db !== owned.db || context.client !== owned.client || context.scratchRoot !== owned.scratchRoot
    || context.configDigest !== owned.configDigest || !scratchRoot.startsWith(`${path.resolve(tmpdir())}${path.sep}`)
    || !path.basename(scratchRoot).startsWith("mmhr-r1-") || address.protocol !== "postgresql:"
    || address.hostname !== "127.0.0.1" || address.port !== String(owned.databasePort)
    || address.pathname !== "/postgres" || address.username !== "postgres" || address.search || address.hash
    || [3000, 5432, 57022].includes(owned.databasePort)) {
    throw new Error("An active owned notification database rehearsal is required");
  }
  const config = await readFile(path.join(scratchRoot, "supabase/config.toml"), "utf8");
  if (createHash("sha256").update(config).digest("hex") !== owned.configDigest) {
    throw new Error("Owned notification rehearsal configuration changed");
  }
  const source = path.join(projectRoot, "drizzle");
  const journal = JSON.parse(await readFile(path.join(source, "meta/_journal.json"), "utf8")) as {
    version: string; dialect: string; entries: { tag: string }[];
  };
  const boundary = journal.entries.findIndex(entry => entry.tag === "0158_r4_rfp_notification_outbox");
  if (boundary !== 158 || journal.entries[157]?.tag !== "0157_r7_payment_approval_and_retry_receipts") {
    throw new Error("Unexpected notification migration sequence");
  }
  const entries = journal.entries.slice(0, boundary);
  if (entries.some(entry => !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) throw new Error("Invalid reviewed migration tag");
  const target = path.join(scratchRoot, "pre-notification-drizzle");
  await mkdir(path.join(target, "meta"), { recursive: true });
  for (const entry of entries) {
    await copyFile(path.join(source, `${entry.tag}.sql`), path.join(target, `${entry.tag}.sql`));
  }
  await writeFile(path.join(target, "meta/_journal.json"), JSON.stringify({ ...journal, entries }), "utf8");
  await migrate(context.db, { migrationsFolder: target });
}

/** Builds historical fixtures before the portal guards exist. */
export async function applyMigrationsBeforeContractPortal(context: RehearsalContext) {
  const source = path.join(projectRoot, "drizzle");
  const journal = JSON.parse(await readFile(path.join(source, "meta/_journal.json"), "utf8")) as {
    version: string; dialect: string; entries: { tag: string }[];
  };
  const boundary = journal.entries.findIndex(entry => entry.tag === "0154_r6_portal_contract_handoff");
  if (boundary !== 154 || journal.entries[153]?.tag !== "0153_r6_portal_proposal_quotes") {
    throw new Error("Unexpected reviewed contract migration sequence");
  }
  const entries = journal.entries.slice(0, boundary);
  if (entries.some(entry => !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) {
    throw new Error("Invalid reviewed migration tag");
  }
  const target = path.join(context.scratchRoot, "pre-contract-portal-drizzle");
  await mkdir(path.join(target, "meta"), { recursive: true });
  for (const entry of entries) {
    await copyFile(path.join(source, `${entry.tag}.sql`), path.join(target, `${entry.tag}.sql`));
  }
  await writeFile(path.join(target, "meta/_journal.json"), JSON.stringify({ ...journal, entries }), "utf8");
  await migrate(context.db, { migrationsFolder: target });
}

/** Preserves the original finance function for forward-migration comparisons. */
export async function applyMigrationsBeforeFinanceCalculation(context: RehearsalContext) {
  const source = path.join(projectRoot, "drizzle");
  const journal = JSON.parse(await readFile(path.join(source, "meta/_journal.json"), "utf8")) as {
    version: string; dialect: string; entries: { tag: string }[];
  };
  const boundary = journal.entries.findIndex(entry => entry.tag === "0155_r7_commission_calculation_receipts");
  if (boundary !== 155 || journal.entries[154]?.tag !== "0154_r6_portal_contract_handoff") {
    throw new Error("Unexpected reviewed finance migration sequence");
  }
  const entries = journal.entries.slice(0, boundary);
  if (entries.some(entry => !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) {
    throw new Error("Invalid reviewed migration tag");
  }
  const target = path.join(context.scratchRoot, "pre-finance-calculation-drizzle");
  await mkdir(path.join(target, "meta"), { recursive: true });
  for (const entry of entries) {
    await copyFile(path.join(source, `${entry.tag}.sql`), path.join(target, `${entry.tag}.sql`));
  }
  await writeFile(path.join(target, "meta/_journal.json"), JSON.stringify({ ...journal, entries }), "utf8");
  await migrate(context.db, { migrationsFolder: target });
}

export async function applyBaselineMigration(context: RehearsalContext) {
  const baselineRoot = path.join(context.scratchRoot, "baseline-drizzle");
  const baselineMeta = path.join(baselineRoot, "meta");
  await mkdir(baselineMeta, { recursive: true });
  await copyFile(
    path.join(projectRoot, "drizzle", "0000_light_vanisher.sql"),
    path.join(baselineRoot, "0000_light_vanisher.sql"),
  );

  const journal = JSON.parse(
    await readFile(path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as {
    version: string;
    dialect: string;
    entries: { tag?: string }[];
  };
  if (journal.entries[0]?.tag !== "0000_light_vanisher") {
    throw new Error("The baseline migration journal entry is not the expected migration");
  }
  journal.entries = journal.entries.slice(0, 1);
  await writeFile(
    path.join(baselineMeta, "_journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
    "utf8",
  );
  await migrate(context.db, { migrationsFolder: baselineRoot });
}

export async function applyMigrationsBeforePortalResponses(context: RehearsalContext) {
  const prefixRoot = path.join(context.scratchRoot, "pre-portal-response-drizzle");
  const journal = JSON.parse(await readFile(
    path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8",
  )) as { version: string; dialect: string; entries: { tag: string }[] };
  const boundary = journal.entries.findIndex((entry) => entry.tag === "0142_abandoned_bloodstorm");
  if (boundary !== 142) throw new Error("Unexpected portal response migration sequence");
  const entries = journal.entries.slice(0, boundary);
  if (entries.some((entry) => !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) {
    throw new Error("Invalid reviewed portal response migration tag");
  }
  await mkdir(path.join(prefixRoot, "meta"), { recursive: true });
  for (const entry of entries) {
    await copyFile(path.join(projectRoot, "drizzle", `${entry.tag}.sql`), path.join(prefixRoot, `${entry.tag}.sql`));
  }
  await writeFile(path.join(prefixRoot, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }), "utf8");
  await migrate(context.db, { migrationsFolder: prefixRoot });
}

export async function applyMigrationsBeforeRfpAuthorization(context: RehearsalContext) {
  const prefixRoot = path.join(context.scratchRoot, "pre-rfp-authorization-drizzle");
  const journal = JSON.parse(await readFile(
    path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8",
  )) as { version: string; dialect: string; entries: { tag: string }[] };
  const boundary = journal.entries.findIndex((entry) => entry.tag === "0094_r4-mmhr-rfp-authorization");
  if (boundary !== 94 || journal.entries[93]?.tag !== "0093_r7-finance-authorization") {
    throw new Error("The RFP authorization rehearsal prefix is not the reviewed sequence");
  }
  const prefix = journal.entries.slice(0, boundary);
  if (prefix.some((entry) => !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) {
    throw new Error("The RFP authorization rehearsal contains an invalid migration tag");
  }
  await mkdir(path.join(prefixRoot, "meta"), { recursive: true });
  for (const entry of prefix) {
    await copyFile(path.join(projectRoot, "drizzle", `${entry.tag}.sql`), path.join(prefixRoot, `${entry.tag}.sql`));
  }
  await writeFile(path.join(prefixRoot, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: prefix }), "utf8");
  await migrate(context.db, { migrationsFolder: prefixRoot });
}

export async function applyMigrationsBeforePermissions(context: RehearsalContext) {
  const prefixRoot = path.join(context.scratchRoot, "pre-permission-drizzle");
  const prefixMeta = path.join(prefixRoot, "meta");
  const expected = [
    "0000_light_vanisher", "0001_heavy_kulan_gath",
    "0002_r1_request_scoped_access", "0003_r1_permission_evaluation",
  ];
  const journal = JSON.parse(await readFile(
    path.join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8",
  )) as { version: string; dialect: string; entries: { tag?: string }[] };
  if (expected.some((tag, index) => journal.entries[index]?.tag !== tag)) {
    throw new Error("The permission rehearsal migration prefix is not the reviewed sequence");
  }
  await mkdir(prefixMeta, { recursive: true });
  for (const tag of expected.slice(0, 3)) {
    await copyFile(path.join(projectRoot, "drizzle", `${tag}.sql`), path.join(prefixRoot, `${tag}.sql`));
  }
  await writeFile(path.join(prefixMeta, "_journal.json"), `${JSON.stringify({
    ...journal, entries: journal.entries.slice(0, 3),
  }, null, 2)}\n`, "utf8");
  await migrate(context.db, { migrationsFolder: prefixRoot });
}

async function stopScratchProject(
  projectId: string, scratchRoot: string, ports: ScratchPorts, configDigest: string,
  network: ScratchNetwork | null,
) {
  const resolvedRoot = path.resolve(scratchRoot);
  const resolvedTemp = `${path.resolve(tmpdir())}${path.sep}`;
  if (
    !resolvedRoot.startsWith(resolvedTemp) ||
    !path.basename(resolvedRoot).startsWith("mmhr-r1-") ||
    !/^mmhr-r1-[a-z0-9]+-[0-9a-f]{8}$/.test(projectId)
  ) {
    throw new Error("Refused unsafe scratch cleanup target");
  }
  const config = await readFile(path.join(resolvedRoot, "supabase", "config.toml"), "utf8");
  const configuredProject = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const configuredPorts = [...config.matchAll(/^(?:port|shadow_port|inspector_port)\s*=\s*(\d+)\s*$/gm)]
    .map((match) => Number(match[1]));
  if (configuredProject !== projectId || createHash("sha256").update(config).digest("hex") !== configDigest ||
    new Set(ports.all).size !== originalPorts.length || configuredPorts.length !== ports.all.length ||
    configuredPorts.some((port) => !ports.all.includes(port) || originalPorts.includes(port) || port === 3000)) {
    throw new Error("Refused cleanup because scratch project or random ports changed");
  }
  if (network) {
    if (network.projectId !== projectId) throw new Error("Refused cleanup for a different scratch network project");
    await verifyScratchNetworkIfPresent(network, scratchDocker(resolvedRoot));
  }

  await runSupabase(
    [
      "stop",
      "--workdir",
      resolvedRoot,
      "--project-id",
      projectId,
      "--no-backup",
      "--yes",
    ],
    resolvedRoot,
    120_000,
    undefined,
    // The Go companion is required for guarded API startup, but it does not
    // expose the lifecycle `stop` command. Cleanup must use the shell CLI.
    undefined,
  );
  if (network) await removeScratchNetwork(network, scratchDocker(resolvedRoot));
  await rm(resolvedRoot, { recursive: true, force: true });
}

export async function stopRehearsal(context: RehearsalContext) {
  activeRehearsalContexts.delete(context);
  const errors: unknown[] = [];
  try {
    await context.client.end({ timeout: 5 });
  } catch (error) {
    errors.push(error);
  }
  try {
    await stopScratchProject(context.projectId, context.scratchRoot, context.ports, context.configDigest, context.network);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Scratch rehearsal ${context.projectId} cleanup failed`,
    );
  }
}

export async function insertLegacyAuthUser(
  context: RehearsalContext,
  email: string,
  confirmed = true,
) {
  const id = randomUUID();
  await context.client`
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      ${id}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${email},
      '',
      CASE WHEN ${confirmed} THEN now() ELSE NULL END,
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  `;
  return id;
}

// Integrate inside src/server/db/r1-migration-rehearsal.ts after the private owned address map.
// Add imports for these two checked modules. Keep all existing opener functions unchanged.
// import { createOriginalVerificationExecutor, verifyOriginalVerificationCandidates } from "@/server/workflows/original-verification-executor";
// import { createOriginalVerifierSockets } from "@/server/workflows/original-verification-sockets";
// import type { Socket } from "node:net";

export async function openOriginalVerifierRehearsal(context: RehearsalContext, loginName: string, credential: string) {
  const owned = assertDocumentRehearsal(context, "worker");
  if (owned.label !== "commandapi" || !/^mmhr_original_verifier_[a-f0-9]{32}$/.test(loginName)
    || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error("Invalid owned original verifier credentials");
  const sockets = createOriginalVerifierSockets(owned.databasePort);
  // Every postgres environment-derived option is explicit. No URL or inherited password is used.
  // socket is implemented by installed postgres 3.4.9, but absent from its published Options type.
  const options: postgres.Options<Record<string, never>> & {
    socket: () => Promise<Socket>; max_pipeline: number; sslnegotiation: null;
  } = {
    host: "127.0.0.1", port: owned.databasePort, database: "postgres", user: loginName, password: credential,
    max: 1, max_pipeline: 1, ssl: false, sslnegotiation: null,
    idle_timeout: 10, connect_timeout: 8, max_lifetime: 480, keep_alive: 0, backoff: false,
    prepare: false, debug: false, fetch_types: false, publications: "alltables", target_session_attrs: "read-write",
    types: {}, transform: {}, onnotice: () => undefined,
    connection: { application_name: "mmhr_owned_original_verifier", statement_timeout: 8000, TimeZone: "UTC", search_path: "" },
    socket: () => sockets.create(),
  };
  const client = postgres(options);
  const executor = createOriginalVerificationExecutor({
    execute: (text, parameters) => client.unsafe(text, [...parameters]),
    async terminate() {
      // Socket closure is stronger than the installed end() timeout, which only sends Terminate.
      const observedClose = sockets.close();
      await Promise.all([observedClose, client.end({ timeout: 0 })]);
    },
  });
  try {
    await executor.verifyConnection(loginName);
    await verifyOriginalVerificationCandidates(executor);
    return Object.freeze({ client, executor, close: () => executor.close(), resourceStatus: () => sockets.status() });
  } catch (error) {
    try { await executor.close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Owned original verifier setup and cleanup failed"); }
    throw error;
  }
}

export async function prepareRfpReceiptMigration(context: RehearsalContext) {
  async function assertOwnedTarget() {
    const owned = activeRehearsalContexts.get(context);
    if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1" || !owned) {
      throw new Error("An active owned RFP receipt Auth rehearsal is required");
    }
    const address = new URL(owned.databaseUrl), scratchRoot = path.resolve(owned.scratchRoot);
    if (owned.label !== "commandapi" || !/^mmhr-r1-commandapi-[0-9a-f]{8}$/.test(owned.projectId)
      || context.projectId !== owned.projectId || context.databaseUrl !== owned.databaseUrl
      || context.ports.database !== owned.databasePort || context.apiLoopbackOnly !== owned.apiLoopbackOnly
      || !owned.apiLoopbackOnly || !context.api || context.db !== owned.db || context.client !== owned.client
      || context.scratchRoot !== owned.scratchRoot || context.configDigest !== owned.configDigest
      || !scratchRoot.startsWith(`${path.resolve(tmpdir())}${path.sep}`) || !path.basename(scratchRoot).startsWith("mmhr-r1-")
      || address.protocol !== "postgresql:" || address.hostname !== "127.0.0.1" || address.port !== String(owned.databasePort)
      || address.pathname !== "/postgres" || address.username !== "postgres" || address.search || address.hash
      || [3000,5432,57022].includes(owned.databasePort)) {
      throw new Error("An active owned RFP receipt Auth rehearsal is required");
    }
    const config = await readFile(path.join(scratchRoot,"supabase/config.toml"),"utf8");
    if (createHash("sha256").update(config).digest("hex") !== owned.configDigest) {
      throw new Error("Owned RFP receipt Auth rehearsal configuration changed");
    }
    return owned;
  }
  const owned = await assertOwnedTarget();
  const [existing] = await context.client<{ migrated: boolean }[]>`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migrated`;
  if (existing!.migrated) throw new Error("RFP receipt historical capture requires a fresh owned database");
  const source = path.join(projectRoot,"drizzle"), journalText = await readFile(path.join(source,"meta/_journal.json"),"utf8");
  const parsed: unknown = JSON.parse(journalText);
  if (!parsed || typeof parsed !== "object" || !("entries" in parsed) || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid RFP receipt migration journal");
  }
  const sqlByTag = new Map<string,string>();
  for (const entry of parsed.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag)) {
      throw new Error("Invalid reviewed RFP receipt migration tag");
    }
    sqlByTag.set(entry.tag,await readFile(path.join(source,`${entry.tag}.sql`),"utf8"));
  }
  const selection = selectRfpReceiptMigration(journalText,sqlByTag);
  if (await readFile(path.join(source,"meta/_journal.json"),"utf8") !== journalText) throw new Error("RFP receipt migration source journal changed during capture");
  for (const [tag,bytes] of sqlByTag) {
    if (await readFile(path.join(source,`${tag}.sql`),"utf8") !== bytes) throw new Error("RFP receipt migration source changed during capture");
  }
  const target = path.join(owned.scratchRoot,"rfp-receipt-drizzle"), prefix = path.join(owned.scratchRoot,"pre-rfp-receipt-drizzle");
  await mkdir(path.join(target,"meta"),{recursive:true}); await mkdir(path.join(prefix,"meta"),{recursive:true});
  const capturedJournal = JSON.stringify(selection.journal), prefixJournal = JSON.stringify({ ...selection.journal,entries:selection.journal.entries.slice(0,selection.boundary) });
  const hashes = selection.journal.entries.map(entry => ({tag:entry.tag,sha256:createHash("sha256").update(sqlByTag.get(entry.tag)!).digest("hex")}));
  for (const [index,entry] of selection.journal.entries.entries()) {
    const bytes = sqlByTag.get(entry.tag)!;
    await writeFile(path.join(target,`${entry.tag}.sql`),bytes,"utf8");
    if (index < selection.boundary) await writeFile(path.join(prefix,`${entry.tag}.sql`),bytes,"utf8");
  }
  await writeFile(path.join(target,"meta/_journal.json"),capturedJournal,"utf8");
  await writeFile(path.join(prefix,"meta/_journal.json"),prefixJournal,"utf8");
  async function verifyCaptured(directory: string, expectedJournal: string, count: number) {
    if (await readFile(path.join(directory,"meta/_journal.json"),"utf8") !== expectedJournal) {
      throw new Error("Captured RFP receipt migration journal changed");
    }
    for (const proof of hashes.slice(0,count)) {
      const bytes = await readFile(path.join(directory,`${proof.tag}.sql`),"utf8");
      if (createHash("sha256").update(bytes).digest("hex") !== proof.sha256) throw new Error("Captured RFP receipt migration source changed");
    }
  }
  await assertOwnedTarget(); await verifyCaptured(prefix,prefixJournal,selection.boundary);
  await migrate(context.db,{migrationsFolder:prefix});
  const [state] = await context.client<{ legacy: boolean }[]>`SELECT
    to_regprocedure('public.mmhr_submit_portal_response(jsonb,uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.mmhr_confirm_rfp_receipt(jsonb,uuid,uuid)') IS NULL
    AND to_regclass('mmhr_private.rfp_receipt_confirmations') IS NULL AS legacy`;
  if (!state!.legacy) throw new Error("Historical response command boundary was not preserved");
  let stage: "prepared" | "applying" | "finished" = "prepared";
  const manifest = Object.freeze({boundaryTag:selection.boundaryTag,baselineCount:selection.boundary,totalCount:hashes.length,
    journalSha256:createHash("sha256").update(capturedJournal).digest("hex"),migrations:Object.freeze(hashes.map(proof => Object.freeze(proof)))});
  return {manifest,async finish() {
    if (stage !== "prepared") throw new Error("The captured RFP receipt migration is already finished or applying");
    stage = "applying";
    try {
      await assertOwnedTarget(); await verifyCaptured(target,capturedJournal,hashes.length);
      await migrate(context.db,{migrationsFolder:target});
      const [current] = await context.client<{ expanded: boolean }[]>`SELECT
        to_regprocedure('public.mmhr_confirm_rfp_receipt(jsonb,uuid,uuid)') IS NOT NULL
        AND to_regclass('mmhr_private.rfp_receipt_confirmations') IS NOT NULL AS expanded`;
      if (!current!.expanded) throw new Error("RFP receipt expansion did not complete");
      stage = "finished";
    } catch (error) { stage = "prepared"; throw error; }
  }};
}
