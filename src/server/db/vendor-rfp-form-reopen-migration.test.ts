import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Reads the migration as text. These checks run without a database.
const sql = readFileSync("drizzle/0181_vendor_rfp_form_reopen.sql", "utf8").replaceAll("\r\n", "\n");

// The same text without comment lines, for checks on what the SQL really runs.
const statements = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

describe("vendor RFP form reopen migration", () => {
  test("adds one definer function and changes nothing that exists", () => {
    expect(sql.match(/CREATE FUNCTION/g)).toHaveLength(1);
    expect(sql).toContain("CREATE FUNCTION public.mmhr_vendor_rfp_form_reopen(p_token_hash text)");
    expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
    expect(statements).not.toMatch(/CREATE OR REPLACE|CREATE TABLE|ALTER TABLE|CREATE POLICY|DROP (TABLE|FUNCTION|POLICY|INDEX|CONSTRAINT)|DISABLE ROW LEVEL SECURITY/);
    expect(sql).toContain("-- Recovery (run by hand)");
  });

  test("finds the form by the token hash only and reopens only a submitted form before its due date", () => {
    expect(sql).toContain("WHERE f.token_hash = p_token_hash FOR UPDATE");
    expect(sql).toContain("IF v_form.state <> 'submitted' OR v_form.due_at <= clock_timestamp() THEN");
    // The only columns written are the state, the submitted date, and the update time.
    expect(sql).toContain("SET state = 'sent', submitted_at = NULL,\n    updated_at = clock_timestamp() WHERE id = v_form.id;");
    expect(statements).not.toMatch(/answers\s*=|DELETE FROM/);
    expect(sql).toContain("VALUES (v_form.id, 'reopened')");
  });

  test("is open to link visitors and closed to every other role", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_vendor_rfp_form_reopen(text)\n  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;");
    expect(sql.match(/GRANT [^;]+;/g)).toEqual(["GRANT EXECUTE ON FUNCTION public.mmhr_vendor_rfp_form_reopen(text) TO anon, authenticated;"]);
  });
});
