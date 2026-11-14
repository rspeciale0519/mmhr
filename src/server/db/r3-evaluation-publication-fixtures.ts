import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import {
  asAuthenticated,
  createCommandFixture,
  createMembership,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTokenPrincipal,
  type SecuritySql,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

export const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const REQUIREMENT_KEY = "input_payroll";
export const CONFIG = {
  version: 1,
  criteria: [{ requirementKey: REQUIREMENT_KEY, factKey: REQUIREMENT_KEY, responsePath: [] }],
} as const;

export type RpcResult = Record<string, unknown>;
export type SeededInput = { productId: string; sourceId: string; evidenceId: string; input: Record<string, unknown> };

export { createCommandFixture };

export function fixtureDates() {
  const now = Date.now();
  return {
    capturedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    freshUntil: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    expiredAt: new Date(now - 60 * 60 * 1000).toISOString(),
  };
}

export async function addContributor(sql: SecurityTransaction, organizationId: string, principal: SecurityTokenPrincipal) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.org_members (org_id, identity_id, user_id, role, role_key, migration_review_required)
    VALUES (${organizationId}::uuid, ${principal.identityId}::uuid, ${principal.subject}::uuid,
      'contributor'::public.org_role, 'contributor', false) RETURNING id
  `;
  return row!.id;
}

export async function addPortalGrant(sql: SecurityTransaction, organizationId: string, issuer: string) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.portal_access_grants (organization_id, portal, issued_by_identity_id, issue_reason)
    VALUES (${organizationId}::uuid, 'customer'::public.portal_kind, ${issuer}::uuid,
      'Evaluation publication integration fixture') RETURNING id
  `;
  return row!.id;
}

export async function seedSubmittedIntake(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  principal: SecurityTokenPrincipal,
) {
  const intakeId = randomUUID();
  await sql`
    INSERT INTO public.intakes (
      id, organization_id, status, company_context, current_systems, compliance_needs,
      budget, timeline, stakeholders, decision_process, created_by_identity_id,
      updated_by_identity_id, revision
    ) VALUES (
      ${intakeId}::uuid, ${fixture.organizationId}::uuid, 'in_progress',
      '{"sector":"services"}'::jsonb, '["payroll"]'::jsonb, '["soc2"]'::jsonb,
      '{"range":"mid"}'::jsonb, '{"months":3}'::jsonb, '["owner"]'::jsonb,
      '{"process":"committee"}'::jsonb, ${principal.identityId}::uuid,
      ${principal.identityId}::uuid, 1
    )
  `;
  const requirement = {
    requirementId: randomUUID(), organizationId: fixture.organizationId, intakeId,
    expectedRevision: 0, stableKey: REQUIREMENT_KEY, label: "Payroll platform",
    importance: "must", weight: 100, response: "yes", requirementType: "structured",
  };
  await asAuthenticated(sql, principal, async (probe) => {
    await probe`
      SELECT public.mmhr_save_customer_intake_requirement(
        ${JSON.stringify(requirement)}::text::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid
      )
    `;
    await probe`
      SELECT public.mmhr_submit_customer_intake(
        ${JSON.stringify({ organizationId: fixture.organizationId, intakeId, expectedRevision: 1 })}::text::jsonb,
        ${randomUUID()}::uuid, ${randomUUID()}::uuid
      )
    `;
  }, "aal1");
  return intakeId;
}

