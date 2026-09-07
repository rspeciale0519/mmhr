import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
const migration = readFileSync(join(process.cwd(), "drizzle", "0059_r4_response_failures.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "workflow-foundation.ts"), "utf8");
describe("R4 response failure migration", () => { test("keeps failures visible and terminal", () => { expect(migration).toContain("rfp_response_failures"); expect(migration).toContain("failure_detail"); expect(migration).toContain("state = 'failed'"); }); test("enforces scope, RLS, and audited replay protection", () => { expect(migration).toContain("rfp_response_failures_event_scope_fk"); expect(migration).toContain("r4.rsp.failure"); expect(migration).toContain("r1_checked_receipt"); expect(migration).toContain("r1_finish_security_command"); }); test("keeps failure association scope aligned", () => { expect(schema).toContain("rfp_response_failures_event_scope_fk"); expect(schema).toContain("rfp_response_failures_normalization_scope_fk"); }); });
