import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R4 response clarification RPC", () => {
  let context: RehearsalContext | undefined; let fixture: SecurityCommandFixture;
  beforeAll(async () => { context = await startRehearsal("r4-response-clarifications"); await applyAllMigrations(context); fixture = await context.client.begin((sql) => createCommandFixture(sql)); }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  test("records a response clarification with deadline and reply", async () => { await rollbackCase(context!, async (sql) => {
    const intakeId = randomUUID(); const rfpId = randomUUID(); const vendorId = randomUUID(); const eventId = randomUUID(); const normalizationId = randomUUID(); const clarificationId = randomUUID();
    await sql`INSERT INTO public.intakes (id, organization_id, status, revision, submitted_at, created_by_identity_id, updated_by_identity_id) VALUES (${intakeId}::uuid, ${fixture.organizationId}::uuid, 'submitted', 1, clock_timestamp(), ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions (id, organization_id, rfp_id, source_intake_id, version, status, title, sections, approved_by_identity_id, approved_at, approval_reference, created_by_identity_id) VALUES (${rfpId}::uuid, ${fixture.organizationId}::uuid, ${rfpId}::uuid, ${intakeId}::uuid, 1, 'approved', 'RFP', '[{"sectionKey":"fit","title":"Fit","questionCount":1}]'::jsonb, ${fixture.organizationAdmin.identityId}::uuid, clock_timestamp(), 'approval:one', ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.vendor_profiles (id, organization_id, status, created_by_identity_id, updated_by_identity_id) VALUES (${vendorId}::uuid, ${fixture.organizationId}::uuid, 'active', ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.inbound_email_events (id, provider_event_id, organization_id, conversation_token, sender_address, recipient_addresses, body_reference, attachment_references, raw_body_hash, signed_at, received_at, signature, rfp_version_id, vendor_profile_id, association_state) VALUES (${eventId}::uuid, 'provider:clarify-response', ${fixture.organizationId}::uuid, 'conv:clarify-response', 'vendor@example.com', '["rfp@example.com"]'::jsonb, 'blob:body', '[]'::jsonb, ${"e".repeat(64)}, clock_timestamp(), clock_timestamp(), 'sig:clarify-response', ${rfpId}::uuid, ${vendorId}::uuid, 'associated')`;
    await sql`INSERT INTO public.rfp_response_normalizations (id, organization_id, inbound_event_id, rfp_version_id, vendor_profile_id, supported_requirements, created_by_identity_id) VALUES (${normalizationId}::uuid, ${fixture.organizationId}::uuid, ${eventId}::uuid, ${rfpId}::uuid, ${vendorId}::uuid, '[]'::jsonb, ${fixture.pair[0].identityId}::uuid)`;
    const invoke = async (payload: Record<string, unknown>, principal: SecurityCommandFixture["pair"][number]) => asAuthenticated(sql, principal, async (probe) => { const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_rfp_response_clarification(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid) AS result`; return row!.result; });
    const common = { clarificationId, normalizationId, organizationId: fixture.organizationId, rfpId, version: 1 };
    await expect(invoke({ ...common, action: "ask", actorIdentityId: fixture.pair[0].identityId, question: "Please confirm the SLA.", deadlineAt: "2030-01-02T00:00:00Z" }, fixture.pair[0])).resolves.toMatchObject({ status: "pending", normalizationId });
    await expect(invoke({ ...common, action: "respond", actorIdentityId: fixture.pair[0].identityId, answer: "The SLA is four hours.", decision: "accepted", responseReference: "vendor:reply-1" }, fixture.pair[0])).resolves.toMatchObject({ status: "answered", decision: "accepted", responseReference: "vendor:reply-1" });
  }); }, 120_000);
});
