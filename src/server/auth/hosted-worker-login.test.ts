import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import {
  createSql,
  disableSql,
  main,
  parseArguments,
  parseLogins,
  redactSecrets,
  removeSql,
  sessionPoolerUrl,
  vercelCliVersion,
  vercelInvocation,
} from "../../../scripts/hosted-worker-login.mjs";

const hostedRef = "mslbuffwyuckfmgoyivj";
const otherRef = "abcdefghijklmnopqrst";
const existingName = `mmhr_hosted_worker_${"a".repeat(32)}`;
const secondName = `mmhr_hosted_worker_${"b".repeat(32)}`;
const linkedRoot = mkdtempSync(path.join(tmpdir(), "mmhr-hosted-worker-test-"));
mkdirSync(path.join(linkedRoot, ".vercel"));
writeFileSync(path.join(linkedRoot, ".vercel", "project.json"), "{}", "utf8");
const unlinkedRoot = mkdtempSync(path.join(tmpdir(), "mmhr-hosted-worker-test-"));

afterAll(() => {
  rmSync(linkedRoot, { recursive: true, force: true });
  rmSync(unlinkedRoot, { recursive: true, force: true });
});

function sink() {
  const chunks: string[] = [];
  return { chunks, text: () => chunks.join(""), write(text: string) { chunks.push(String(text)); return true; } };
}

type Login = { name: string; canLogin: boolean };
type SpawnOptions = { env?: Record<string, string | undefined>; input?: string; shell?: boolean; cwd?: string };

