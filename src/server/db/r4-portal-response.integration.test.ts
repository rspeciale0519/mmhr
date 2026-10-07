import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
import { portalResponsePageSchema } from "@/server/commands/rfp-portal-response";
import { portalClarificationPageSchema } from "@/lib/portal-clarification";
import { demoCoordinationPageSchema, demoHistoryPageSchema } from "@/lib/demo-coordination";

describe("Portal responses with genuine Auth and separate customer/vendor organizations", () => {
  let fixture: SecurityCommandApiFixtures;
  let invalidInputTarget: Awaited<ReturnType<typeof requestFixture>>;
  let responseJourneyTarget: Awaited<ReturnType<typeof requestFixture>>;
  let lateResponseTarget: Awaited<ReturnType<typeof requestFixture>>;
  const vendorOrg = randomUUID(), vendorProfile = randomUUID(), productId = randomUUID();
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    const { owner, pair, outsider } = fixture;
    await owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${vendorOrg}::uuid,'Synthetic response vendor','vendor','active',now(),false)`;
    await owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${vendorOrg}::uuid,${outsider.identityId}::uuid,${outsider.subjectId}::uuid,'contributor','contributor',false),
      (${vendorOrg}::uuid,${fixture.organizationAdmin.identityId}::uuid,${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false),
      (${fixture.organizationId}::uuid,${pair[0].identityId}::uuid,${pair[0].subjectId}::uuid,'contributor','contributor',false),
      (${fixture.organizationId}::uuid,${pair[1].identityId}::uuid,${pair[1].subjectId}::uuid,'contributor','contributor',false)`;
    await owner`INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
      VALUES(${vendorOrg}::uuid,'vendor',${pair[0].identityId}::uuid,'Disposable response fixture'),
      (${fixture.organizationId}::uuid,'customer',${pair[0].identityId}::uuid,'Disposable response fixture')`;
    await owner`UPDATE public.org_members SET role='contributor',role_key='contributor'
      WHERE id=${fixture.targetMembershipId}::uuid`;
    for (const [actor, issuer] of [[pair[0], pair[1]], [pair[1], pair[0]]] as const) {
      await owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${actor.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,
        ${"organization:" + fixture.organizationId},'allow',${issuer.identityId}::uuid,'Disposable response fixture')`;
    }
    await owner`INSERT INTO public.vendor_profiles(id,organization_id,status,approved_at,approved_by_identity_id,created_by_identity_id,updated_by_identity_id)
      VALUES(${vendorProfile}::uuid,${vendorOrg}::uuid,'active',now(),${pair[0].identityId}::uuid,${pair[0].identityId}::uuid,${pair[0].identityId}::uuid)`;
    await owner`INSERT INTO public.products(id,organization_id,vendor_profile_id,stable_key,name,status,created_by_identity_id,updated_by_identity_id)
      VALUES(${productId}::uuid,${vendorOrg}::uuid,${vendorProfile}::uuid,'synthetic_response_product','Synthetic payroll','active',${pair[0].identityId}::uuid,${pair[0].identityId}::uuid)`;
    const sourceId = randomUUID(), factId = randomUUID(), evidenceId = randomUUID();
    await owner`INSERT INTO public.vendor_sources(id,organization_id,vendor_profile_id,uri,source_type,captured_at,active,created_by_identity_id)
      VALUES(${sourceId}::uuid,${vendorOrg}::uuid,${vendorProfile}::uuid,'https://example.invalid/portal-response-fixture','manual',now()-interval '1 day',true,${pair[0].identityId}::uuid)`;
    await owner`INSERT INTO public.vendor_facts(id,organization_id,vendor_profile_id,product_id,field_key,value,observed_at,status,created_by_identity_id)
      VALUES(${factId}::uuid,${vendorOrg}::uuid,${vendorProfile}::uuid,${productId}::uuid,'input_payroll','yes',now()-interval '1 day','published',${pair[0].identityId}::uuid)`;
    await owner`INSERT INTO public.vendor_evidence_versions(id,organization_id,fact_id,source_id,version,content_hash,captured_at,fresh_until,citation)
      VALUES(${evidenceId}::uuid,${vendorOrg}::uuid,${factId}::uuid,${sourceId}::uuid,1,${"a".repeat(64)},now()-interval '1 day',now()+interval '2 days','Synthetic response test evidence')`;
    await owner`INSERT INTO public.vendor_fact_reviews(organization_id,evidence_id,reviewer_identity_id,decision,decided_at,reason)
      VALUES(${vendorOrg}::uuid,${evidenceId}::uuid,${pair[0].identityId}::uuid,'approved',now()-interval '1 hour','Synthetic response test evidence')`;
    for (const actor of pair) {
      const claims = await verifiedApiClaims(elevatedClient(actor), "aal2");
      const [checks] = await owner`SELECT
        mmhr_private.r1_session_is_aal2(${actor.subjectId}::uuid,${claims.sessionId}::uuid,clock_timestamp()) AS session,
        mmhr_private.r1_verified_identity(${actor.identityId}::uuid,true) AS identity,
        EXISTS(SELECT 1 FROM public.identities WHERE status='recovery_pending') AS recovery`;
      expect(checks).toEqual({ session: true, identity: true, recovery: false });
    }
    await owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    // These rejection cases never write a response. Share the approved request
    // instead of repeating the full publication and delivery journey per case.
    invalidInputTarget = await requestFixture();
    responseJourneyTarget = await requestFixture();
    lateResponseTarget = await requestFixture(3000);
  }, 300000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180000);
  const response = { supportedRequirements: ["Payroll exports are supported."], unsupportedRequirements: [],
    caveats: ["A reviewed implementation plan is required."], dependencies: [], commitments: [],
    implementationDetails: [], missingAnswers: [], proposedFollowUps: [] };
  async function requestFixture(deadlineMs = 7 * 86400000) {
    const { owner, pair, organizationId } = fixture;
    const intake = randomUUID(), rfp = randomUUID();
    await owner`INSERT INTO public.intakes(id,organization_id,status,revision,submitted_at,created_by_identity_id,updated_by_identity_id)
      VALUES(${intake}::uuid,${organizationId}::uuid,'submitted',1,now(),${pair[0].identityId}::uuid,${pair[0].identityId}::uuid)`;
    await owner`INSERT INTO public.intake_requirements(organization_id,intake_id,stable_key,label,importance,weight,response,created_by_identity_id,updated_by_identity_id)
      VALUES(${organizationId}::uuid,${intake}::uuid,'input_payroll','Payroll support','nice',1,'"yes"'::jsonb,${pair[0].identityId}::uuid,${pair[0].identityId}::uuid)`;
    const staff = elevatedClient(pair[0]);
    const authorization = await staff.rpc("mmhr_authorize", { permission_key: "evaluation.publish", organization_id: organizationId });
    expect(authorization.error).toBeNull();
    expect(authorization.data).toHaveLength(1);
    async function command(client: SupabaseClient, name: string, payload: object) {
      const result = await client.rpc(name, { payload, correlation_id: randomUUID(), idempotency_key: randomUUID() });
      if (result.error) throw new Error(`Synthetic setup ${name}: ${result.error.code} ${result.error.message}`);
      return result.data;
    }
    const prepared = await command(staff, "mmhr_prepare_evaluation_publication", { organizationId, intakeId: intake, expectedRevision: 1,
      configuration: { version: 1, criteria: [{ requirementKey: "input_payroll", factKey: "input_payroll", responsePath: [] }] } });
    await command(staff, "mmhr_publish_evaluation_publication", { organizationId, publicationId: prepared.publicationId,
      expectedDigest: prepared.inputDigest, approvalReference: "approval:synthetic-response-options", reason: "Synthetic rehearsal only" });
    const publication = await staff.rpc("mmhr_review_evaluation_publication", { payload: {
      organizationId, intakeId: intake, publicationId: prepared.publicationId, afterOrdinal: 0, limit: 25,
    }, correlation_id: randomUUID() });
    if (publication.error) throw new Error("Synthetic publication read failed");
    await command(fixture.membershipTarget.aal1, "mmhr_select_initial_evaluation_options", {
      organizationId, intakeId: intake, publicationId: prepared.publicationId, expectedDigest: prepared.inputDigest,
      optionIds: [publication.data.options[0].optionId],
    });
    const disclosure = await staff.rpc("mmhr_get_evaluation_disclosure_review", { payload: {
      organizationId, intakeId: intake, pageSize: 25,
    }, correlation_id: randomUUID() });
    if (disclosure.error) throw new Error("Synthetic disclosure read failed");
    await command(staff, "mmhr_record_evaluation_disclosure", { organizationId, intakeId: intake,
      candidateId: disclosure.data.items[0].candidateId, expectedReviewDigest: disclosure.data.items[0].reviewDigest,
      discussionAt: new Date(Date.now() - 60000).toISOString(), discussionReference: "Synthetic customer discussion",
      conflictDisclosure: "Synthetic commission disclosure", reason: "Synthetic rehearsal only" });
    await command(staff, "mmhr_create_rfp_questionnaire", { organizationId, intakeId: intake, rfpId: rfp, sourceRevision: 1,
      title: "Synthetic response RFP", content: "Describe payroll export support and all conditions." });
    await command(elevatedClient(pair[1]), "mmhr_approve_rfp_version", { organizationId, rfpId: rfp, version: 1,
      actorIdentityId: pair[1].identityId, approvalReference: "approval:synthetic-response-rfp" });
    const workflow = await staff.rpc("mmhr_get_rfp_workflow", { payload: { organizationId, intakeId: intake }, correlation_id: randomUUID() });
    if (workflow.error) throw new Error("Synthetic RFP read failed");
    await command(staff, "mmhr_deliver_rfp_to_portals", { organizationId, rfpId: rfp, version: 1,
      deadlineAt: new Date(Date.now() + deadlineMs).toISOString(), expectedDigest: workflow.data.rfps[0].deliveryDigest });
    const [recipient] = await owner<{ id: string }[]>`SELECT rr.id FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id
      WHERE r.rfp_id=${rfp}::uuid AND rr.vendor_organization_id=${vendorOrg}::uuid`;
    return { intake, rfp, recipient: recipient!.id, candidateId: disclosure.data.items[0].candidateId as string };
  }
  function submitInput(recipientId: string, expectedRevision = 0) { return { organizationId: vendorOrg, recipientId, expectedRevision, response }; }
  async function submit(payload: object, key = randomUUID(), client = fixture.outsider.aal1) {
    return client.rpc("mmhr_submit_portal_response", { payload, correlation_id: randomUUID(), idempotency_key: key });
  }
  async function read(view: "vendor" | "staff" | "customer", target: string, client?: SupabaseClient) {
    const organizationId = view === "vendor" ? vendorOrg : fixture.organizationId;
    return (client ?? (view === "vendor" ? fixture.outsider.aal1 : view === "staff" ? elevatedClient(fixture.pair[0]) : fixture.membershipTarget.aal1))
      .rpc("mmhr_get_portal_responses", { payload: { organizationId, view, ...(view === "vendor" ? { recipientId: target } : { intakeId: target }) }, correlation_id: randomUUID() });
  }
  async function review(action: string, normalizationId: string, rfpId: string, index: 0 | 1, extra = {}) {
    const actor = fixture.pair[index];
    return elevatedClient(actor).rpc("mmhr_review_rfp_response_normalization", { payload: {
      action, normalizationId, organizationId: fixture.organizationId, rfpId, version: 1, actorIdentityId: actor.identityId,
      ...(action === "approve" ? { approvalReference: "approval:synthetic-portal-review" } : {}), ...extra,
    }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
  }
  async function clarify(payload: object, client: SupabaseClient, key = randomUUID()) {
    return client.rpc("mmhr_record_portal_response_clarification", { payload, correlation_id: randomUUID(), idempotency_key: key });
  }
  async function clarifications(view: "vendor" | "staff" | "customer", target: string, client?: SupabaseClient) {
    const organizationId = view === "vendor" ? vendorOrg : fixture.organizationId;
    return (client ?? (view === "vendor" ? fixture.outsider.aal1 : view === "staff" ? elevatedClient(fixture.pair[0]) : fixture.membershipTarget.aal1))
      .rpc("mmhr_get_portal_response_clarifications", { payload: { organizationId, view,
        ...(view === "vendor" ? { recipientId: target } : { intakeId: target }) }, correlation_id: randomUUID() });
  }
  test("submits, reviews, and publishes only after a different staff approver acts", async () => {
    const target = responseJourneyTarget;
    const saved = await submit(submitInput(target.recipient));
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ organizationId: vendorOrg, recipientId: target.recipient, revision: 1, outcomeCode: "submitted" });
    expect((await read("customer", target.intake)).data.items).toEqual([]);
    const vendor = await read("vendor", target.recipient);
    expect(vendor.error).toBeNull();
    expect(vendor.data).toMatchObject({ currentRevision: 1, items: [{ response, state: "pending", canApprove: false }] });
    expect((await review("approve", saved.data.normalizationId, target.rfp, 1)).error?.code).toBe("42501");
    expect((await review("review", saved.data.normalizationId, target.rfp, 0)).error).toBeNull();
    expect((await read("customer", target.intake)).data.items).toEqual([]);
    expect((await review("approve", saved.data.normalizationId, target.rfp, 0)).error?.code).toBe("42501");
    expect((await review("approve", saved.data.normalizationId, target.rfp, 1)).error).toBeNull();
    const customer = await read("customer", target.intake);
    expect(customer.error).toBeNull();
    expect(customer.data.items).toMatchObject([{ response, state: "approved", canReview: false, canApprove: false, reviewedByIdentityId: null }]);
    const [association] = await fixture.owner`SELECT n.organization_id,n.vendor_organization_id,e.source_type
      FROM public.rfp_response_normalizations n JOIN public.inbound_email_events e ON e.id=n.inbound_event_id WHERE n.id=${saved.data.normalizationId}::uuid`;
    expect(association).toEqual({ organization_id: fixture.organizationId, vendor_organization_id: vendorOrg, source_type: "portal" });
  });
  test("denies customers, unrelated users, AAL1 staff, and mismatched organizations", async () => {
    const target = await requestFixture();
    expect((await submit(submitInput(target.recipient), randomUUID(), fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await submit(submitInput(target.recipient), randomUUID(), fixture.identityTarget.aal1)).error?.code).toBe("42501");
    expect((await submit({ ...submitInput(target.recipient), organizationId: fixture.organizationId })).error?.code).toBe("42501");
    expect((await read("vendor", target.recipient, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await read("staff", target.intake, fixture.organizationAdmin.aal1)).error?.code).toBe("42501");
    expect((await read("staff", target.intake, fixture.pair[0].aal1)).error?.code).toBe("42501");
    expect((await read("customer", target.intake, fixture.identityTarget.aal1)).error?.code).toBe("42501");
    const saved = await submit(submitInput(target.recipient));
    const denied = await elevatedClient(fixture.organizationAdmin).rpc("mmhr_review_rfp_response_normalization", { payload: {
      action: "review", normalizationId: saved.data.normalizationId, organizationId: fixture.organizationId,
      rfpId: target.rfp, version: 1, actorIdentityId: fixture.organizationAdmin.identityId,
    }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(denied.error?.code).toBe("42501");
  });
  test("replays exactly, preserves older revisions, and rejects changed or stale requests", async () => {
    const target = await requestFixture(), key = randomUUID(), input = submitInput(target.recipient);
    const first = await submit(input, key);
    const again = await submit(input, key);
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ revision: 1, normalizationId: first.data.normalizationId, outcomeCode: "replayed" });
    expect((await submit({ ...input, response: { ...response, caveats: ["Changed"] } }, key)).error?.code).toBe("22023");
    expect((await submit(input)).error?.code).toBe("42501");
    expect((await submit(submitInput(target.recipient, 1))).data).toMatchObject({ revision: 2 });
    const rows = (await read("vendor", target.recipient)).data.items;
    expect(rows).toHaveLength(2);
    expect(rows.find((row: { revision: number }) => row.revision === 1).isLatest).toBe(false);
    expect((await review("review", first.data.normalizationId, target.rfp, 0)).error?.code).toBe("42501");
    expect((await submit(input, key)).data).toMatchObject({ revision: 1, outcomeCode: "replayed" });
  }, 120000);
  test("serializes concurrent revisions and retains the approved response until its replacement is approved", async () => {
    const target = await requestFixture();
    const attempts = await Promise.all([submit(submitInput(target.recipient)), submit(submitInput(target.recipient))]);
    expect(attempts.filter((value) => value.error === null)).toHaveLength(1);
    expect(attempts.find((value) => value.error)?.error?.code).toBe("42501");
    const first = attempts.find((value) => !value.error)!.data;
    expect((await review("review", first.normalizationId, target.rfp, 0)).error).toBeNull();
    expect((await review("approve", first.normalizationId, target.rfp, 1)).error).toBeNull();
    const revised = await submit({ ...submitInput(target.recipient, 1), response: { ...response, caveats: ["Revised terms"] } });
    expect(revised.error).toBeNull();
    expect((await read("customer", target.intake)).data.items).toMatchObject([{ revision: 1, state: "approved" }]);
    expect((await review("review", revised.data.normalizationId, target.rfp, 0)).error).toBeNull();
    expect((await review("approve", revised.data.normalizationId, target.rfp, 1)).error).toBeNull();
    expect((await read("customer", target.intake)).data.items).toMatchObject([{ revision: 2, response: { caveats: ["Revised terms"] } }]);
  }, 120000);
  test.each([
    { response: { ...response, supportedRequirements: [123] } },
    { response: { ...response, caveats: [" "] } },
    { response: { ...response, caveats: ["\t\u00a0\n"] } },
    { response: { ...response, caveats: ["x".repeat(2001)] } },
    { response: { ...response, caveats: ["😀".repeat(501)] } },
    { response: { ...response, caveats: Array(17).fill("x".repeat(2000)) } },
    { response: { ...response, caveats: Array(101).fill("x") } },
    { response: Object.fromEntries(Object.keys(response).map((key) => [key, []])) },
    { actorIdentityId: randomUUID() }, { expectedRevision: -1 }, { expectedRevision: 1.5 },
  ])("rejects invalid direct RPC inputs %#", async (patch) => {
    const target = invalidInputTarget;
    expect((await submit({ ...submitInput(target.recipient), ...patch })).error?.code).toBe("22023");
    expect((await read("vendor", target.recipient)).data.currentRevision).toBe(0);
  });
  test("denies raw tables and anonymous commands", async () => {
    const target = invalidInputTarget;
    for (const table of ["rfp_portal_submissions", "rfp_response_normalizations", "inbound_email_events"]) {
      expect((await fixture.outsider.aal1.from(table).select("*")).error?.code).toBe("42501");
    }
    expect((await submit(submitInput(target.recipient), randomUUID(), fixture.anonymous)).error?.code).toBe("42501");
  });
  test("accepts the UTF-8 byte boundary and keeps saved submission records immutable", async () => {
    const target = await requestFixture();
    const boundary = { ...response, supportedRequirements: ["é".repeat(1000)], caveats: Array(15).fill("x".repeat(2000)) };
    const saved = await submit({ ...submitInput(target.recipient), response: boundary });
    expect(saved.error).toBeNull();
    const page = await read("vendor", target.recipient);
    expect(portalResponsePageSchema.parse(page.data).items[0]!.response).toEqual(boundary);
    await expect(fixture.owner`UPDATE public.rfp_portal_submissions SET revision=2
      WHERE normalization_id=${saved.data.normalizationId}::uuid`).rejects.toMatchObject({ code: "P0001" });
  }, 120000);
  test("records late responses but denies closed requests", async () => {
    const target = lateResponseTarget;
    const deadline = (await read("vendor", target.recipient)).data.request.deadlineAt;
    // Preserve the immutable deadline. Setup occurs before the reply assertions.
    const remaining = Math.max(0, Date.parse(deadline) + 100 - Date.now());
    if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
    expect((await submit(submitInput(target.recipient))).error).toBeNull();
    expect((await read("vendor", target.recipient)).data.items[0].late).toBe(true);
    await fixture.owner`UPDATE public.rfp_versions SET status='closed' WHERE rfp_id=${target.rfp}::uuid`;
    expect((await read("vendor", target.recipient)).data.request.closed).toBe(true);
    expect((await submit(submitInput(target.recipient, 1))).error?.code).toBe("42501");
  });
  test("routes staff questions to the assigned vendor and publishes accepted answers only with an approved response", async () => {
    const target = await requestFixture(), staff = elevatedClient(fixture.pair[0]), approver = elevatedClient(fixture.pair[1]);
    const base = (await submit(submitInput(target.recipient))).data;
    const question = { action: "ask", organizationId: fixture.organizationId, recipientId: target.recipient,
      normalizationId: base.normalizationId, question: "Does this export require an added fee?", deadlineAt: new Date(Date.now() + 86400000).toISOString() };
    const key = randomUUID(), asked = await clarify(question, staff, key);
    expect(asked.error).toBeNull();
    expect((await clarify(question, staff, key)).data).toMatchObject({ clarificationId: asked.data.clarificationId, outcomeCode: "replayed" });
    expect((await clarify({ ...question, question: "Changed" }, staff, key)).error?.code).toBe("22023");
    const vendorPage = await clarifications("vendor", target.recipient);
    expect(portalClarificationPageSchema.parse(vendorPage.data).items).toMatchObject([{ canReply: true, canDecide: false, revision: 1, question: question.question }]);
    expect((await clarifications("customer", target.intake)).data.items).toEqual([]);
    const oldStaffAnswer = await staff.rpc("mmhr_record_rfp_response_clarification", { payload: {
      action: "respond", organizationId: fixture.organizationId, clarificationId: asked.data.clarificationId, normalizationId: base.normalizationId,
      rfpId: target.rfp, version: 1, actorIdentityId: fixture.pair[0].identityId, answer: "An invented vendor answer", decision: "accepted",
    }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(oldStaffAnswer.error?.code).toBe("42501");
    const revised = (await submit({ ...submitInput(target.recipient, 1), response: { ...response, caveats: ["The export has no added fee."] } })).data;
    const answer = { action: "reply", organizationId: vendorOrg, clarificationId: asked.data.clarificationId,
      answer: "The export has no added fee.", changeSummary: "The fee condition is now stated in response 2.", replyNormalizationId: revised.normalizationId };
    expect((await clarify(answer, staff)).error?.code).toBe("42501");
    expect((await clarify(answer, fixture.identityTarget.aal1)).error?.code).toBe("42501");
    const replyKey = randomUUID();
    expect((await clarify(answer, fixture.outsider.aal1, replyKey)).error).toBeNull();
    const decision = { action: "decide", organizationId: fixture.organizationId, clarificationId: asked.data.clarificationId,
      decision: "accepted", reason: "The vendor answer and response revision resolve the question." };
    expect((await clarify(decision, staff)).error?.code).toBe("42501");
    const oldGenericApproval = await approver.rpc("mmhr_record_rfp_clarification", { payload: {
      action: "approve", organizationId: fixture.organizationId, clarificationId: asked.data.clarificationId,
      rfpId: target.rfp, version: 1, actorIdentityId: fixture.pair[1].identityId, approvalReference: "approval:wrong-clarification-path",
    }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(oldGenericApproval.error?.code).toBe("42501");
    expect((await clarify(decision, approver)).error).toBeNull();
    expect((await clarifications("customer", target.intake)).data.items).toEqual([]);
    expect((await review("review", revised.normalizationId, target.rfp, 0)).error).toBeNull();
    expect((await review("approve", revised.normalizationId, target.rfp, 1)).error).toBeNull();
    const customer = await clarifications("customer", target.intake);
    expect(portalClarificationPageSchema.parse(customer.data).items).toMatchObject([{ status: "approved", decision: "accepted", replyRevision: 2,
      normalizationId: null, replyNormalizationId: revised.normalizationId, latestNormalizationId: revised.normalizationId,
      canReply: false, canDecide: false, answer: answer.answer }]);
    expect(JSON.stringify(customer.data)).not.toContain(base.normalizationId);
    expect((await clarify(answer, fixture.outsider.aal1, replyKey)).data).toMatchObject({ outcomeCode: "replayed", replyNormalizationId: revised.normalizationId });
    expect((await clarify({ ...answer, answer: "Changed after approval" }, fixture.outsider.aal1)).error?.code).toBe("42501");
    await expect(fixture.owner`DELETE FROM public.rfp_clarifications WHERE id=${asked.data.clarificationId}::uuid`).rejects.toMatchObject({ code: "42501" });
  }, 120000);
  test("denies invalid clarification fields, wrong scope, expired deadlines, and unrelated revision links", async () => {
    const target = await requestFixture(), staff = elevatedClient(fixture.pair[0]);
    const base = (await submit(submitInput(target.recipient))).data;
    const question = { action: "ask", organizationId: fixture.organizationId, recipientId: target.recipient,
      normalizationId: base.normalizationId, question: "Confirm the unchanged conditions.", deadlineAt: new Date(Date.now() + 86400000).toISOString() };
    for (const patch of [{ actorIdentityId: fixture.pair[0].identityId }, { question: " \u00a0" }, { question: "😀".repeat(1251) },
      { deadlineAt: "2020-01-01T00:00:00Z" }, { deadlineAt: "infinity" }]) {
      expect((await clarify({ ...question, ...patch }, staff)).error?.code).toBe("22023");
    }
    expect((await clarify(question, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await clarify(question, fixture.pair[0].aal1)).error?.code).toBe("42501");
    expect((await clarifications("vendor", target.recipient, fixture.identityTarget.aal1)).error?.code).toBe("42501");
    expect((await clarifications("customer", target.intake, fixture.outsider.aal1)).error?.code).toBe("42501");
    const asked = await clarify(question, staff);
    expect(asked.error).toBeNull();
    const answer = { action: "reply", organizationId: vendorOrg, clarificationId: asked.data.clarificationId,
      answer: "The conditions remain unchanged.", changeSummary: "No response change.", replyNormalizationId: responseJourneyTarget.recipient };
    expect((await clarify(answer, fixture.outsider.aal1)).error?.code).toBe("42501");
    expect((await clarify({ ...answer, replyNormalizationId: base.normalizationId }, fixture.outsider.aal1)).error?.code).toBe("42501");
    expect((await clarify({ ...answer, replyNormalizationId: null }, fixture.outsider.aal1)).error).toBeNull();
    expect((await clarify({ action: "decide", organizationId: fixture.organizationId, clarificationId: asked.data.clarificationId,
      decision: "deferred", reason: "Further vendor evidence is required." }, elevatedClient(fixture.pair[1]))).error).toBeNull();
    expect((await clarifications("customer", target.intake)).data.items).toEqual([]);
    expect((await fixture.outsider.aal1.from("rfp_clarifications").select("*")).error?.code).toBe("42501");
  }, 120000);
  const demoPlan = { round: 1, audience: "Synthetic payroll team", purpose: "Verify daily exports", format: "remote",
    participants: [{ name: "Synthetic customer attendee", role: "Payroll lead", organization: "customer" }], requiredTopics: ["Daily exports"] };
  let coordinatedDemoId: string;
  let demoRevision = 1;
  const availabilityWindow = { startAt: new Date(Date.now() + 2 * 86400000).toISOString(), endAt: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString() };
  const demoAvailability = { timeZone: "UTC", windows: [availabilityWindow], note: null };
  const demoSchedule = { window: availabilityWindow, timeZone: "UTC", location: "Synthetic private meeting",
    reminderAt: new Date(Date.now() + 86400000).toISOString(), confirmationNote: "Both parties accepted these times." };
  async function coordinate(payload: object, client = elevatedClient(fixture.pair[0]), key = randomUUID()) {
    return client.rpc("mmhr_record_demo_coordination", { payload, correlation_id: randomUUID(), idempotency_key: key });
  }
  async function demoPage(view: "staff" | "customer" | "vendor", client?: SupabaseClient) {
    return (client ?? (view === "staff" ? elevatedClient(fixture.pair[0]) : view === "customer" ? fixture.membershipTarget.aal1 : fixture.outsider.aal1))
      .rpc("mmhr_get_demo_coordination", { payload: { organizationId: view === "vendor" ? vendorOrg : fixture.organizationId, view }, correlation_id: randomUUID() });
  }
  test("creates an audited demo from the exact disclosed product and delivered request", async () => {
    const target = responseJourneyTarget;
    const input = { action: "create", organizationId: fixture.organizationId, candidateId: target.candidateId, recipientId: target.recipient, plan: demoPlan };
    expect((await coordinate(input, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await coordinate(input, fixture.pair[0].aal1)).error?.code).toBe("42501");
    expect((await coordinate({ ...input, actorIdentityId: fixture.pair[0].identityId })).error?.code).toBe("22023");
    expect((await coordinate({ ...input, candidateId: invalidInputTarget.candidateId })).error?.code).toBe("42501");
    const key = randomUUID(), created = await coordinate(input, undefined, key);
    expect(created.error).toBeNull();
    coordinatedDemoId = created.data.demoId;
    expect(created.data).toMatchObject({ revision: 1, status: "requested", outcomeCode: "recorded" });
    expect((await coordinate(input, undefined, key)).data).toMatchObject({ demoId: coordinatedDemoId, outcomeCode: "replayed" });
    expect((await coordinate({ ...input, plan: { ...demoPlan, purpose: "Changed" } }, undefined, key)).error?.code).toBe("22023");
    const customer = await demoPage("customer"), vendor = await demoPage("vendor");
    expect(customer.error).toBeNull(); expect(vendor.error).toBeNull();
    expect(demoCoordinationPageSchema.parse(customer.data)).toMatchObject({ choices: [], items: [{ demoId: coordinatedDemoId, status: "requested", coordination: { plan: demoPlan } }] });
    expect(demoCoordinationPageSchema.parse(vendor.data)).toMatchObject({ choices: [], items: [{ demoId: coordinatedDemoId }] });
    expect((await demoPage("customer", fixture.identityTarget.aal1)).error?.code).toBe("42501");
    expect((await demoPage("vendor", fixture.identityTarget.aal1)).error?.code).toBe("42501");
    const [deal] = await fixture.owner`SELECT d.candidate_id,d.product_id FROM public.deals d JOIN public.demo_rounds demo ON demo.deal_id=d.id WHERE demo.id=${coordinatedDemoId}::uuid`;
    expect(deal).toEqual({ candidate_id: target.candidateId, product_id: productId });
  }, 60000);
  test("lets each external role supply only its own availability and rejects stale revisions", async () => {
    const customer = { action: "customer_availability", organizationId: fixture.organizationId, demoId: coordinatedDemoId, expectedRevision: demoRevision, availability: demoAvailability };
    expect((await coordinate(customer, fixture.outsider.aal1)).error?.code).toBe("42501");
    expect((await coordinate({ ...customer, availability: { ...demoAvailability, timeZone: "Invalid/Zone" } }, fixture.membershipTarget.aal1)).error?.code).toBe("22023");
    const saved = await coordinate(customer, fixture.membershipTarget.aal1);
    expect(saved.error).toBeNull(); demoRevision = saved.data.revision;
    expect(saved.data.status).toBe("requested");
    expect((await coordinate(customer, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    const vendor = { action: "vendor_availability", organizationId: vendorOrg, demoId: coordinatedDemoId, expectedRevision: demoRevision, availability: demoAvailability };
    expect((await coordinate(vendor, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    const supplied = await coordinate(vendor, fixture.outsider.aal1);
    expect(supplied.error).toBeNull(); demoRevision = supplied.data.revision;
    expect((await demoPage("customer")).data.items[0].status).toBe("requested");
  }, 60000);
  test("requires staff confirmation, rejects conflicts, and retains immutable schedule history", async () => {
    const confirm = { action: "confirm", organizationId: fixture.organizationId, demoId: coordinatedDemoId, expectedRevision: demoRevision, schedule: demoSchedule, reason: "Confirm the agreed meeting" };
    expect((await coordinate(confirm, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await coordinate({ ...confirm, organizationId: vendorOrg }, fixture.outsider.aal1)).error?.code).toBe("42501");
    const saved = await coordinate(confirm); expect(saved.error).toBeNull(); demoRevision = saved.data.revision;
    expect(saved.data.status).toBe("scheduled");
    const legacy = await elevatedClient(fixture.pair[0]).rpc("mmhr_record_demo_round", { payload: { action: "transition", demoId: coordinatedDemoId,
      organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, fromStatus: "scheduled", toStatus: "cancelled", expectedRevision: demoRevision,
      occurredAt: new Date().toISOString(), reason: "Bypass coordination", scheduledStartAt: null, scheduledEndAt: null, meetingReference: null }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(legacy.error?.code).toBe("42501");
    const second = await coordinate({ action: "create", organizationId: fixture.organizationId, candidateId: responseJourneyTarget.candidateId, recipientId: responseJourneyTarget.recipient, plan: demoPlan });
    expect(second.error).toBeNull();
    const secondId = second.data.demoId;
    for (const [action, org, client, expectedRevision] of [
      ["customer_availability", fixture.organizationId, fixture.membershipTarget.aal1, 1],
      ["vendor_availability", vendorOrg, fixture.outsider.aal1, 2],
    ] as const) expect((await coordinate({ action, organizationId: org, demoId: secondId, expectedRevision, availability: demoAvailability }, client)).error).toBeNull();
    expect((await coordinate({ ...confirm, demoId: secondId, expectedRevision: 3 })).error?.code).toBe("42501");
    const reopened = await coordinate({ action: "reopen", organizationId: fixture.organizationId, demoId: coordinatedDemoId, expectedRevision: demoRevision, reason: "Obtain different acceptable times" });
    expect(reopened.error).toBeNull(); demoRevision = reopened.data.revision;
    const events = await fixture.owner`SELECT revision,action,snapshot FROM public.demo_coordination_events WHERE demo_id=${coordinatedDemoId}::uuid ORDER BY revision`;
    expect(events.map((row) => row.action)).toEqual(["create", "customer_availability", "vendor_availability", "confirm", "reopen"]);
    expect(events[3]!.snapshot.coordination.schedule).toEqual(demoSchedule);
    expect(events[4]!.snapshot.coordination.schedule).toBeNull();
    await expect(fixture.owner`UPDATE public.demo_coordination_events SET action='cancel' WHERE demo_id=${coordinatedDemoId}::uuid`).rejects.toMatchObject({ code: "P0001" });
    await expect(fixture.owner`DELETE FROM public.demo_rounds WHERE id=${coordinatedDemoId}::uuid`).rejects.toMatchObject({ code: "42501" });
    expect((await fixture.outsider.aal1.from("demo_coordination_events").select("*")).error?.code).toBe("42501");
  }, 60000);
  test("reads every demo revision with current scope and hides event actors", async () => {
    const input = { organizationId: fixture.organizationId, view: "customer", demoId: coordinatedDemoId, afterRevision: 0 };
    const history = await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: input, correlation_id: randomUUID() });
    expect(history.error).toBeNull();
    const parsed = demoHistoryPageSchema.parse(history.data);
    expect(parsed.items.map((item) => item.revision)).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.items[3]!.coordination.schedule).toEqual(demoSchedule);
    expect(parsed.items[4]!.coordination.schedule).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain(fixture.pair[0].identityId);
    expect((await fixture.outsider.aal1.rpc("mmhr_get_demo_coordination_history", { payload: input, correlation_id: randomUUID() })).error?.code).toBe("42501");
    expect((await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: { ...input, demoId: randomUUID() }, correlation_id: randomUUID() })).error?.code).toBe("42501");
    expect((await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: { ...input, afterRevision: -1 }, correlation_id: randomUUID() })).error?.code).toBe("22023");
    const next = await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: { ...input, afterRevision: 3 }, correlation_id: randomUUID() });
    expect(next.data.items.map((item: { revision: number }) => item.revision)).toEqual([4, 5]);
  }, 60000);
  test("records finished synthetic meetings and denies false attendance, unsafe evidence, and premature outcomes", async () => {
    const confirmed = await coordinate({ action: "confirm", organizationId: fixture.organizationId, demoId: coordinatedDemoId,
      expectedRevision: demoRevision, schedule: demoSchedule, reason: "Confirm the agreed synthetic meeting again" });
    expect(confirmed.error).toBeNull(); demoRevision = confirmed.data.revision;
    const outcome = { attendance: [{ name: demoPlan.participants[0]!.name, attended: true }], feedback: "Synthetic export demonstration completed",
      score: 4, commitments: ["Provide a sample export"], requestedChanges: ["Include a second company"],
      nextAction: "Review the sample export", nextActionAt: new Date(Date.now() + 86400000).toISOString(), evidenceVersionIds: [] };
    expect((await coordinate({ action: "complete", organizationId: fixture.organizationId, demoId: coordinatedDemoId,
      expectedRevision: demoRevision, outcome, reason: "Premature synthetic outcome" })).error?.code).toBe("22023");
    const earlierId = randomUUID(), start = new Date(Date.now() - 7200000).toISOString(), end = new Date(Date.now() - 3600000).toISOString();
    const state = { plan: demoPlan, customerAvailability: { ...demoAvailability, windows: [{ startAt: start, endAt: end }] },
      vendorAvailability: { ...demoAvailability, windows: [{ startAt: start, endAt: end }] },
      schedule: { ...demoSchedule, window: { startAt: start, endAt: end }, reminderAt: new Date(Date.now() - 10800000).toISOString() },
      outcome: null, reason: "Earlier synthetic meeting fixture" };
    // Seed an earlier meeting in this disposable database. The public command retains its real clock checks.
    await fixture.owner`INSERT INTO public.demo_rounds(id,organization_id,deal_id,customer_organization_id,vendor_organization_id,
      requested_by_identity_id,requested_at,status,revision,portal_recipient_id,coordination,scheduled_start_at,scheduled_end_at,meeting_reference,correlation_id)
      SELECT ${earlierId}::uuid,organization_id,deal_id,customer_organization_id,vendor_organization_id,requested_by_identity_id,
        now()-interval '1 day','scheduled',1,portal_recipient_id,${JSON.stringify(state)}::jsonb,${start}::timestamptz,${end}::timestamptz,
        ${"demo:" + earlierId},${randomUUID()}::uuid FROM public.demo_rounds WHERE id=${coordinatedDemoId}::uuid`;
    await fixture.owner`INSERT INTO public.demo_coordination_events(organization_id,demo_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(${fixture.organizationId}::uuid,${earlierId}::uuid,1,'confirm',${fixture.pair[0].identityId}::uuid,
        ${JSON.stringify({ status: "scheduled", coordination: state })}::jsonb,${randomUUID()}::uuid)`;
    const complete = { action: "complete", organizationId: fixture.organizationId, demoId: earlierId, expectedRevision: 1, outcome, reason: "Record the earlier synthetic meeting" };
    expect((await coordinate(complete, fixture.membershipTarget.aal1)).error?.code).toBe("42501");
    expect((await coordinate({ ...complete, outcome: { ...outcome, attendance: [{ name: "Unplanned attendee", attended: true }] } })).error?.code).toBe("22023");
    expect((await coordinate({ ...complete, outcome: { ...outcome, evidenceVersionIds: [randomUUID()] } })).error?.code).toBe("42501");
    const key = randomUUID(), saved = await coordinate(complete, undefined, key);
    expect(saved.error).toBeNull(); expect(saved.data).toMatchObject({ status: "completed", revision: 2 });
    expect((await coordinate(complete, undefined, key)).data.outcomeCode).toBe("replayed");
    expect((await coordinate({ action: "cancel", organizationId: fixture.organizationId, demoId: earlierId, expectedRevision: 2, reason: "Cannot change terminal meeting" })).error?.code).toBe("42501");
    const customer = demoCoordinationPageSchema.parse((await demoPage("customer")).data).items.find((item) => item.demoId === earlierId)!;
    expect(customer.coordination.outcome).toEqual(outcome); expect(customer.coordination.schedule).toEqual(state.schedule);
  }, 60000);
  test("pages eligible products and immutable revisions without duplicate or missing rows", async () => {
    const first = await demoPage("staff"); expect(first.error).toBeNull();
    const choice = first.data.choices[0];
    const after = await elevatedClient(fixture.pair[0]).rpc("mmhr_get_demo_coordination", { payload: { organizationId: fixture.organizationId,
      view: "staff", afterChoice: { candidateId: choice.candidateId, recipientId: choice.recipientId } }, correlation_id: randomUUID() });
    expect(after.error).toBeNull();
    expect(after.data.choices.every((item: { candidateId: string; recipientId: string }) => item.candidateId > choice.candidateId
      || (item.candidateId === choice.candidateId && item.recipientId > choice.recipientId))).toBe(true);
    const target = responseJourneyTarget;
    const created = await coordinate({ action: "create", organizationId: fixture.organizationId, candidateId: target.candidateId,
      recipientId: target.recipient, plan: { ...demoPlan, round: 2 } });
    expect(created.error).toBeNull(); let revision = 1;
    for (let index = 0; index < 26; index++) {
      const changed = await coordinate({ action: "customer_availability", organizationId: fixture.organizationId, demoId: created.data.demoId,
        expectedRevision: revision, availability: { ...demoAvailability, note: `Synthetic availability revision ${index}` } }, fixture.membershipTarget.aal1);
      expect(changed.error).toBeNull(); revision = changed.data.revision;
    }
    const input = { organizationId: fixture.organizationId, view: "customer", demoId: created.data.demoId, afterRevision: 0 };
    const page = await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: input, correlation_id: randomUUID() });
    expect(page.error).toBeNull(); expect(demoHistoryPageSchema.parse(page.data).nextRevision).toBe(25);
    const later = await fixture.membershipTarget.aal1.rpc("mmhr_get_demo_coordination_history", { payload: { ...input, afterRevision: 25 }, correlation_id: randomUUID() });
    expect(later.error).toBeNull(); expect(later.data.items.map((item: { revision: number }) => item.revision)).toEqual([26, 27]);
    expect(later.data.nextRevision).toBeNull();
  }, 120000);
  test("removes response access immediately when vendor membership is revoked", async () => {
    const target = await requestFixture(), key = randomUUID(), input = submitInput(target.recipient);
    expect((await submit(input, key)).error).toBeNull();
    await fixture.owner`UPDATE public.org_members SET status='revoked',revoked_at=clock_timestamp(),
      revoked_by_identity_id=${fixture.organizationAdmin.identityId}::uuid,revoked_reason='Synthetic revocation test'
      WHERE org_id=${vendorOrg}::uuid
      AND identity_id=${fixture.outsider.identityId}::uuid`;
    expect((await read("vendor", target.recipient)).error?.code).toBe("42501");
    expect((await submit(input, key)).error?.code).toBe("42501");
    expect((await demoPage("vendor")).error?.code).toBe("42501");
    expect((await coordinate({ action: "vendor_availability", organizationId: vendorOrg, demoId: coordinatedDemoId,
      expectedRevision: demoRevision, availability: demoAvailability }, fixture.outsider.aal1)).error?.code).toBe("42501");
  });
});
