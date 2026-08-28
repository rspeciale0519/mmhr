import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
    .replace(
      /"(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    )
    .replace(
      /(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY)\s*[=:]\s*[^\s,}]+/gi,
      "$1=[redacted]",
    );
}

async function runSupabase(
  args: string[],
  workdir: string,
  timeoutMs = 180_000,
) {
  const executable = process.platform === "win32" ? "supabase.exe" : "supabase";
  const child = spawn(executable, args, {
    cwd: projectRoot,
    env: supabaseCliEnvironment(workdir),
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
      `Supabase command failed with code ${result.code ?? "signal"}: ${safeTail}`,
    );
  }

  return stdout;
}

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

async function buildScratchConfig(projectId: string) {
  const source = await readFile(
    path.join(projectRoot, "supabase", "config.toml"),
    "utf8",
  );
  const originalPorts = [56320, 56321, 56322, 56323, 56324, 56327, 56329, 8083];
  const replacements = await Promise.all(originalPorts.map(() => getFreePort()));
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

  return {
    config,
    databasePort: replacements[originalPorts.indexOf(56322)],
  };
}

function verifyStatusOutput(output: string, expectedDatabasePort: number) {
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
    parsed.port !== String(expectedDatabasePort)
  ) {
    throw new Error("Scratch Supabase status returned the wrong database port");
  }
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

export async function startRehearsal(label: string) {
  if (process.env.R1_MIGRATION_REHEARSAL !== "1") {
    throw new Error("R1 migration rehearsals require the guarded npm wrapper");
  }

  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (!safeLabel) {
    throw new Error("A rehearsal label must contain a letter or number");
  }
  const projectId = `mmhr-r1-${safeLabel}-${randomBytes(4).toString("hex")}`;
  const scratchRoot = await mkdtemp(path.join(tmpdir(), "mmhr-r1-"));
  const supabaseDirectory = path.join(scratchRoot, "supabase");
  await mkdir(supabaseDirectory, { recursive: true });
  const { config, databasePort } = await buildScratchConfig(projectId);
  await writeFile(path.join(supabaseDirectory, "config.toml"), config, "utf8");

  let client: postgres.Sql | undefined;
  try {
    await runSupabase(
      [
        "start",
        "--workdir",
        scratchRoot,
        "--yes",
        "--exclude",
        excludedServices,
        "--output-format",
        "json",
      ],
      scratchRoot,
    );
    const statusOutput = await runSupabase(
      ["status", "--workdir", scratchRoot, "--output-format", "json"],
      scratchRoot,
      30_000,
    );
    verifyStatusOutput(statusOutput, databasePort);

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`;
    client = postgres(databaseUrl, { max: 2, prepare: true });
    await waitForDatabase(client);

    return {
      projectId,
      scratchRoot,
      databaseUrl,
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
      await stopScratchProject(projectId, scratchRoot);
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

async function stopScratchProject(projectId: string, scratchRoot: string) {
  const resolvedRoot = path.resolve(scratchRoot);
  const resolvedTemp = `${path.resolve(tmpdir())}${path.sep}`;
  if (
    !resolvedRoot.startsWith(resolvedTemp) ||
    !path.basename(resolvedRoot).startsWith("mmhr-r1-") ||
    !/^mmhr-r1-[a-z0-9]+-[0-9a-f]{8}$/.test(projectId)
  ) {
    throw new Error("Refused unsafe scratch cleanup target");
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
  );
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
    await stopScratchProject(context.projectId, context.scratchRoot);
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
