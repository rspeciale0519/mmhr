import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const wrapper = "scripts/r1-with-local-worker.mjs";

describe("local worker development binding", () => {
  test("pins the approved development child to loopback before spawning", () => {
    const source = readFileSync(wrapper, "utf8");
    expect(source).toContain('if (isNextDevCommand) args.push("--hostname", "127.0.0.1")');
    expect(source.indexOf('args.push("--hostname"')).toBeLessThan(
      source.indexOf("const child = spawn(executable, args"),
    );
    expect(source).toMatch(/const isNextDevCommand =\s*command.length === 3/);
  });

  test.each([
    ["node", "node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0"],
    ["node", "node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1"],
    ["node", "node_modules/next/dist/bin/next", "start"],
    ["node", "-e", "process.exit(0)"],
  ])("refuses unapproved command %j before credential loading", (...command) => {
    const result = spawnSync(process.execPath, [wrapper, "--", ...command], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, MIGRATION_DATABASE_URL: "blocked" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The R1 worker wrapper refused an unexpected child command");
    expect(result.stdout).not.toContain("dotenv");
  });
});
