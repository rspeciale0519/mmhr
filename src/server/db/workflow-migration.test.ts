import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0015_r4_workflow_foundation.sql"), "utf8");

describe("R4 workflow migration review", () => {
  test("creates every required workflow table", () => {
    for (const table of [
      "rfp_versions",
      "rfp_recipients",
      "inbound_email_events",
      "workflow_documents",
      "workflow_document_versions",
      "workflow_communications",
      "workflow_jobs",
      "workflow_job_attempts",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every workflow table", () => {
    for (const table of [
      "rfp_versions",
      "rfp_recipients",
      "inbound_email_events",
      "workflow_documents",
      "workflow_document_versions",
      "workflow_communications",
      "workflow_jobs",
      "workflow_job_attempts",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw access before reviewed commands exist", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.rfp_versions");
    expect(migration).toContain("service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for anonymous and authenticated roles", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(8);
  });

  test("enforces RFP organization scope for recipients", () => {
    expect(migration).toContain("rfp_recipients_version_scope_fk");
    expect(migration).toContain("REFERENCES public.rfp_versions (organization_id, id)");
    expect(migration).toContain("rfp_versions_organization_id_uq");
  });

  test("enforces document and job organization scope", () => {
    expect(migration).toContain("workflow_document_versions_document_scope_fk");
    expect(migration).toContain("workflow_job_attempts_job_scope_fk");
    expect(migration).toContain("workflow_documents_organization_id_id_uq");
    expect(migration).toContain("workflow_jobs_organization_id_uq");
  });

  test("keeps provider replay and job idempotency keys unique", () => {
    expect(migration).toContain("inbound_email_provider_event_uq");
    expect(migration).toContain("workflow_communications_organization_idempotency_uq");
    expect(migration).toContain("workflow_jobs_organization_idempotency_uq");
  });

  test("documents the deny-first recovery posture", () => {
    expect(migration).toContain("distribution requires approval");
    expect(migration).toContain("bounded attempts and idempotency");
  });
});
