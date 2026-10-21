import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

function parseVersion(value: string) {
  const [major, minor, patch] = value.split(".").map(Number);
  return { major, minor, patch };
}

function isAtLeast(
  value: string,
  minimum: { major: number; minor: number; patch: number },
) {
  const version = parseVersion(value);
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}

test("Next.js is patched for the 2026 App Router advisories", () => {
  const pkg = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { dependencies: { next: string }; devDependencies: { "eslint-config-next": string } };

  // 16.4.1 is the October 2026 Active LTS security floor from
  // https://nextjs.org/blog/nextjs-security-update-october-14-2026
  const floor = { major: 16, minor: 4, patch: 1 };

  expect(isAtLeast(pkg.dependencies.next, floor)).toBe(true);
  expect(isAtLeast(pkg.devDependencies["eslint-config-next"], floor)).toBe(true);
});
