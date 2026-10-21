import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { selectTaskRequestMigration } from "./r8-task-request-migration-selection";
import { prepareTaskRequestEvidenceMigration, type RehearsalContext } from "../r1-migration-rehearsal";
import { createSecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

const additive = `ALTER TABLE "deal_follow_up_events" ADD COLUMN "original_request" jsonb;
CREATE FUNCTION mmhr_private.r8_task_assert_request_evidence(
PERFORM mmhr_private.r8_task_assert_request_evidence(NEW);
correlation_id,payload);`;
function fixture(extra = false) {
  const tags = ["0159_r8_deal_follow_ups", ...(extra ? ["9998_synthetic_unrelated"] : []), "9999_synthetic_request_evidence"];
  const journal = { version: "7", dialect: "postgresql", entries: tags.map((tag,idx) => ({idx,version:"7",when:idx+1,tag,breakpoints:true})) };
  return {journal,sql:new Map(tags.map(tag => [tag,tag.endsWith("request_evidence") ? additive : "SELECT 1;"]))};
}
describe("Guarded task historical migration selection", () => {
  afterEach(() => vi.unstubAllEnvs());
  test.each([false,true])("finds the semantic boundary without a future index, extra=%s", extra => {
    const input = fixture(extra), result = selectTaskRequestMigration(JSON.stringify(input.journal),input.sql);
    expect(result.boundary).toBe(extra ? 2 : 1); expect(result.boundaryTag).toBe("9999_synthetic_request_evidence");
    expect(result.journal.entries).toEqual(input.journal.entries);
  });
  test("recognizes the current reviewed repository expansion without selecting a numeric index", () => {
    const source = path.join(process.cwd(),"drizzle"), journalText = readFileSync(path.join(source,"meta/_journal.json"),"utf8");
    const journal = JSON.parse(journalText) as {entries:{tag:string}[]};
    const sql = new Map(journal.entries.map(entry => {
      if (!/^\d{4}_[a-z0-9_-]+$/.test(entry.tag)) throw new Error("Invalid repository migration tag");
      return [entry.tag,readFileSync(path.join(source,`${entry.tag}.sql`),"utf8")] as const;
    }));
    const selected = selectTaskRequestMigration(journalText,sql);
    expect(selected.journal.entries.slice(0,selected.boundary).some(entry => entry.tag==="0159_r8_deal_follow_ups")).toBe(true);
    expect(sql.get(selected.boundaryTag)).toContain("CREATE FUNCTION mmhr_private.r8_task_assert_request_evidence(");
    expect(readFileSync(path.join(source,"meta/_journal.json"),"utf8")).toBe(journalText);
    console.info("R8 historical boundary source",{tag:selected.boundaryTag,prefix:selected.boundary,total:selected.journal.entries.length});
  });
  test.each([
    ["unsafe path", (input: ReturnType<typeof fixture>) => { input.journal.entries[1]!.tag="../outside"; }],
    ["duplicate tag", (input: ReturnType<typeof fixture>) => { input.journal.entries[1]!.tag=input.journal.entries[0]!.tag; }],
    ["wrong index", (input: ReturnType<typeof fixture>) => { input.journal.entries[1]!.idx=3; }],
    ["repeated timestamp", (input: ReturnType<typeof fixture>) => { input.journal.entries[1]!.when=1; }],
    ["wrong baseline", (input: ReturnType<typeof fixture>) => { input.journal.entries[0]!.tag="0159_unreviewed"; input.sql.set("0159_unreviewed","SELECT 1;"); }],
    ["missing file", (input: ReturnType<typeof fixture>) => { input.sql.delete(input.journal.entries[1]!.tag); }],
    ["missing helper", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[1]!.tag,"SELECT 1;"); }],
    ["missing expansion", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[1]!.tag,additive.replace('ALTER TABLE "deal_follow_up_events" ADD COLUMN "original_request" jsonb;','')); }],
    ["required column", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[1]!.tag,additive.replace('"original_request" jsonb;','"original_request" jsonb NOT NULL;')); }],
    ["duplicate helper", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[1]!.tag,additive+additive); }],
    ["two candidates", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[0]!.tag,additive); }],
    ["missing writer", (input: ReturnType<typeof fixture>) => { input.sql.set(input.journal.entries[1]!.tag,additive.replace('correlation_id,payload);','')); }],
  ] as const)("refuses %s", (_name,mutate) => {
    const input = fixture(); mutate(input);
    expect(() => selectTaskRequestMigration(JSON.stringify(input.journal),input.sql)).toThrow();
  });
  test.each(["{}",'{"version":"7","dialect":"sqlite","entries":[]}',"[]","null"])("refuses invalid journal %s", value => {
    expect(() => selectTaskRequestMigration(value,new Map())).toThrow();
  });
  test("refuses unregistered context before any database or file access", async () => {
    vi.stubEnv("NODE_ENV","test"); vi.stubEnv("R1_MIGRATION_REHEARSAL","1");
    await expect(prepareTaskRequestEvidenceMigration({} as RehearsalContext)).rejects.toThrow("An active owned task Auth rehearsal is required");
  });
  test("refuses production mode before any database or file access", async () => {
    vi.stubEnv("NODE_ENV","production"); vi.stubEnv("R1_MIGRATION_REHEARSAL","1");
    await expect(prepareTaskRequestEvidenceMigration({} as RehearsalContext)).rejects.toThrow("An active owned task Auth rehearsal is required");
  });
  test("refuses missing rehearsal opt-in before any database or file access", async () => {
    vi.stubEnv("NODE_ENV","test"); vi.stubEnv("R1_MIGRATION_REHEARSAL","");
    await expect(prepareTaskRequestEvidenceMigration({} as RehearsalContext)).rejects.toThrow("An active owned task Auth rehearsal is required");
  });
  test("refuses an unknown fixture stage before starting services", async () => {
    await expect(createSecurityCommandApiFixtures({ migrationStage: "invalid" } as never)).rejects.toThrow("Invalid disposable task migration stage");
  });
});
