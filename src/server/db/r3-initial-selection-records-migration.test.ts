import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("registers publication and selection tables in the runtime schema", () => {
  const entry = readFileSync("src/server/db/index.ts", "utf8");
  for (const [name, file] of [["r3Publication", "r3-publication"], ["r3Selection", "r3-selection"]]) {
    expect(entry).toContain(`import * as ${name} from "./schema/${file}";`);
    expect(entry).toContain(`...${name},`);
    expect(entry).toContain(`export * from "./schema/${file}";`);
  }
});

import { applicationMigrationCount, applicationTables } from "./test/application-schema-inventory";

const migration = readFileSync("drizzle/0119_r3_initial_selection_records.sql", "utf8");

test.each(["evaluation_initial_selections", "evaluation_initial_selection_items"])("keeps %s private and immutable", (table) => {
  expect(applicationTables).toContain(table);
  expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  expect(migration).toContain(`BEFORE UPDATE OR DELETE ON public.${table}`);
  expect(migration).toContain(`BEFORE TRUNCATE ON public.${table}`);
  expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  expect(migration).toContain("AS RESTRICTIVE FOR ALL");
  expect(migration).not.toMatch(/GRANT\s+\w+/i);
});

test.each([
  ["evaluation_initial_selections_binding_uq", "evaluation_initial_selection_items_batch_fk"],
  ["evaluation_candidates_intake_id_uq", "evaluation_initial_selection_items_candidate_fk"],
  ["evaluation_publication_options_publication_id_uq", "evaluation_initial_selection_items_option_fk"],
  ["evaluation_publications_intake_id_uq", "evaluation_initial_selections_publication_fk"],
])("creates referenced index %s before its scoped constraint", (index, constraint) => {
  const indexPosition = migration.indexOf(`CREATE UNIQUE INDEX "${index}"`);
  expect(indexPosition).toBeGreaterThan(0);
  expect(indexPosition).toBeLessThan(migration.indexOf(`ADD CONSTRAINT "${constraint}"`));
});

test("binds candidate intake and publication option scope without rewriting old candidates", () => {
  expect(migration).toContain('FOREIGN KEY ("organization_id","intake_id","candidate_id")');
  expect(migration).toContain('FOREIGN KEY ("organization_id","publication_id","option_id")');
  expect(migration).toContain('FOREIGN KEY ("organization_id","selection_id","intake_id","publication_id")');
  expect(migration).not.toMatch(/UPDATE\s+public\.evaluation_candidates|DELETE FROM|DROP TABLE|DISABLE/i);
  expect(migration).toContain('"initial_candidate_count" between "evaluation_initial_selections"."selected_count" and 5');
  expect(applicationMigrationCount).toBeGreaterThanOrEqual(121);
});
