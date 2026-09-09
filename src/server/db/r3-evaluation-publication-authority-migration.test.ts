import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0114_r3_evaluation_publication_authority.sql", "utf8");
const prior = readFileSync("drizzle/0110_r3_customer_intake_submit.sql", "utf8");
const registry = readFileSync("src/server/auth/permission-registry.ts", "utf8");

describe("R3 evaluation publication authority migration", () => {
  test("adds the exact internal organization-scoped permission", () => {
    expect(registry).toContain('"evaluation.publish"');
    expect(registry).toContain("platformScope: false, organizationScope: true");
    expect(registry).toContain('minimumAssurance: "aal2", internalOnly: true, requiredPortal: null');
    expect(registry).toContain("Review and publish masked evaluation options for an authorized customer organization.");
    expect(migration).toContain("('evaluation.publish', 'action', 'Review and publish masked evaluation options for an authorized customer organization.', false, true, 'aal2', true, NULL)");
  });

  test("synchronizes the complete reviewed registry before role changes", () => {
    expect(migration).toContain("SELECT mmhr_private.r1_lock_security();");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()");
    expect(migration).toContain("SELECT mmhr_private.r1_sync_permission_registry();");
    const currentStart = migration.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry");
    const currentEnd = migration.indexOf("SELECT mmhr_private.r1_sync_permission_registry()", currentStart);
    const priorStart = prior.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry");
    const priorEnd = prior.indexOf("SELECT mmhr_private.r1_sync_permission_registry()", priorStart);
    const addition = ",\n    ('evaluation.publish', 'action', 'Review and publish masked evaluation options for an authorized customer organization.', false, true, 'aal2', true, NULL)\n";
    const currentRegistry = migration.slice(currentStart, currentEnd);
    const priorRegistry = prior.slice(priorStart, priorEnd);
    expect(currentRegistry).toContain(addition.trimEnd());
    expect(currentRegistry.replace(addition, "")).toBe(priorRegistry);
    expect(migration.match(/\('(?:[^']|'')+', '(?:feature|action|field)'/g)).toHaveLength(37);
    expect(migration).not.toContain("UPDATE public.permission_definitions");
    expect(migration).not.toContain("DELETE FROM public.permission_definitions");
  });

  test("creates only the next Super Admin role version with an audited authority", () => {
    expect(migration).toContain("r.stable_key = 'super_admin' AND r.version = 7 AND r.state = 'active'");
    expect(migration).toContain("r.stable_key = 'super_admin' AND r.version = 8");
    expect(migration).toContain("VALUES (next_role.id, 'evaluation.publish', 'allow')");
    expect(migration).toContain("previous_authority_id");
    expect(migration).toContain("'reviewed_owner'");
    expect(migration).toContain("'role_versions.replace'");
    expect(migration).toContain("'role_version.deactivate'");
    expect(migration).toContain("'role_version.activate'");
    expect(migration).toContain("r1_assert_administration_capacity(checked_at)");
    expect(migration).not.toMatch(/stable_key = '(?:organization_admin|contributor|admin|staff)'/);
    expect(migration).not.toMatch(/UPDATE public\.role_permission_defaults|DELETE FROM public\.role_permission_defaults/);
  });

  test("preserves defaults, overrides, and recovery evidence", () => {
    expect(migration).toContain("SELECT next_role.id, d.permission_key, d.effect");
    expect(migration).toContain("FROM public.role_permission_defaults AS d");
    expect(migration).toContain("WHERE d.role_definition_id = prior.id");
    expect(migration).toContain("UPDATE public.role_definitions");
    expect(migration).toContain("INSERT INTO public.role_authority_records");
    expect(migration).toContain("INSERT INTO public.audit_events");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|DISABLE\s+TRIGGER|DISABLE\s+ROW LEVEL SECURITY/i);
  });
});
