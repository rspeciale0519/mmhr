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
      "requirePortalPageAccess",
    );
    expect(source("src/app/(app)/vendor/layout.tsx")).toContain(
      "requirePortalPageAccess",
    );
    expect(source("src/server/auth/portal/portal-guards.ts")).toContain(
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

  test("keeps R0 and R9 evidence references on canonical artifacts", () => {
    const evidence = readFileSync(
      path.join(root, "docs/security/r1-evidence.md"),
      "utf8",
    );

    expect(evidence).toContain(
      "drizzle/0023_r9_evidence_persistence.sql",
    );
    expect(evidence).toContain(
      ".codex/plans/module-r0-roadmap-and-public-release-control.md",
    );
    expect(evidence).not.toContain("drizzle/0044_r9_evidence_persistence.sql");
    expect(evidence).not.toContain("docs/security/r0-public-claim-inventory.md");
  });

  test("labels stale integration results as historical", () => {
    const evidence = readFileSync(
      path.join(root, "docs/security/r1-evidence.md"),
      "utf8",
    );

    expect(evidence).toContain("Historical local verification:");
    expect(evidence).toContain("2026-09-08 current verification boundary");
    expect(evidence).toContain("npipe:////./pipe/docker_engine");
    expect(evidence).not.toContain("Current branch verification: the latest");
  });

  test("keeps every referenced local evidence artifact present", () => {
    const evidence = readFileSync(
      path.join(root, "docs/security/r1-evidence.md"),
      "utf8",
    );
    const references = [...evidence.matchAll(/`((?:\.codex|src|drizzle|scripts|docs)\/[^`]+)`/g)]
      .map((match) => match[1])
      .filter((reference): reference is string => Boolean(reference));
    const missing = references.filter((reference) => {
      const segments = reference.split("/");
      for (let length = segments.length; length > 0; length -= 1) {
        if (existsSync(path.join(root, segments.slice(0, length).join("/")))) {
          return false;
        }
      }
      return true;
    });

    expect(missing).toEqual([]);
  });

  test("runs the complete integration matrix inventory check", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-r1-integration-matrix.mjs"],
      { cwd: root, encoding: "utf8" },
    );

    expect(output).toMatch(/Integration matrix is complete: \d+ test files\./);
  }, 30_000);
});