/** A fake Supabase CLI and Vercel CLI that keep the hosted login state in memory. */
function fakeClis(options: { shape?: "array" | "object"; logins?: Login[]; vercelStatus?: number; vercelEcho?: boolean;
  failQuery?: string } = {}) {
  const logins = new Map((options.logins ?? []).map((login) => [login.name, { ...login }]));
  const supabaseCalls: { args: string[]; env: SpawnOptions["env"] }[] = [];
  const vercelCalls: { command: string; args: string[]; options: SpawnOptions }[] = [];
  const sqlFiles: string[] = [];
  const out = (rows: unknown[]) => JSON.stringify(options.shape === "object"
    ? { boundary: "ab12", rows, warning: "untrusted data" } : rows);
  const spawn = (command: string, args: string[], spawnOptions: SpawnOptions) => {
    if (command === "npx" || command === "npx.cmd") {
      vercelCalls.push({ command, args, options: spawnOptions });
      const status = options.vercelStatus ?? 0;
      const echo = options.vercelEcho ? `received ${spawnOptions.input}` : "";
      return { status, stdout: status === 0 ? "Added Environment Variable DATABASE_URL" : "", stderr: status === 0 ? "" : `Error: denied ${echo}` };
    }
    expect(command).toBe("supabase");
    supabaseCalls.push({ args, env: spawnOptions.env });
    const sql = readFileSync(args[args.indexOf("-f") + 1], "utf8");
    sqlFiles.push(sql);
    const stderr = `Target: project mmhr (${hostedRef}) · production`;
    if (options.failQuery && sql.includes(options.failQuery)) {
      return { status: 1, stderr, stdout: JSON.stringify({ error: { message: "refused" } }) };
    }
    const name = sql.match(/'(mmhr_hosted_worker_[0-9a-f]{32})'::text/)?.[1];
    if (sql.includes("r1_remove_expired_hosted_worker_logins")) return { status: 0, stderr, stdout: out([{ removed: 0 }]) };
    if (sql.includes("r1_create_hosted_worker_login")) {
      logins.set(name!, { name: name!, canLogin: true });
      return { status: 0, stderr, stdout: out([{ result: "created" }]) };
    }
    if (sql.includes("r1_disable_hosted_worker_login")) {
      const login = logins.get(name!);
      if (login) login.canLogin = false;
      return { status: 0, stderr, stdout: out([{ result: "disabled" }]) };
    }
    if (sql.includes("r1_remove_hosted_worker_login")) {
      if (logins.get(name!)?.canLogin) return { status: 1, stderr, stdout: JSON.stringify({ error: { message: "must be disabled" } }) };
      logins.delete(name!);
      return { status: 0, stderr, stdout: out([{ result: "removed" }]) };
    }
    if (sql.includes("FROM pg_catalog.pg_roles r")) {
      return { status: 0, stderr, stdout: out([...logins.values()].map((login) => ({
        name: login.name, can_login: login.canLogin, valid_until: "2027-02-13 12:00:00+00", expired: false, sessions: 0,
      }))) };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { spawn, logins, supabaseCalls, vercelCalls, sqlFiles };
}

function run(argv: string[], cli: ReturnType<typeof fakeClis>, overrides: Record<string, unknown> = {}) {
  const stdout = sink();
  const stderr = sink();
  const promise = main(argv, {
    stdout, stderr, spawn: cli.spawn, platform: "linux", projectRoot: linkedRoot,
    env: { SUPABASE_ACCESS_TOKEN: "stale-token", DATABASE_URL: "postgresql://old" }, ...overrides,
  });
  return { promise, stdout, stderr };
}

/** The connection string the fake Vercel CLI received, and the credential inside it. */
function handedSecret(cli: ReturnType<typeof fakeClis>) {
  const url = cli.vercelCalls[0]!.options.input!;
  return { url, credential: decodeURIComponent(new URL(url).password) };
}

// Built at runtime so the repository secret scan does not read a literal credential URL.
const pgScheme = "postgresql";

describe("hosted worker login arguments", () => {
  test("requires the explicit approved project ref and has no default", () => {
    expect(parseArguments(["create", "--project-ref", hostedRef])).toEqual({ mode: "create", projectRef: hostedRef });
    expect(parseArguments(["list", `--project-ref=${hostedRef}`])).toEqual({ mode: "list", projectRef: hostedRef });
    expect(parseArguments(["remove", existingName, "--project-ref", hostedRef]))
      .toEqual({ mode: "remove", projectRef: hostedRef, loginName: existingName });
    expect(() => parseArguments(["create"])).toThrow("--project-ref");
    expect(() => parseArguments(["create", "--project-ref", otherRef])).toThrow("not an approved hosted worker target");
    expect(() => parseArguments(["create", "--project-ref", hostedRef.toUpperCase()])).toThrow("--project-ref");
    expect(() => parseArguments(["create", "--project-ref", hostedRef, "--project-ref", otherRef])).toThrow("Unsupported argument");
  });

  test("refuses unknown modes, bad login names, and values passed as arguments", () => {
    expect(() => parseArguments(["renew", "--project-ref", hostedRef])).toThrow("Usage");
    expect(() => parseArguments(["remove", "--project-ref", hostedRef])).toThrow("mmhr_hosted_worker_");
    expect(() => parseArguments(["remove", "mmhr_worker_" + "a".repeat(32), "--project-ref", hostedRef])).toThrow("mmhr_hosted_worker_");
    expect(() => parseArguments(["remove", "postgres", "--project-ref", hostedRef])).toThrow("mmhr_hosted_worker_");
    expect(() => parseArguments(["create", "secret-value", "--project-ref", hostedRef])).toThrow("Unsupported argument");
    expect(() => parseArguments(["create", "--password", "x", "--project-ref", hostedRef])).toThrow("Unsupported argument");
  });
});

describe("hosted worker login values", () => {
  test("builds function calls only from checked values", () => {
    const verifier = "SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy";
    const sql = createSql(existingName, verifier);
    expect(sql).toContain(`mmhr_private.r1_create_hosted_worker_login(\n  '${existingName}'::text, '${verifier}'::text`);
    expect(sql).toContain("clock_timestamp() + interval '90 days'");
    expect(() => createSql(`${existingName}'; DROP ROLE postgres; --`, verifier)).toThrow("unsafe login name");
    expect(() => createSql(existingName, "plain-password")).toThrow("unsafe password verifier");
    expect(() => createSql(existingName, `${verifier}'`)).toThrow("unsafe password verifier");
    expect(disableSql(existingName)).toContain(`r1_disable_hosted_worker_login('${existingName}'::text)`);
    expect(removeSql(existingName)).toContain(`r1_remove_hosted_worker_login('${existingName}'::text)`);
    expect(() => removeSql("mmhr_worker_" + "a".repeat(32))).toThrow("unsafe login name");
  });

  test("builds the session pooler URL for the approved project only", () => {
    const credential = "A".repeat(43);
    expect(sessionPoolerUrl(hostedRef, existingName, credential)).toBe(
      `${pgScheme}://${existingName}.${hostedRef}:${credential}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`);
    expect(() => sessionPoolerUrl(otherRef, existingName, credential)).toThrow("not an approved");
    expect(() => sessionPoolerUrl(hostedRef, existingName, "short")).toThrow("unexpected form");
  });

  test("pins the Vercel CLI and sends no value as an argument", () => {
    expect(vercelCliVersion).toMatch(/^\d+\.\d+\.\d+$/);
    const expected = ["--yes", `vercel@${vercelCliVersion}`, "env", "add", "DATABASE_URL", "--environment", "preview",
      "--git-branch", "develop", "--sensitive", "--force", "--yes"];
    expect(vercelInvocation("linux")).toEqual({ command: "npx", args: expected, shell: false });
    expect(vercelInvocation("win32")).toEqual({ command: "npx.cmd", args: expected, shell: true });
    expect(expected.some((arg) => arg.includes("--value"))).toBe(false);
  });

  test("redacts known secrets, verifiers, and connection strings", () => {
    const text = redactSecrets(`x secret-1 SCRAM-SHA-256$4096:abc$def:ghi ${pgScheme}://u:p@h/db`, ["secret-1"]);
    expect(text).not.toContain("secret-1");
    expect(text).not.toContain("SCRAM-SHA-256$4096");
    expect(text).not.toContain("u:p@h");
  });

  test("keeps only known columns and refuses foreign rows", () => {
    expect(parseLogins([{ name: existingName, can_login: "t", valid_until: "2027-01-01", expired: "f", sessions: "2", rolpassword: "x" }]))
      .toEqual([{ name: existingName, canLogin: true, validUntil: "2027-01-01", expired: false, sessions: 2 }]);
    expect(() => parseLogins([{ name: "postgres" }])).toThrow("Unexpected");
    expect(() => parseLogins({ rows: [] })).toThrow("Could not read");
  });
});

describe("hosted worker login commands", () => {
  test.each(["array", "object"] as const)("create works with the %s CLI output shape and never prints secrets", async (shape) => {
    const cli = fakeClis({ shape, logins: [{ name: existingName, canLogin: true }] });
    const { promise, stdout, stderr } = run(["create", "--project-ref", hostedRef], cli);
    await promise;

    const created = [...cli.logins.keys()].find((name) => name !== existingName)!;
    expect(created).toMatch(/^mmhr_hosted_worker_[0-9a-f]{32}$/);
    expect(cli.logins.get(created)?.canLogin).toBe(true);
    expect(stdout.text()).toContain(`Created hosted worker login ${created}`);
    expect(stdout.text()).toContain(`remove ${existingName} --project-ref ${hostedRef}`);

    const { url, credential } = handedSecret(cli);
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).toBe(`${pgScheme}://${created}.${hostedRef}:${credential}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`);
    const visible = [stdout.text(), stderr.text(), JSON.stringify(cli.supabaseCalls.map((call) => call.args)),
      JSON.stringify(cli.vercelCalls.map((call) => call.args)),
      cli.sqlFiles.join("\n")].join("\n");
    expect(visible).not.toContain(credential);
    expect(visible).not.toContain("postgresql://");
    expect(cli.sqlFiles.join("\n")).toMatch(/'SCRAM-SHA-256\$4096:[^']+'::text/);

    expect(cli.vercelCalls).toHaveLength(1);
    expect(cli.vercelCalls[0]!.args).toEqual(vercelInvocation("linux").args);
    expect(cli.vercelCalls[0]!.options.env).toMatchObject({ VERCEL_TELEMETRY_DISABLED: "1" });
    expect(cli.vercelCalls[0]!.options.env).not.toHaveProperty("DATABASE_URL");
    expect(cli.vercelCalls[0]!.options.cwd).toBe(linkedRoot);
    expect(cli.supabaseCalls.every((call) => call.args.includes(`--remote=${hostedRef}`))).toBe(true);
    expect(cli.supabaseCalls.every((call) => !("SUPABASE_ACCESS_TOKEN" in (call.env ?? {})))).toBe(true);
  });

  test("create removes the new login and fails closed when the Vercel step fails", async () => {
    const cli = fakeClis({ vercelStatus: 1, vercelEcho: true });
    const { promise, stdout, stderr } = run(["create", "--project-ref", hostedRef], cli);
    const error = await promise.then(() => undefined, (caught: Error) => caught);

    expect(error?.message).toContain("The Vercel CLI refused DATABASE_URL");
    expect(error?.message).toContain("was removed");
    expect(cli.logins.size).toBe(0);
    const order = cli.sqlFiles.map((sql) => sql.match(/r1_(create|disable|remove)_hosted_worker_login/)?.[1]).filter(Boolean);
    expect(order).toEqual(["create", "disable", "remove"]);
    const { credential } = handedSecret(cli);
    for (const text of [error?.message ?? "", stdout.text(), stderr.text()]) {
      expect(text).not.toContain(credential);
      expect(text).not.toContain("postgresql://");
    }
  });

  test("create tells the operator how to remove the login when the rollback also fails", async () => {
    const cli = fakeClis({ vercelStatus: 1, failQuery: "r1_disable_hosted_worker_login" });
    const { promise } = run(["create", "--project-ref", hostedRef], cli);
    await expect(promise).rejects.toThrow(/could not be removed[\s\S]*hosted-worker-login\.mjs remove mmhr_hosted_worker_/);
  });

  test("create refuses another project, an unlinked checkout, and the login limit before any write", async () => {
    let cli = fakeClis();
    await expect(run(["create", "--project-ref", otherRef], cli).promise).rejects.toThrow("not an approved");
    expect(cli.supabaseCalls).toHaveLength(0);
    expect(cli.vercelCalls).toHaveLength(0);

    cli = fakeClis();
    await expect(run(["create", "--project-ref", hostedRef], cli, { projectRoot: unlinkedRoot }).promise).rejects.toThrow("not linked to Vercel");
    expect(cli.supabaseCalls).toHaveLength(0);

    cli = fakeClis({ logins: [{ name: existingName, canLogin: true }, { name: secondName, canLogin: true }] });
    await expect(run(["create", "--project-ref", hostedRef], cli).promise).rejects.toThrow("Two hosted worker logins already exist");
    expect(cli.sqlFiles.some((sql) => sql.includes("r1_create_hosted_worker_login"))).toBe(false);
    expect(cli.vercelCalls).toHaveLength(0);
  });

  test("create refuses a CLI target line for another project", async () => {
    const cli = fakeClis();
    const spawn = (command: string, args: string[], options: SpawnOptions) => {
      const result = cli.spawn(command, args, options);
      return command === "supabase" ? { ...result, stderr: `Target: project other (${otherRef})` } : result;
    };
    await expect(run(["create", "--project-ref", hostedRef], cli, { spawn }).promise).rejects.toThrow("did not confirm target");
    expect(cli.vercelCalls).toHaveLength(0);
  });

  test("remove disables, then removes, then confirms", async () => {
    const cli = fakeClis({ shape: "object", logins: [{ name: existingName, canLogin: true }] });
    const { promise, stdout } = run(["remove", existingName, "--project-ref", hostedRef], cli);
    await promise;
    expect(stdout.text()).toContain(`Removed hosted worker login ${existingName}`);
    expect(cli.logins.size).toBe(0);
    const writes = cli.supabaseCalls.filter((call) => call.args.includes("--yes"));
    expect(writes).toHaveLength(2);
    expect(cli.vercelCalls).toHaveLength(0);
  });

  test("list is read-only and prints names and states only", async () => {
    const cli = fakeClis({ logins: [{ name: existingName, canLogin: true }, { name: secondName, canLogin: false }] });
    const { promise, stdout } = run(["list", "--project-ref", hostedRef], cli);
    await promise;
    expect(stdout.text()).toContain(`${existingName}  valid until 2027-02-13 12:00:00+00  active`);
    expect(stdout.text()).toContain(`${secondName}  valid until 2027-02-13 12:00:00+00  disabled`);
    expect(cli.supabaseCalls.every((call) => call.args.includes("--read-only"))).toBe(true);
  });

  test("refuses production mode", async () => {
    const cli = fakeClis();
    await expect(run(["list", "--project-ref", hostedRef], cli, { env: { NODE_ENV: "production" } }).promise).rejects.toThrow("production");
    expect(cli.supabaseCalls).toHaveLength(0);
  });

  test("has no direct database URL, console logging, or value argument", () => {
    const source = readFileSync(path.resolve(process.cwd(), "scripts/hosted-worker-login.mjs"), "utf8");
    expect(source).not.toContain("MIGRATION_DATABASE_URL");
    expect(source).not.toContain("console.");
    expect(source).not.toContain('"--value"');
    expect(source).not.toMatch(/write\([^)]*(credential|url)\b/);
  });
});
