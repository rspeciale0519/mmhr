import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0117_r3_evaluation_publication_commands.sql"), "utf8");

describe("R3 publication workflow migration", () => {
  test("exposes separate prepare, publish, revoke, customer, and review RPCs", () => {
    expect(migration).toContain("public.mmhr_prepare_evaluation_publication");
    expect(migration).toContain("public.mmhr_publish_evaluation_publication");
    expect(migration).toContain("public.mmhr_revoke_evaluation_publication");
    expect(migration).toContain("public.mmhr_get_evaluation_publication");
    expect(migration).toContain("public.mmhr_review_evaluation_publication");
  });

  test("uses reviewed authority and binds every mutation to the verified actor", () => {
    expect(migration).toContain("r1_start_security_command('evaluation.publish'");
    expect(migration).toContain("r1_security_actor('admin.access',NULL::uuid");
    expect(migration).toContain("context.actor_identity_id");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
  });

  test("captures a complete immutable configuration and approved input snapshot", () => {
    expect(migration).toContain("r3_collect_publication_inputs");
    expect(migration).toContain("r3_publication_snapshot");
    expect(migration).toContain("'configuration',normalized_configuration");
    expect(migration).toContain("sha256(convert_to(snapshot::text,'UTF8'))");
    expect(migration).toContain("input_snapshot");
  });

  test("evaluates every product and assigns contiguous masked ordinals by score", () => {
    expect(migration).toContain("r3_evaluate_publication_option");
    expect(migration).toContain("ORDER BY (value->'evaluation'->>'deterministicScore')::integer DESC");
    expect(migration).toContain("ordinal := ordinal+1");
    expect(migration).toContain("'Option '||ordinal::text");
    expect(migration).not.toContain("Candidate-");
  });

  test("rejects stale publication inputs before approval", () => {
    expect(migration).toContain("Publication is stale or already decided");
    expect(migration).toContain("Publication inputs changed");
    expect(migration).toContain("current_digest<>publication.input_digest");
  });

  test("requires text approval references and reasons without JSON coercion", () => {
    expect(migration).toContain("jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'");
    expect(migration.match(/jsonb_typeof\(payload->'reason'\) IS DISTINCT FROM 'string'/g)).toHaveLength(2);
  });

  test("locks the intake and revokes prior active publications atomically", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("Superseded by the newer approved publication");
    expect(migration).toContain("'evaluation.publication.revoke'");
    expect(migration).toContain("decision='published'");
    expect(migration).toContain("decision='revoked'");
  });

  test("keeps decisions and records append-only", () => {
    expect(migration).toContain("evaluation_publication_decisions");
    expect(migration).toContain("REVOKE ALL ON TABLE public.evaluation_publications");
    expect(migration).toContain("r3_deny_raw_evaluation_publication_decisions");
  });

  test("keeps customer reads masked and separates internal review authority", () => {
    expect(migration).toContain("internal_requested boolean");
    expect(migration).toContain("portal.customer.access");
    expect(migration).toContain("evaluation.publish',v_org");
    expect(migration).toContain("admin.access',NULL::uuid");
    expect(migration).toContain("internal_requested AND NOT internal_read");
    expect(migration).toContain("'vendorOrganizationId'");
    expect(migration).not.toContain("'vendorOrganizationId',vendor");
    expect(migration).not.toContain("'productId',product");
  });

  test("requires the current published, non-revoked, non-stale customer publication", () => {
    expect(migration).toContain("state<>'published'");
    expect(migration).toContain("Publication is stale");
    expect(migration).toContain("mmhr_private.r3_publication_state(p.id)='published'");
    expect(migration).toContain("d.decision='revoked'");
    expect(migration).toContain("A newer publication already exists");
  });

  test("supports bounded cursor reads and the last returned ordinal cursor", () => {
    expect(migration).toContain("page_limit integer:=25");
    expect(migration).toContain("page_limit NOT BETWEEN 1 AND 50");
    expect(migration).toContain("o.ordinal>after_ordinal");
    expect(migration).toContain("next_ordinal:=next_ordinal-1");
    expect(migration).toContain("'nextOrdinal',next_ordinal");
  });

  test("denies raw table and function access to every runtime role", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.evaluation_publications");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_prepare_evaluation_publication");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_prepare_evaluation_publication(jsonb,uuid,uuid) TO authenticated");
  });
});
