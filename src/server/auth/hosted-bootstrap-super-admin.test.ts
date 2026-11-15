import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";

import {
  allowedProjectRefs,
  assertSessionTerminal,
  checkBootstrapState,
  checkTokenOrder,
  completeSql,
  createRunner,
  main,
  parseArguments,
  parseBootstrapInput,
  parseVerifiedClaims,
  prepareSql,
  queryRows,
  readBootstrapState,
  redact,
  selectPublicApiKey,
  sqlReference,
  sqlTimestamp,
  sqlUuid,
} from "../../../scripts/hosted-bootstrap-super-admin.mjs";

const hostedRef = "mslbuffwyuckfmgoyivj";
const issuer = `https://${hostedRef}.supabase.co/auth/v1`;
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const firstSubject = "44444444-4444-4444-8444-444444444444";
const secondSubject = "55555555-5555-4555-8555-555555555555";
const sessionA = "66666666-6666-4666-8666-666666666666";
const sessionB = "77777777-7777-4777-8777-777777777777";
const correlationId = "33333333-3333-4333-8333-333333333333";
const firstToken = "first-synthetic-access-token-value";
const secondToken = "second-synthetic-access-token-value";
const prepareInput = {
  firstTargetIdentityId: firstId,
  secondTargetIdentityId: secondId,
  productApprovalReference: "product:approved-1",
  securityApprovalReference: "security:approved-1",
  correlationId,
};

function claims(sub: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return { sub, session_id: sessionId, role: "authenticated", aal: "aal2", iss: issuer,
    exp: Math.floor(Date.now() / 1000) + 600, ...overrides };
}

function sink(isTTY = false) {
  const chunks: string[] = [];
  return { isTTY, chunks, write(text: string) { chunks.push(String(text)); return true; } };
}

/** A fake Supabase CLI that records every argument and every SQL file it runs. */
function fakeCli(initialState: Record<string, unknown>) {
  const calls: string[][] = [];
  const sqlFiles: string[] = [];
  let state = { ...initialState };
  const spawn = (command: string, args: string[]) => {
    calls.push([command, ...args]);
    const target = `Target: project mmhr (${hostedRef}) · production`;
    if (args[0] === "projects") {
      return { status: 0, stderr: target, stdout: JSON.stringify({
        target: { project_ref: hostedRef },
        keys: [
          { type: "legacy", name: "anon", api_key: "legacy-anon-key-synthetic-value" },
          { type: "legacy", name: "service_role", api_key: "legacy-service-role-synthetic-value" },
          { type: "publishable", name: "default", api_key: "sb_publishable_syntheticvalue" },
          { type: "secret", name: "default", api_key: "masked-secret-value" },
        ],
      }) };
    }
    const sql = readFileSync(args[args.indexOf("-f") + 1], "utf8");
    sqlFiles.push(sql);
    if (sql.includes("r1_complete_super_admin_bootstrap")) {
      state = { ...state, state: "consumed", activePlatformRoles: 2 };
      return { status: 0, stderr: target, stdout: JSON.stringify({ rows: [{ result: "completed" }] }) };
    }
    if (sql.includes("r1_prepare_super_admin_bootstrap")) {
      state = { ...state, rows: 1, state: "prepared", firstTarget: firstId, secondTarget: secondId };
      return { status: 0, stderr: target, stdout: JSON.stringify({ rows: [{ result: "prepared" }] }) };
    }
    return { status: 0, stderr: target, stdout: JSON.stringify({ rows: [{ state }] }) };
  };
  return { spawn, calls, sqlFiles };
}

function fakeClientFactory(claimsByToken: Record<string, unknown>) {
  const seenTokens: string[] = [];
  const createClient = () => ({
    auth: {
      async getClaims(token: string) {
        seenTokens.push(token);
        const value = claimsByToken[token];
        return value ? { data: { claims: value }, error: null } : { data: null, error: new Error("invalid") };
      },
    },
  });
  return { createClient, seenTokens };
}

const preparedState = {
  rows: 1, state: "prepared", firstTarget: firstId, secondTarget: secondId,
  firstSubject, secondSubject, activePlatformRoles: 0,
};

