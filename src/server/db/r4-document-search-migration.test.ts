import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/0083_r4_document_search.sql", "utf8");
const schema = readFileSync("src/server/db/schema/workflow-foundation.ts", "utf8");
describe("R4 document search migration", () => {
  test("adds approved content and scoped search RPCs", () => { expect(sql).toContain("approved_extracted_content"); expect(sql).toContain("mmhr_set_workflow_document_search_content"); expect(sql).toContain("mmhr_search_workflow_documents"); });
  test("restricts raw function access and approved-state search", () => { expect(sql).toContain("v.state = 'approved'"); expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_set_workflow_document_search_content"); });
  test("keeps the document search index aligned", () => { expect(schema).toContain("workflow_document_versions_search_idx"); });
});
