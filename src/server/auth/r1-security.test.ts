import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { entryPointInventory } from "./entry-point-inventory";
import { permissionKeys } from "./permission-registry";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("R1 security evidence", () => {
  test("classifies every protected route with a server-side decision", () => {
    const protectedEntries = entryPointInventory.filter(
      (entry) => !["public", "framework"].includes(entry.access),
    );

    expect(protectedEntries.length).toBeGreaterThan(0);
    expect(protectedEntries.every((entry) => entry.permission.length > 0)).toBe(true);
    expect(protectedEntries.every((entry) => entry.scope.length > 0)).toBe(true);
    expect(protectedEntries.every((entry) => entry.denialEvidence.length > 0)).toBe(true);
  });

  test("keeps the current protected route guard wiring fail closed", () => {
    expect(source("src/app/(app)/home/page.tsx")).toContain("requireHomeAccess");
    expect(source("src/app/(admin)/admin/page.tsx")).toContain("requirePagePermission");
    expect(source("src/app/(app)/customer/layout.tsx")).toContain(
      "requireSelectedOrganizationPermission",
    );
    expect(source("src/app/(app)/vendor/layout.tsx")).toContain(
      "requireSelectedOrganizationPermission",
    );
    expect(source("src/server/auth/page-guards.ts")).toContain("forbidden()");
  });

  test("keeps the permission registry and source security contract present", () => {
    expect(permissionKeys.length).toBeGreaterThan(0);
    expect(existsSync(path.join(root, "docs/security/r1-authorization-matrix.md"))).toBe(true);
    const requestSecuritySources = [
      "src/server/auth/authorization.ts",
      "src/server/auth/page-guards.ts",
      "src/middleware.ts",
    ].map(source).join("\n");
    expect(requestSecuritySources).not.toMatch(/\.auth\.getSession\s*\(/);
  });

  test("runs the complete integration matrix inventory check", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-r1-integration-matrix.mjs"],
      { cwd: root, encoding: "utf8" },
    );

    expect(output).toMatch(/Integration matrix is complete: \d+ test files\./);
  });
});