export async function seedVendorOption(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  index: number,
  options: { productId?: string; capturedAt?: string; freshUntil?: string; sourceActive?: boolean; fieldKey?: string; factValue?: string } = {},
): Promise<SeededInput> {
  const dates = fixtureDates();
  const capturedAt = options.capturedAt ?? dates.capturedAt;
  const freshUntil = options.freshUntil ?? dates.freshUntil;
  const fieldKey = options.fieldKey ?? REQUIREMENT_KEY;
  const factValue = options.factValue ?? "yes";
  const organizationId = randomUUID();
  const profileId = randomUUID();
  const productId = options.productId ?? randomUUID();
  const sourceId = randomUUID();
  const factId = randomUUID();
  const evidenceId = randomUUID();
  const reviewId = randomUUID();
  await sql`
    INSERT INTO public.orgs (id, name, type, status, activated_at, migration_review_required)
    VALUES (${organizationId}::uuid, ${`Publication vendor ${index} ${organizationId}`}, 'vendor',
      'active', ${capturedAt}::timestamptz, false)
  `;
  await createMembership(sql, organizationId, fixture.organizationAdmin, "organization_admin");
  await sql`
    INSERT INTO public.vendor_profiles (id, organization_id, status, approved_at, approved_by_identity_id,
      created_by_identity_id, updated_by_identity_id)
    VALUES (${profileId}::uuid, ${organizationId}::uuid, 'active', ${capturedAt}::timestamptz,
      ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid,
      ${fixture.pair[0].identityId}::uuid)
  `;
  await sql`
    INSERT INTO public.products (id, organization_id, vendor_profile_id, stable_key, name, status,
      created_by_identity_id, updated_by_identity_id)
    VALUES (${productId}::uuid, ${organizationId}::uuid, ${profileId}::uuid,
      ${`publication_product_${index}`}, ${`Publication product ${index}`}, 'active',
      ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
  `;
  await sql`
    INSERT INTO public.vendor_sources (id, organization_id, vendor_profile_id, uri, source_type,
      captured_at, active, created_by_identity_id)
    VALUES (${sourceId}::uuid, ${organizationId}::uuid, ${profileId}::uuid,
      ${`https://vendor.example.test/publication/${index}`}, 'manual', ${capturedAt}::timestamptz,
      ${options.sourceActive ?? true}, ${fixture.pair[0].identityId}::uuid)
  `;
  await sql`
    INSERT INTO public.vendor_facts (id, organization_id, vendor_profile_id, product_id, field_key,
      value, observed_at, status, created_by_identity_id)
    VALUES (${factId}::uuid, ${organizationId}::uuid, ${profileId}::uuid, ${productId}::uuid,
      ${fieldKey}, ${factValue}, ${capturedAt}::timestamptz, 'published',
      ${fixture.pair[0].identityId}::uuid)
  `;
  await sql`
    INSERT INTO public.vendor_evidence_versions (id, organization_id, fact_id, source_id, version,
      content_hash, captured_at, fresh_until, citation)
    VALUES (${evidenceId}::uuid, ${organizationId}::uuid, ${factId}::uuid, ${sourceId}::uuid,
      1, ${HASH}, ${capturedAt}::timestamptz, ${freshUntil}::timestamptz,
      ${`Publication evidence ${index}`})
  `;
  await sql`
    INSERT INTO public.vendor_fact_reviews (id, organization_id, evidence_id, reviewer_identity_id,
      decision, decided_at, reason)
    VALUES (${reviewId}::uuid, ${organizationId}::uuid, ${evidenceId}::uuid,
      ${fixture.pair[0].identityId}::uuid, 'approved', ${capturedAt}::timestamptz,
      'Publication integration approval')
  `;
  return {
    productId, sourceId, evidenceId,
    input: {
      fact_id: factId, field_key: fieldKey, value: factValue, provenance: "evidence",
      evidence_id: evidenceId, source_id: sourceId, review_id: reviewId, evidence_version: 1,
      content_hash: HASH, observed_at: capturedAt, captured_at: capturedAt, valid_until: freshUntil,
      override_id: null, approved_at: capturedAt,
    },
  };
}

export async function prepare(sql: SecurityTransaction, principal: SecurityPrincipal, payload: Record<string, unknown>, assurance: "aal1" | "aal2" = "aal2", correlationId = randomUUID(), idempotencyKey = randomUUID()) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_prepare_evaluation_publication(
        ${JSON.stringify(payload)}::text::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

export async function publish(sql: SecurityTransaction, principal: SecurityPrincipal, payload: Record<string, unknown>, assurance: "aal1" | "aal2" = "aal2", correlationId = randomUUID(), idempotencyKey = randomUUID()) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_publish_evaluation_publication(
        ${JSON.stringify(payload)}::text::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

export async function revoke(sql: SecurityTransaction, principal: SecurityPrincipal, payload: Record<string, unknown>, assurance: "aal1" | "aal2" = "aal2", correlationId = randomUUID(), idempotencyKey = randomUUID()) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RpcResult }[]>`
      SELECT public.mmhr_revoke_evaluation_publication(
        ${JSON.stringify(payload)}::text::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

export async function readPublication(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  functionName: "review" | "get",
  payload: Record<string, unknown>,
  assurance: "aal1" | "aal2" = "aal2",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = functionName === "review"
      ? await probe<{ result: RpcResult }[]>`
          SELECT public.mmhr_review_evaluation_publication(
            ${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid
          ) AS result
        `
      : await probe<{ result: RpcResult }[]>`
          SELECT public.mmhr_get_evaluation_publication(
            ${JSON.stringify(payload)}::text::jsonb, ${randomUUID()}::uuid
          ) AS result
        `;
    return row!.result;
  }, assurance);
}

export function publicationPayload(organizationId: string, intakeId: string, publicationId: string, afterOrdinal: number | null, limit: number) {
  return { organizationId, intakeId, publicationId, afterOrdinal, limit };
}

export async function expectAppendOnlyFailure(
  sql: SecurityTransaction,
  statement: (probe: SecurityTransaction) => Promise<unknown>,
) {
  await expect(sql.savepoint(statement)).rejects.toMatchObject({
    message: expect.stringContaining("append-only"),
  });
}

export async function publicationArtifacts(sql: SecuritySql, publicationId: string) {
  const [row] = await sql<{ audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.audit_events WHERE entity_id = ${publicationId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts WHERE entity_id = ${publicationId}::uuid) AS receipts
  `;
  return row!;
}