describe("hosted Super Admin bootstrap arguments", () => {
  test("requires an explicit, approved project ref and has no default", () => {
    expect([...allowedProjectRefs]).toEqual([hostedRef]);
    expect(parseArguments(["prepare", "--project-ref", hostedRef])).toEqual({ mode: "prepare", projectRef: hostedRef });
    expect(parseArguments(["complete", `--project-ref=${hostedRef}`])).toEqual({ mode: "complete", projectRef: hostedRef });
    expect(() => parseArguments(["prepare"])).toThrow("--project-ref");
    expect(() => parseArguments(["prepare", "--project-ref"])).toThrow("--project-ref");
    expect(() => parseArguments(["prepare", "--project-ref", "abcdefghijklmnopqrst"])).toThrow("not an approved");
    expect(() => parseArguments(["prepare", "--project-ref", "MSLBUFFWYUCKFMGOYIVJ"])).toThrow("--project-ref");
    expect(() => parseArguments(["prepare", "--project-ref", hostedRef, "--project-ref", "abcdefghijklmnopqrst"]))
      .toThrow("standard input only");
  });

  test("rejects unknown modes and any value passed as an argument", () => {
    expect(() => parseArguments(["consume", "--project-ref", hostedRef])).toThrow("Usage");
    expect(() => parseArguments([])).toThrow("Usage");
    expect(() => parseArguments(["complete", "--project-ref", hostedRef, firstToken])).toThrow("standard input only");
    expect(() => parseArguments(["complete", "--project-ref", hostedRef, "--token", firstToken])).toThrow("standard input only");
  });
});

describe("hosted bootstrap input and claims", () => {
  test("keeps the local prepare rules", () => {
    expect(parseBootstrapInput(JSON.stringify(prepareInput), "prepare")).toEqual(prepareInput);
    expect(() => parseBootstrapInput(JSON.stringify({ ...prepareInput, secondTargetIdentityId: firstId }), "prepare"))
      .toThrow("distinct");
    expect(() => parseBootstrapInput(JSON.stringify({ ...prepareInput, securityApprovalReference: "product:approved-1" }), "prepare"))
      .toThrow("distinct");
    expect(() => parseBootstrapInput(JSON.stringify({ ...prepareInput, extra: true }), "prepare")).toThrow("unsupported field");
    expect(() => parseBootstrapInput(JSON.stringify({ ...prepareInput, productApprovalReference: "https://x.test/a" }), "prepare"))
      .toThrow("invalid");
    expect(() => parseBootstrapInput("[]", "prepare")).toThrow("one JSON object");
  });

  test("keeps the local complete rules for two distinct tokens", () => {
    const input = { firstAccessToken: firstToken, secondAccessToken: secondToken, correlationId };
    expect(parseBootstrapInput(JSON.stringify(input), "complete")).toEqual(input);
    expect(() => parseBootstrapInput(JSON.stringify({ ...input, secondAccessToken: firstToken }), "complete")).toThrow("distinct");
    expect(() => parseBootstrapInput(JSON.stringify({ ...input, firstAccessToken: "short" }), "complete")).toThrow("standard input");
    expect(() => parseBootstrapInput(JSON.stringify({ ...input, firstSubject }), "complete")).toThrow("unsupported field");
  });

  test("accepts only current AAL2 claims from the named project", () => {
    expect(parseVerifiedClaims(claims(firstSubject, sessionA), issuer)).toMatchObject({ subjectId: firstSubject, sessionId: sessionA });
    expect(() => parseVerifiedClaims(claims(firstSubject, sessionA, { aal: "aal1" }), issuer)).toThrow("AAL2");
    expect(() => parseVerifiedClaims(claims(firstSubject, sessionA, { exp: 1 }), issuer)).toThrow("AAL2");
    expect(() => parseVerifiedClaims(claims(firstSubject, sessionA, { role: "anon" }), issuer)).toThrow("AAL2");
    expect(() => parseVerifiedClaims(claims(firstSubject, sessionA, { iss: "https://abcdefghijklmnopqrst.supabase.co/auth/v1" }), issuer))
      .toThrow("named project");
  });
});

