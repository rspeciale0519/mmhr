import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
const migration = readFileSync(join(process.cwd(), "drizzle", "0058_r4_response_clarifications.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "workflow-foundation.ts"), "utf8");
describe("R4 response clarification migration", () => { test("links clarifications to normalized responses and deadlines", () => { expect(migration).toContain("response_normalization_id"); expect(migration).toContain("deadline_at"); expect(migration).toContain("rfp_clarifications_response_scope_fk"); }); test("audits replay-safe ask and response transitions", () => { expect(migration).toContain("r4.rsp.clarification"); expect(migration).toContain("r1_checked_receipt"); expect(migration).toContain("r1_finish_security_command"); }); test("keeps response reference and deadline checks aligned", () => { expect(schema).toContain("rfp_clarifications_response_reference_ck"); expect(schema).toContain("rfp_clarifications_deadline_ck"); }); });
