import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 response normalization RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-response-normalization"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("records bounded normalization as pending and replays", async () => { await rollbackCase(context!, async (sql) => {
    const intakeId = randomUUID(); const rfpId = randomUUID(); const vendorId = randomUUID(); const eventId = randomUUID(); const normalizationId = randomUUID();
    await sql`INSERT INTO public.intakes (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 1, clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions (id, organization_id, rfp_id, source_intake_id, version, status, title, sections, approved_by_identity_id, approved_at, approval_reference, created_by_identity_id) VALUES (${rfpId}::uuid, ${fixture.organizationId}::uuid, ${rfpId}::uuid, ${intakeId}::uuid, 1, 'approved', 'RFP', '[{"sectionKey":"fit","title":"Fit","questionCount":2}]'::jsonb, ${fixture.organizationAdmin.identityId}::uuid, clock_timestamp(), 'approval:one', ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.vendor_profiles (id, organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${vendorId}::uuid, ${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.inbound_email_events (id, provider_event_id, organization_id, conversation_token, sender_address, recipient_addresses, subject, body_reference, attachment_references, raw_body_hash, signed_at, received_at, signature, rfp_version_id, vendor_profile_id, association_state) VALUES (${eventId}::uuid, 'provider:normalize', ${fixture.organizationId}::uuid, 'conv:normalize', 'vendor@example.com', '["rfp@example.com"]'::jsonb, 'Response', 'blob:body', '["blob:file"]'::jsonb, ${"c".repeat(64)}, clock_timestamp(), clock_timestamp(), 'sig:normalize', ${rfpId}::uuid, ${vendorId}::uuid, 'associated')`;
    const payload = { normalizationId, eventId, organizationId: fixture.organizationId, rfpId, version: 1, vendorProfileId: vendorId, actorIdentityId: fixture.pair[0].identityId, supportedRequirements: [{ key: "fit", note: "supported" }], unsupportedRequirements: [], caveats: ["Subject to review"], dependencies: [], commitments: [], implementationDetails: [], missingAnswers: ["SLA"], proposedFollowUps: ["Confirm SLA"] };
    const correlationId = randomUUID(); const idempotencyKey = randomUUID();
    const run = async () => asAuthenticated(sql, fixture.pair[0], async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_rfp_response_normalization(${JSON.stringify(payload)}::jsonb, ${correlationId}::uuid, ${idempotencyKey}::uuid) AS result`; return row!.result; });
    await expect(run()).resolves.toMatchObject({ normalizationId, eventId, rfpId, vendorProfileId: vendorId, state: "pending", outcomeCode: "recorded" });
    await expect(run()).resolves.toMatchObject({ normalizationId, state: "pending", outcomeCode: "replayed" });
  }); }, 120_000);
  test("denies cross-organization normalization", async () => { await rollbackCase(context!, async (sql) => {
    const payload = { normalizationId: randomUUID(), eventId: randomUUID(), organizationId: "99999999-9999-4999-8999-999999999999", rfpId: randomUUID(), version: 1, vendorProfileId: randomUUID(), actorIdentityId: fixture.pair[0].identityId, supportedRequirements: [], unsupportedRequirements: [], caveats: [], dependencies: [], commitments: [], implementationDetails: [], missingAnswers: [], proposedFollowUps: [] };
    await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT public.mmhr_record_rfp_response_normalization(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`)).rejects.toMatchObject({ code: "42501" });
  }); }, 120_000);
});