describe("hosted bootstrap SQL values", () => {
  test("validates every value before it enters a literal", () => {
    expect(sqlUuid(firstId.toUpperCase())).toBe(`'${firstId}'::uuid`);
    expect(() => sqlUuid("1'; DROP TABLE public.identities; --")).toThrow("UUID");
    expect(sqlReference("security:approved-1")).toBe("'security:approved-1'::text");
    expect(() => sqlReference("x' OR '1'='1")).toThrow("invalid");
    expect(() => sqlReference("approved\\1")).toThrow("invalid");
    expect(() => sqlReference("-leading")).toThrow("invalid");
    expect(() => sqlReference("a".repeat(121))).toThrow("invalid");
    expect(sqlTimestamp("2026-11-14T12:00:00.000Z")).toBe("'2026-11-14T12:00:00.000Z'::timestamptz");
    expect(() => sqlTimestamp("2026-11-14 12:00:00'::timestamptz; --")).toThrow("ISO");
    expect(() => sqlTimestamp("2026-02-30T12:00:00.000Z")).toThrow();
  });

  test("builds the function calls from validated values only", () => {
    const prepare = prepareSql(prepareInput);
    expect(prepare).toContain("mmhr_private.r1_prepare_super_admin_bootstrap(");
    expect(prepare).toContain(`'${secondId}'::uuid`);
    expect(prepare).toContain("'security:approved-1'::text");
    expect(() => prepareSql({ ...prepareInput, productApprovalReference: "a'b" })).toThrow("invalid");
    const first = { subjectId: firstSubject, sessionId: sessionA, expiresAt: "2026-11-14T12:00:00.000Z" };
    const second = { subjectId: secondSubject, sessionId: sessionB, expiresAt: "2026-11-14T12:05:00.000Z" };
    const complete = completeSql(first, second, correlationId);
    expect(complete).toContain("mmhr_private.r1_complete_super_admin_bootstrap(");
    expect(complete).toContain(`'${sessionB}'::uuid`);
    expect(() => completeSql({ ...first, sessionId: "not-a-uuid" }, second, correlationId)).toThrow("UUID");
  });
});

describe("hosted bootstrap state guard", () => {
  test("refuses a consumed bootstrap in every step", () => {
    const consumed = { ...preparedState, state: "consumed" };
    expect(() => checkBootstrapState(consumed, "prepare")).toThrow("already consumed");
    expect(() => checkBootstrapState(consumed, "complete")).toThrow("already consumed");
    expect(() => checkBootstrapState({ rows: 0, state: null, activePlatformRoles: 1 }, "prepare")).toThrow("platform roles");
  });

  test("allows prepare only on an empty state and complete only on a prepared state", () => {
    expect(checkBootstrapState({ rows: 0, state: null, activePlatformRoles: 0 }, "prepare")).toBeTruthy();
    expect(() => checkBootstrapState(preparedState, "prepare")).toThrow("already prepared");
    expect(() => checkBootstrapState({ rows: 0, state: null, activePlatformRoles: 0 }, "complete")).toThrow("Run prepare first");
    expect(checkBootstrapState(preparedState, "complete")).toBe(preparedState);
  });

  test("requires each token to match the prepared identity in the same position", () => {
    const first = { subjectId: firstSubject, sessionId: sessionA, expiresAt: "" };
    const second = { subjectId: secondSubject, sessionId: sessionB, expiresAt: "" };
    expect(() => checkTokenOrder(preparedState, first, second)).not.toThrow();
    expect(() => checkTokenOrder(preparedState, second, first)).toThrow("wrong order");
    expect(() => checkTokenOrder(preparedState, first, { ...second, subjectId: sessionB })).toThrow("do not belong");
  });
});

