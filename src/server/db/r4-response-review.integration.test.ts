import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 response review RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-response-review"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("requires distinct review and approval with replay", async () => { await rollbackCase(context!, async (sql) => {
    const intakeId = randomUUID(); const rfpId = randomUUID(); const vendorId = randomUUID(); const eventId = randomUUID(); const normalizationId = randomUUID();
    await sql`INSERT INTO public.intakes (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 1, clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions (id, organization_id, rfp_id, source_intake_id, version, status, title, sections, approved_by_identity_id, approved_at, approval_reference, created_by_identity_id) VALUES (${rfpId}::uuid, ${fixture.organizationId}::uuid, ${rfpId}::uuid, ${intakeId}::uuid, 1, 'approved', 'RFP', '[{"sectionKey":"fit","title":"Fit","questionCount":1}]'::jsonb, ${fixture.organizationAdmin.identityId}::uuid, clock_timestamp(), 'approval:one', ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.vendor_profiles (id, organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${vendorId}::uuid, ${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.inbound_email_events (id, provider_event_id, organization_id, conversation_token, sender_address, recipient_addresses, body_reference, attachment_references, raw_body_hash, signed_at, received_at, signature, rfp_version_id, vendor_profile_id, association_state) VALUES (${eventId}::uuid, 'provider:review', ${fixture.organizationId}::uuid, 'conv:review', 'vendor@example.com', '["rfp@example.com"]'::jsonb, 'blob:body', '[]'::jsonb, ${"d".repeat(64)}, clock_timestamp(), clock_timestamp(), 'sig:review', ${rfpId}::uuid, ${vendorId}::uuid, 'associated')`;
    await sql`INSERT INTO public.rfp_response_normalizations (id, organization_id, inbound_event_id, rfp_version_id, vendor_profile_id, supported_requirements, created_by_identity_id) VALUES (${normalizationId}::uuid, ${fixture.organizationId}::uuid, ${eventId}::uuid, ${rfpId}::uuid, ${vendorId}::uuid, '[{"key":"fit"}]'::jsonb, ${fixture.pair[0].identityId}::uuid)`;
    const invoke = async (principal: SecurityCommandFixture["pair"][number] | SecurityCommandFixture["organizationAdmin"], payload: Record<string, unknown>, correlationId: string, key: string) => asAuthenticated(sql, principal, async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_review_rfp_response_normalization(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${key}::uuid) AS result`; return row!.result; });
    const common = { normalizationId, organizationId: fixture.organizationId, rfpId, version: 1 };
    const reviewed = await invoke(fixture.organizationAdmin, { ...common, action: "review", actorIdentityId: fixture.organizationAdmin.identityId }, randomUUID(), randomUUID()); expect(reviewed).toMatchObject({ state: "reviewed", reviewedByIdentityId: fixture.organizationAdmin.identityId });
    const approval = { ...common, action: "approve", actorIdentityId: fixture.pair[0].identityId, approvalReference: "approval:response-1" }; const correlationId = randomUUID(); const key = randomUUID();
    await expect(invoke(fixture.pair[0], approval, correlationId, key)).resolves.toMatchObject({ state: "approved", approvedByIdentityId: fixture.pair[0].identityId });
    await expect(invoke(fixture.pair[0], approval, correlationId, key)).resolves.toMatchObject({ state: "approved", outcomeCode: "replayed" });
  }); }, 120_000);
});
