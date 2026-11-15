// @vitest-environment node
import { describe, expect, test } from "vitest";

import { createRunner, queryRows } from "../../../scripts/cloud-migration-install.mjs";

const hostedRef = "mslbuffwyuckfmgoyivj";
const probeSql = "SELECT 1;";
const stateRow = { state: { publicTables: 0, privateSchema: false, mmhrRoles: 0, journalTable: false } };

/** A fake Supabase CLI that prints one fixed stdout for every query and records each call. */
function runnerWithStdout(stdout: string, status = 0) {
  const calls: string[][] = [];
  const spawn = (command: string, args: string[]) => {
    calls.push([command, ...args]);
    return { status, stdout, stderr: `Target: project mmhr (${hostedRef}) · production` };
  };
  return { calls, runner: createRunner(hostedRef, { spawn: spawn as never, env: { NODE_ENV: "test" } }) };
}

describe("cloud migration install CLI output shapes", () => {
  test.each([
    ["a bare array in a human terminal", JSON.stringify([stateRow])],
    ["a boundary object in an agent environment", JSON.stringify({ boundary: "ab12", rows: [stateRow], warning: "untrusted" })],
  ])("reads rows from %s", (_name, stdout) => {
    const { runner, calls } = runnerWithStdout(stdout);
    try {
      expect(runner.query(probeSql)).toEqual([stateRow]);
      expect(runner.execute(probeSql)).toEqual({ ok: true, rows: [stateRow] });
      expect(calls.every((call) => call.includes(`--remote=${hostedRef}`))).toBe(true);
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
    const { runner } = runnerWithStdout(stdout);
    try {
      expect(() => runner.query(probeSql)).toThrow("no query rows");
      // A write with an unreadable result must stop the install, not report a rollback.
      expect(() => runner.execute(probeSql)).toThrow("result is unknown");
    } finally {
      runner.close();
    }
  });

  test("keeps the CLI error checks for the object shape and a non-zero exit", () => {
    for (const [stdout, status, message] of [
      [JSON.stringify({ _tag: "Error", message: "denied" }), 0, "denied"],
      [JSON.stringify({ error: { message: "permission denied" } }), 0, "permission denied"],
      [JSON.stringify([stateRow]), 1, "state"],
    ] as const) {
      const { runner } = runnerWithStdout(stdout, status);
      try {
        expect(runner.execute(probeSql)).toMatchObject({ ok: false });
        expect(() => runner.query(probeSql)).toThrow(`query failed`);
        expect(runner.execute(probeSql)).toMatchObject({ message: expect.stringContaining(message) });
      } finally {
        runner.close();
      }
    }
  });

  test("refuses output that the CLI did not confirm for the named project", () => {
    const spawn = () => ({ status: 0, stdout: "[]", stderr: "Target: project other (abcdefghijklmnopqrst)" });
    const runner = createRunner(hostedRef, { spawn: spawn as never, env: { NODE_ENV: "test" } });
    try {
      expect(() => runner.query(probeSql)).toThrow("did not confirm target");
    } finally {
      runner.close();
    }
  });

  test("returns an empty row array unchanged", () => {
    expect(queryRows([])).toEqual([]);
    expect(queryRows({ boundary: "ab12", rows: [] })).toEqual([]);
  });
});