describe("hosted bootstrap secrets", () => {
  test("uses only the public key from the CLI listing", () => {
    const keys = [
      { type: "legacy", name: "service_role", api_key: "legacy-service-role-synthetic-value" },
      { type: "secret", name: "default", api_key: "masked-secret-value" },
      { type: "legacy", name: "anon", api_key: "legacy-anon-key-synthetic-value" },
      { type: "publishable", name: "default", api_key: "sb_publishable_syntheticvalue" },
    ];
    expect(selectPublicApiKey({ target: { project_ref: hostedRef }, keys }, hostedRef)).toBe("sb_publishable_syntheticvalue");
    expect(selectPublicApiKey({ target: { project_ref: hostedRef }, keys: keys.slice(0, 3) }, hostedRef))
      .toBe("legacy-anon-key-synthetic-value");
    expect(() => selectPublicApiKey({ target: { project_ref: hostedRef }, keys: keys.slice(0, 2) }, hostedRef)).toThrow("No publishable");
    expect(() => selectPublicApiKey({ target: { project_ref: "abcdefghijklmnopqrst" }, keys }, hostedRef)).toThrow("not for project");
  });

  test("redacts tokens, keys, and connection strings from CLI messages", () => {
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiJ4In0", "c2lnbmF0dXJl"].join(".");
    const text = redact(`failed ${jwt} sb_secret_abc123 sbp_abc123 postgresql://db.example.invalid/postgres`);
    expect(text).not.toContain(jwt);
    expect(text).not.toMatch(/sb_secret_abc123/);
    expect(text).not.toContain("sbp_abc123");
    expect(text).not.toContain("db.example.invalid");
  });
});

describe("hosted bootstrap CLI output shapes", () => {
  /** A fake CLI that prints one fixed stdout for every query. */
  function runnerWithStdout(stdout: string, status = 0) {
    const spawn = () => ({ status, stdout, stderr: `Target: project mmhr (${hostedRef}) · production` });
    return createRunner(hostedRef, { spawn: spawn as never, env: { NODE_ENV: "test" } });
  }

  const stateRow = { state: { rows: 0, state: null, activePlatformRoles: 0 } };
  const bootstrapStateSqlProbe = "SELECT 1;\n";

  test.each([
    ["a bare array in a human terminal", JSON.stringify([stateRow])],
    ["a boundary object in an agent environment", JSON.stringify({ boundary: "ab12", rows: [stateRow], warning: "untrusted" })],
  ])("reads rows from %s", (_name, stdout) => {
    const runner = runnerWithStdout(stdout);
    try {
      expect(runner.query(bootstrapStateSqlProbe, { readOnly: true })).toEqual([stateRow]);
      expect(readBootstrapState(runner)).toEqual(stateRow.state);
    } finally {
      runner.close();
    }
  });

  test.each([
    ["an object without rows", "{}"],
    ["a string", JSON.stringify("rows")],
    ["null", "null"],
    ["a non-array rows field", JSON.stringify({ rows: { state: {} } })],
  ])("fails closed on %s", (_name, stdout) => {
    const runner = runnerWithStdout(stdout);
    try {
      expect(() => runner.query(bootstrapStateSqlProbe, { readOnly: true })).toThrow("no query rows");
    } finally {
      runner.close();
    }
  });

  test("keeps the CLI error checks for the object shape", () => {
    for (const [stdout, status] of [
      [JSON.stringify({ _tag: "Error", message: "denied" }), 0],
      [JSON.stringify({ error: { message: "permission denied" } }), 0],
      [JSON.stringify([stateRow]), 1],
    ] as const) {
      const runner = runnerWithStdout(stdout, status);
      try {
        expect(() => runner.query(bootstrapStateSqlProbe, { readOnly: true })).toThrow("refused");
      } finally {
        runner.close();
      }
    }
  });

  test("returns an empty row array unchanged", () => {
    expect(queryRows([])).toEqual([]);
    expect(queryRows({ boundary: "ab12", rows: [] })).toEqual([]);
  });
});

