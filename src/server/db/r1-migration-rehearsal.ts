import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  createScratchNetwork, removeScratchNetwork, verifyScratchApiBindings,
  verifyScratchNetworkIfPresent, resolveLocalDockerEndpoint, type ScratchNetwork,
} from "@/server/auth/security-command-api-isolation";
import { startScratchDockerGuard } from "@/server/auth/security-command-api-docker-guard";
import { assertScratchCliVersions, disableScratchSchemaCache, resolveScratchGoCompanion } from "@/server/auth/security-command-api-cli";

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
type ScratchPorts = Readonly<{ database: number; api: number; all: readonly number[] }>;
const originalPorts = [56320, 56321, 56322, 56323, 56324, 56327, 56329, 8083];

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
  const child = spawn(executable, args, {
    cwd: projectRoot,
    env: { ...supabaseCliEnvironment(workdir), ...childEnvironment },
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
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
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
    database: replacements[originalPorts.indexOf(56322)],
    api: replacements[originalPorts.indexOf(56321)],
    all: replacements,
  };
  if (apiEnabled) {
    const scratchOrigin = `http://127.0.0.1:${ports.api}`;
    config = config.replace(/^site_url\s*=.*$/m, `site_url = "${scratchOrigin}"`)
      .replace(/^additional_redirect_urls\s*=.*$/m, `additional_redirect_urls = ["${scratchOrigin}"]`);
    // The optional pg-delta catalog exporter mounts its workdir read/write.
    // These tests apply Drizzle migrations directly and need no diff cache.
    config = disableScratchSchemaCache(config);
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

export async function startRehearsal(label: string, options: { api?: boolean } = {}) {
  if (process.env.R1_MIGRATION_REHEARSAL !== "1") {
    throw new Error("R1 migration rehearsals require the guarded npm wrapper");
  }

  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (!safeLabel) {
    throw new Error("A rehearsal label must contain a letter or number");
  }
  let supabaseExecutable: string | undefined;
  if (options.api === true) {
    const companion = await resolveScratchGoCompanion();
    const versions = await Promise.all([
      runLocalCli("supabase", ["--version"], projectRoot, 15_000, {}, companion.shellExecutable),
      runLocalCli("supabase", ["--version"], projectRoot, 15_000, {}, companion.goExecutable),
    ]);
    assertScratchCliVersions(versions[0], versions[1]);
    supabaseExecutable = companion.goExecutable;
  }
  const projectId = `mmhr-r1-${safeLabel}-${randomBytes(4).toString("hex")}`;
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "mmhr-r1-"));
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
    if (apiEnabled) {
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
    }
    try {
      if (creationGuard) {
        let absent = false;
        try {
          await runSupabase(["status", "--workdir", scratchRoot, "--output-format", "json"], scratchRoot, 30_000,
            creationGuard.environment, supabaseExecutable);
        } catch { absent = true; }
        if (!absent) throw new Error("The disposable scratch project unexpectedly already exists");
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
            ? excludedServices.split(",").filter((service) => !["gotrue", "kong", "postgrest", "mailpit"].includes(service)).join(",")
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
      const codes = creationGuard?.counts().denialCodes ?? [];
      if (codes.length) throw new Error(`Scratch Docker startup failed for ${projectId} (${codes.join(", ")})`, { cause: error });
      throw error;
    } finally {
      if (creationGuard) await creationGuard.close();
    }
    const apiLoopbackOnly = network
      ? await verifyScratchApiBindings(network, ports, scratchDocker(scratchRoot))
      : false;
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

    return {
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
      await stopScratchProject(projectId, scratchRoot, ports, configDigest, network, supabaseExecutable);
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
  supabaseExecutable?: string,
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
    supabaseExecutable,
  );
  if (network) await removeScratchNetwork(network, scratchDocker(resolvedRoot));
  await rm(resolvedRoot, { recursive: true, force: true });
}

export async function stopRehearsal(context: RehearsalContext) {
  const errors: unknown[] = [];
  try {
    await context.client.end({ timeout: 5 });
  } catch (error) {
    errors.push(error);
  }
  try {
    await stopScratchProject(context.projectId, context.scratchRoot, context.ports, context.configDigest, context.network,
      context.supabaseExecutable);
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
