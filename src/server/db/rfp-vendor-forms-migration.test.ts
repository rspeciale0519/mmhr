import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Reads the migration as text. These checks run without a database.
const sql = readFileSync("drizzle/0180_rfp_vendor_forms.sql", "utf8").replaceAll("\r\n", "\n");
const tables = ["rfp_vendor_form_events", "rfp_vendor_form_files", "rfp_vendor_forms", "vendor_rfp_contacts"];
const vendorFunctions = ["read(text)", "save(text, jsonb)", "submit(text, text, text)", "file_add(text, text, text, text, text)",
  "file_remove(text, uuid)"].map((name) => `public.mmhr_vendor_rfp_form_${name}`);

describe("RFP vendor forms migration", () => {
  test("adds four private tables with row security on and changes nothing that exists", () => {
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE "mmhr_private"."${table}"`);
      expect(sql).toContain(`ALTER TABLE "mmhr_private"."${table}" ENABLE ROW LEVEL SECURITY;`);
    }
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(4);
    expect(sql).not.toMatch(/CREATE OR REPLACE|CREATE POLICY|DROP (TABLE|FUNCTION|POLICY|INDEX|CONSTRAINT)|DISABLE ROW LEVEL SECURITY|ALTER TABLE "public"/);
    expect(sql).toContain("-- Recovery (run by hand");
  });

  test("every function is a definer with an empty search path", () => {
    const functions = sql.match(/CREATE FUNCTION [^\n]+\n(?:[^\n]*\n)?RETURNS [^\n]+/g)!;
    expect(functions).toHaveLength(15);
    for (const header of functions) expect(header).toContain("SET search_path = ''");
    // The one function that is not a definer only maps text to text.
    expect(functions.filter((header) => !header.includes("SECURITY DEFINER")).map((header) => header.split("(")[0]))
      .toEqual(["CREATE FUNCTION mmhr_private.r4_vendor_form_audit_state"]);
  });

  test("only the five link functions are open to visitors who are not signed in", () => {
    const grants = sql.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g)!;
    expect(grants).toHaveLength(2);
    const [staff, vendor] = grants;
    expect(staff).toMatch(/TO authenticated;$/);
    expect(staff).not.toContain("mmhr_vendor_rfp_form_");
    expect(vendor).toMatch(/TO anon, authenticated;$/);
    for (const name of vendorFunctions) expect(vendor).toContain(name);
    expect(vendor!.match(/public\.mmhr_/g)).toHaveLength(5);
    expect(sql).not.toMatch(/GRANT (?!EXECUTE)/);
  });

  test("staff functions check staff access and staff changes are audited", () => {
    const body = (name: string) => sql.slice(sql.indexOf(`CREATE FUNCTION public.${name}(`), sql.indexOf("\n$$;", sql.indexOf(`CREATE FUNCTION public.${name}(`)));
    for (const name of ["mmhr_get_vendor_rfp_contacts", "mmhr_get_rfp_send_out", "mmhr_get_rfp_vendor_form", "mmhr_get_vendor_rfp_tracking",
      "mmhr_get_rfp_vendor_form_file"]) expect(body(name)).toContain("r1_request_has_permission('admin.access', NULL)");
    for (const name of ["mmhr_set_vendor_rfp_contact", "mmhr_prepare_rfp_vendor_form", "mmhr_record_rfp_vendor_form_event"]) {
      expect(body(name)).toContain("mmhr_private.r1_start_security_command(");
      expect(body(name)).toContain("mmhr_private.r1_checked_receipt(");
      expect(body(name)).toContain("mmhr_private.r1_finish_security_command(");
    }
    // Vendor functions never look a form up by anything but the token hash.
    for (const name of ["save", "submit", "file_add", "file_remove"]) {
      expect(body(`mmhr_vendor_rfp_form_${name}`)).toContain("WHERE f.token_hash = p_token_hash FOR UPDATE");
    }
  });
});