describe("hosted bootstrap commands", () => {
  test("complete reads tokens from standard input and never prints or sends them to the CLI", async () => {
    const cli = fakeCli(preparedState);
    const clients = fakeClientFactory({
      [firstToken]: claims(firstSubject, sessionA),
      [secondToken]: claims(secondSubject, sessionB),
    });
    const stdout = sink();
    const stderr = sink();
    await main(["complete", "--project-ref", hostedRef], {
      stdin: Readable.from([JSON.stringify({ firstAccessToken: firstToken, secondAccessToken: secondToken, correlationId })]),
      stdout, stderr, env: { SUPABASE_ACCESS_TOKEN: "stale" }, spawn: cli.spawn, createClient: clients.createClient,
    });

    expect(stdout.chunks.join("")).toContain("Bootstrap completed");
    expect(clients.seenTokens).toEqual([firstToken, secondToken]);
    const everything = [stdout.chunks.join(""), stderr.chunks.join(""), JSON.stringify(cli.calls), cli.sqlFiles.join("\n")].join("\n");
    expect(everything).not.toContain(firstToken);
    expect(everything).not.toContain(secondToken);
    expect(cli.sqlFiles.join("\n")).toContain(`'${firstSubject}'::uuid`);
    expect(cli.calls.every((call) => call.some((arg) => arg === `--remote=${hostedRef}`))).toBe(true);
    expect(cli.calls.some((call) => call.includes("--reveal"))).toBe(false);
  });

  test("complete refuses an invalid token before any write", async () => {
    const cli = fakeCli(preparedState);
    const clients = fakeClientFactory({ [firstToken]: claims(firstSubject, sessionA, { aal: "aal1" }) });
    await expect(main(["complete", "--project-ref", hostedRef], {
      stdin: Readable.from([JSON.stringify({ firstAccessToken: firstToken, secondAccessToken: secondToken, correlationId })]),
      stdout: sink(), stderr: sink(), env: {}, spawn: cli.spawn, createClient: clients.createClient,
    })).rejects.toThrow("AAL2");
    expect(cli.sqlFiles.some((sql) => sql.includes("r1_complete_super_admin_bootstrap"))).toBe(false);
  });

  test("prepare refuses a consumed bootstrap before any write", async () => {
    const cli = fakeCli({ ...preparedState, state: "consumed" });
    await expect(main(["prepare", "--project-ref", hostedRef], {
      stdin: Readable.from([JSON.stringify(prepareInput)]), stdout: sink(), stderr: sink(), env: {}, spawn: cli.spawn,
    })).rejects.toThrow("already consumed");
    expect(cli.sqlFiles.some((sql) => sql.includes("r1_prepare_super_admin_bootstrap"))).toBe(false);
  });

  test("prepare runs the function once on an empty state and confirms the result", async () => {
    const cli = fakeCli({ rows: 0, state: null, activePlatformRoles: 0 });
    const stdout = sink();
    await main(["prepare", "--project-ref", hostedRef], {
      stdin: Readable.from([JSON.stringify(prepareInput)]), stdout, stderr: sink(), env: {}, spawn: cli.spawn,
    });
    expect(stdout.chunks.join("")).toContain("Bootstrap prepared");
    expect(cli.sqlFiles.filter((sql) => sql.includes("r1_prepare_super_admin_bootstrap"))).toHaveLength(1);
    const writes = cli.calls.filter((call) => call.includes("--yes"));
    expect(writes).toHaveLength(1);
  });

  test("refuses production mode, empty input, and a session without a terminal", async () => {
    await expect(main(["prepare", "--project-ref", hostedRef], { env: { NODE_ENV: "production" } })).rejects.toThrow("production");
    await expect(main(["prepare", "--project-ref", hostedRef], { stdin: Readable.from([""]), env: {} })).rejects.toThrow("required");
    expect(() => assertSessionTerminal({ stdin: { isTTY: false }, stdout: { isTTY: false } })).toThrow("interactive terminal");
    expect(() => assertSessionTerminal({ stdin: { isTTY: true, setRawMode() {} }, stdout: { isTTY: true } }))
      .toThrow("Capture the output");
    const cli = fakeCli(preparedState);
    await expect(main(["session", "--project-ref", hostedRef], {
      stdin: Readable.from([""]), stdout: sink(), stderr: sink(), env: {}, spawn: cli.spawn,
    })).rejects.toThrow("interactive terminal");
    expect(cli.calls).toHaveLength(0);
  });

  test("has no page, route, direct database URL, or console logging", () => {
    const source = readFileSync(path.resolve(process.cwd(), "scripts/hosted-bootstrap-super-admin.mjs"), "utf8");
    expect(source).not.toContain("MIGRATION_DATABASE_URL");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("--reveal\"");
    expect(source).not.toContain("NextResponse");
    expect(source).not.toMatch(/write\([^)]*AccessToken/);
  });
});
