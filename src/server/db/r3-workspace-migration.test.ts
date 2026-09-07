import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0018_r3_workspace_persistence.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "r3-workspace.ts"), "utf8");

describe("R3 workspace migration review", () => {
  test("creates workspaces, snapshots, participants, and comments", () => {
    for (const table of ["workspaces", "workspace_snapshots", "workspace_participants", "workspace_comments"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every workspace table", () => {
    for (const table of ["workspaces", "workspace_snapshots", "workspace_participants", "workspace_comments"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw access for all runtime roles", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every workspace table", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(4);
  });

  test("binds workspace records to one organization and intake", () => {
    expect(migration).toContain("workspaces_intake_scope_fk");
    expect(migration).toContain("workspace_snapshots_workspace_scope_fk");
    expect(migration).toContain("workspaces_intake_uq");
  });

  test("bounds snapshots and preserves one revision per workspace", () => {
    expect(migration).toContain("workspace_snapshots_arrays_ck");
    expect(migration).toContain("workspace_snapshots_scope_revision_uq");
    expect(migration).toContain("workspace_snapshots_revision_ck");
  });

  test("validates participant roles, states, and unique membership", () => {
    expect(migration).toContain("workspace_participants_role_ck");
    expect(migration).toContain("workspace_participants_timestamps_ck");
    expect(migration).toContain("workspace_participants_scope_identity_uq");
  });

  test("keeps comments scoped, immutable, and visibility-labeled", () => {
    expect(migration).toContain("workspace_comments_workspace_scope_fk");
    expect(migration).toContain("workspace_comments_visibility_ck");
    expect(migration).toContain("R3 immutable workspace comments; customer views must filter internal visibility");
  });

  test("keeps Drizzle workspace scope, array, and lifecycle constraints aligned", () => {
    for (const name of ["workspaces_intake_scope_fk", "workspace_snapshots_workspace_scope_fk", "workspace_snapshots_arrays_ck", "workspace_participants_workspace_scope_fk", "workspace_participants_timestamps_ck", "workspace_comments_workspace_scope_fk"]) {
      expect(schema).toContain(name);
    }
  });
});
