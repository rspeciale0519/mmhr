import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const migration = readFileSync(join(process.cwd(), "drizzle", "0044_r3_matching_rule_preview.sql"), "utf8");
describe("R3 matching rule preview migration", () => { test("returns bounded digest and count", () => { expect(migration).toContain("mmhr_preview_matching_rule_set"); expect(migration).toContain("rule_digest := encode(sha256"); expect(migration).toContain("rule_count := coalesce"); }); test("uses fixed audited access", () => { expect(migration).toContain("SET search_path = ''"); expect(migration).toContain("r1_start_security_command('workspace.access'"); expect(migration).toContain("r1_finish_security_command"); expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_preview_matching_rule_set"); }); });
