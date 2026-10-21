import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const migration=readFileSync(join(process.cwd(),"drizzle","0075_r8_project_plan_commands.sql"),"utf8");
describe("R8 project-plan migration",()=>{test("defines audited RPC and approval gates",()=>{expect(migration).toContain("mmhr_record_project_plan");expect(migration).toContain("template.approved");expect(migration).toContain("r1_finish_security_command");expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_project_plan");});test("checks organization-scoped deals and revisions",()=>{expect(migration).toContain("Project-plan deal denied");expect(migration).toContain("Project-plan edit denied");expect(migration).toContain("plan.revision<>v_revision");});});
