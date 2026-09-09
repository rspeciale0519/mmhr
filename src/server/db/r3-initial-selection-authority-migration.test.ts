import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0118_r3_initial_selection_authority.sql", "utf8").replaceAll("\r\n", "\n");
const prior = readFileSync("drizzle/0114_r3_evaluation_publication_authority.sql", "utf8").replaceAll("\r\n", "\n");
const registry = readFileSync("src/server/auth/permission-registry.ts", "utf8");

describe("R3 initial selection authority migration", () => {
  test("adds the exact customer-scoped AAL1 permission", () => {
    expect(registry).toContain('"evaluation.select"');
    expect(registry).toContain('minimumAssurance: "aal1", internalOnly: false, requiredPortal: "customer"');
    expect(registry).toContain("Select up to five published evaluation options in an authorized customer portal.");
    expect(migration).toContain("('evaluation.select', 'action', 'Select up to five published evaluation options in an authorized customer portal.', false, true, 'aal1', false, 'customer')");
  });

  test("synchronizes the complete reviewed registry before role changes", () => {
    expect(migration).toContain("SELECT mmhr_private.r1_lock_security();");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()");
    expect(migration).toContain("SELECT mmhr_private.r1_sync_permission_registry();");
    const currentStart = migration.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry");
    const currentEnd = migration.indexOf("SELECT mmhr_private.r1_sync_permission_registry()", currentStart);
    const priorStart = prior.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry");
    const priorEnd = prior.indexOf("SELECT mmhr_private.r1_sync_permission_registry()", priorStart);
    const addition = ",\n    ('evaluation.select', 'action', 'Select up to five published evaluation options in an authorized customer portal.', false, true, 'aal1', false, 'customer')";
    const currentRegistry = migration.slice(currentStart, currentEnd);
    const priorRegistry = prior.slice(priorStart, priorEnd);
    expect(currentRegistry).toContain(addition);
    const normalizeRegistryEnd = (value: string) => value.replace(/\s+/g, " ").trim();
    expect(normalizeRegistryEnd(currentRegistry.replace(addition, "")))
      .toBe(normalizeRegistryEnd(priorRegistry));
    expect(migration.match(/\('(?:[^']|'')+', '(?:feature|action|field)'/g)).toHaveLength(38);
    expect(migration).not.toContain("UPDATE public.permission_definitions");
    expect(migration).not.toContain("DELETE FROM public.permission_definitions");
  });

  test("creates only reviewed next versions for customer selection", () => {
    expect(migration).toContain("('super_admin'::text, 8)");
    expect(migration).toContain("('organization_admin'::text, 5)");
    expect(migration).toContain("('contributor'::text, 5)");
    expect(migration).toContain("VALUES (next_role.id, 'evaluation.select', 'allow')");
    expect(migration).toContain("previous_authority_id");
    expect(migration).toContain("'reviewed_owner'");
    expect(migration).toContain("'role_versions.replace'");
    expect(migration).toContain("'role_version.deactivate'");
    expect(migration).toContain("'role_version.activate'");
    expect(migration).toContain("r1_assert_administration_capacity(checked_at)");
    expect(migration).not.toMatch(/stable_key = '(?:admin|staff|viewer)'/);
    expect(migration).not.toMatch(/UPDATE public\.role_permission_defaults|DELETE FROM public\.role_permission_defaults/);
  });

  test("preserves defaults, overrides, and recovery evidence", () => {
    expect(migration).toContain("SELECT next_role.id, d.permission_key, d.effect");
    expect(migration).toContain("FROM public.role_permission_defaults d");
    expect(migration).toContain("WHERE d.role_definition_id = prior.id");
    expect(migration).toContain("UPDATE public.role_definitions");
    expect(migration).toContain("INSERT INTO public.role_authority_records");
    expect(migration).toContain("INSERT INTO public.audit_events");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|DISABLE\s+TRIGGER|DISABLE\s+ROW LEVEL SECURITY/i);
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(journal.entries).toContainEqual(expect.objectContaining({ idx: 118, tag: "0118_r3_initial_selection_authority" }));
  });
});
