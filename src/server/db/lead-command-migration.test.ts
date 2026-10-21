import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0011_r2b_lead_command.sql"), "utf8");
const correction = readFileSync(join(process.cwd(), "drizzle", "0033_r2a_lead_create_ambiguity_fix.sql"), "utf8");

describe("R2A lead command migration review", () => {
  test("adds organization, routing, replay, and correlation fields", () => {
    for (const column of [
      "organization_id",
      "routing_owner_identity_id",
      "normalized_source",
      "idempotency_key",
      "request_digest",
      "correlation_id",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.leads ADD COLUMN ${column}`);
    }
  });

  test("keeps lead ownership references and lookup indexes scoped", () => {
    expect(migration).toContain("leads_organization_id_orgs_id_fk");
    expect(migration).toContain("leads_routing_owner_identity_id_identities_id_fk");
    expect(migration).toContain("leads_idempotency_key_uq");
    expect(migration).toContain("leads_organization_status_idx");
  });

  test("closes raw lead-table access for every runtime role", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.leads");
    expect(migration).toContain("PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("enforces status and request-digest data boundaries", () => {
    expect(migration).toContain("leads_status_ck");
    expect(migration).toContain("leads_request_digest_ck");
    expect(migration).toContain("NOT VALID");
  });

  test("requires consent and idempotency before creating a lead", () => {
    expect(migration).toContain("OR idempotency_key IS NULL");
    expect(migration).toContain("OR consent_at IS NULL");
    expect(migration).toContain("OR consent_at > statement_timestamp()");
  });

  test("uses a security-definer command with a fixed search path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_create_lead(");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
  });

  test("records replay conflicts and successful creation in the audit trail", () => {
    expect(migration).toContain("idempotency_conflict");
    expect(migration).toContain("'replayed'::text");
    expect(migration).toContain("INSERT INTO public.audit_events");
    expect(migration).toContain("mmhr_create_lead.idempotency_key");
  });

  test("limits the public command to reviewed request roles", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_create_lead");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_create_lead");
    expect(migration).toContain("TO anon, authenticated;");
  });

  test("corrective migration isolates public argument names from SQL columns", () => {
    expect(correction).toContain("CREATE FUNCTION mmhr_private.r2a_create_lead_impl(");
    expect(correction).toContain("WHERE l.idempotency_key = p_idempotency_key");
    expect(correction).toContain("CREATE OR REPLACE FUNCTION public.mmhr_create_lead(");
    expect(correction).toContain("RETURNING * INTO new_lead");
  });
});
