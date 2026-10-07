import { registerReceiptTimingRegressions } from "./test/r4-rfp-receipt-timing-regressions";
import { randomUUID } from "node:crypto";
import { registerRfpReceiptOverflow } from "./test/r4-rfp-receipt-overflow";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims,
  type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import type { SecurityPrincipal, SecurityTokenPrincipal, SecurityTransaction } from "./r1-security-command-fixtures";
import { seedQuoteWorkflow } from "./test/r6-proposal-quote-fixtures";
import { confirmRfpReceipt, getRfpReceiptStatus } from "@/server/commands/rfp-receipt";
import { rfpReceiptPageSchema, type RfpReceiptCommand, type RfpReceiptRow } from "@/lib/rfp-receipt";

describe("RFP receipts with genuine Auth and scoped customer/vendor organizations", () => {
  let fixture: SecurityCommandApiFixtures;
  let customer: SecurityApiPrincipal, vendor: SecurityApiPrincipal, foreignVendor: SecurityApiPrincipal;
  let source: Awaited<ReturnType<typeof seedQuoteWorkflow>>;
  let deniedTarget: Awaited<ReturnType<typeof freshRequest>>;
  const options = (client: SupabaseClient) => ({ supabase: client as RequestSupabaseClient });
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    console.info(JSON.stringify({ event: "receipt_fixture_owned", projectId: fixture.projectId, ...fixture.isolation }));
    customer = await fixture.createSyntheticPrincipal(); vendor = await fixture.createSyntheticPrincipal(); foreignVendor = await fixture.createSyntheticPrincipal();
    async function portal(actor: SecurityApiPrincipal): Promise<SecurityTokenPrincipal> {
      const claims = await verifiedApiClaims(actor.aal1, "aal1");
      return { identityId: actor.identityId, subject: actor.subjectId, sessionId: claims.sessionId, expiresAt: new Date(claims.expiresAt) };
    }
    async function staff(actor: SecurityApiPrincipal): Promise<SecurityPrincipal> {
      const claims = await verifiedApiClaims(elevatedClient(actor), "aal2");
      const [session] = await fixture.owner<{ factor_id: string | null }[]>`SELECT factor_id FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
      if (!session?.factor_id) throw new Error("Genuine MFA factor missing");
      return { identityId: actor.identityId, subject: actor.subjectId, sessionId: claims.sessionId, factorId: session.factor_id, expiresAt: new Date(claims.expiresAt) };
    }
    const pair = await Promise.all(fixture.pair.map(staff)), admin = await staff(fixture.organizationAdmin);
    const actors = await Promise.all([customer, vendor, foreignVendor].map(portal));
    source = await fixture.owner.begin(async sql => {
      const [membership] = await sql<{ id: string }[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${pair[0]!.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${pair[1]!.identityId}::uuid,'Synthetic receipt scoped staff fixture')`;
      const workflow = await seedQuoteWorkflow(sql, { organizationId: fixture.organizationId, pair: [pair[0]!, pair[1]!], organizationAdmin: admin,
        target: admin, adminMembershipId: fixture.adminMembershipId, actorMembershipId: membership!.id, targetMembershipId: fixture.adminMembershipId },
      { customer: actors[0]!, vendors: [actors[1]!, actors[2]!] });
      // This synthetic fixture prerequisite supplies scope; genuine RPCs still authorize each action.
      const vendorOrganizationId = workflow.vendors[0]!.organizationId;
      await sql`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${vendorOrganizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false)`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${pair[0]!.identityId}::uuid,'workspace.access','organization',${vendorOrganizationId}::uuid,${`organization:${vendorOrganizationId}`},'allow',${pair[1]!.identityId}::uuid,'Synthetic receipt portal administration scope')`;
      return workflow;
    });
    deniedTarget = await freshRequest();
    const valid = await status("vendor");
    expect(valid.items.some(row => row.recipientId === deniedTarget.recipientId && row.canConfirm)).toBe(true);
  }, 300000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180000);

  async function command(client: SupabaseClient, name: string, payload: object) {
    const result = await client.rpc(name, { payload, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    if (result.error) throw new Error(`Synthetic setup failed: ${result.error.code}`);
    return result.data;
  }
  async function freshRequest() {
    const rfpId = randomUUID(), staff = elevatedClient(fixture.pair[0]);
    await command(staff, "mmhr_create_rfp_questionnaire", { organizationId: fixture.organizationId, intakeId: source.intakeId,
      rfpId, sourceRevision: 2, title: "Synthetic receipt request", content: "Describe payroll support for the synthetic customer." });
    await command(elevatedClient(fixture.pair[1]), "mmhr_approve_rfp_version", { organizationId: fixture.organizationId,
      rfpId, version: 1, actorIdentityId: fixture.pair[1].identityId, approvalReference: "approval:synthetic-receipt-base" });
    const read = await staff.rpc("mmhr_get_rfp_workflow", { payload: { organizationId: fixture.organizationId, intakeId: source.intakeId }, correlation_id: randomUUID() });
    expect(read.error).toBeNull();
    const base = (read.data.rfps as { rfpId: string; deliveryDigest: string }[]).find(row => row.rfpId === rfpId);
    expect(base).toBeDefined();
    await command(staff, "mmhr_deliver_rfp_to_portals", { organizationId: fixture.organizationId, rfpId, version: 1,
      deadlineAt: new Date(Date.now() + 7 * 86400000).toISOString(), expectedDigest: base!.deliveryDigest });
    const [row] = await fixture.owner<{ recipient_id: string; rfp_version_id: string }[]>`SELECT rr.id recipient_id,rr.rfp_version_id
      FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id WHERE r.rfp_id=${rfpId}::uuid
        AND rr.vendor_organization_id=${source.vendors[0]!.organizationId}::uuid`;
    expect(row).toBeDefined();
    return { recipientId: row!.recipient_id, rfpVersionId: row!.rfp_version_id };
  }
  function input(target = deniedTarget): RfpReceiptCommand {
    return { organizationId: source.vendors[0]!.organizationId, ...target, confirmationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
  }
  async function direct(value: unknown, client = vendor.aal1, correlationId?: string, key?: string) {
    const fields = value as RfpReceiptCommand;
    return client.rpc("mmhr_confirm_rfp_receipt", { payload: value, correlation_id: correlationId ?? fields.correlationId, idempotency_key: key ?? fields.idempotencyKey });
  }
  async function status(view: "vendor" | "staff" | "customer", client?: SupabaseClient, afterId?: string) {
    return getRfpReceiptStatus({ view, organizationId: view === "vendor" ? source.vendors[0]!.organizationId : fixture.organizationId,
      ...(view !== "vendor" ? { intakeId: source.intakeId } : {}), ...(afterId ? { afterId } : {}), correlationId: randomUUID() },
    options(client ?? (view === "vendor" ? vendor.aal1 : view === "staff" ? elevatedClient(fixture.pair[0]) : customer.aal1)));
  }
  async function statusRow(view: "vendor" | "staff" | "customer", recipientId: string) {
    const rows: RfpReceiptRow[] = [];
    let cursor: string | null = null;
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      const page = rfpReceiptPageSchema.parse(await status(view, undefined, cursor ?? undefined));
      expect(page.items.every((row, index) => index === 0 || row.recipientId > page.items[index - 1]!.recipientId)).toBe(true);
      if (cursor) expect(page.items.every(row => row.recipientId > cursor!)).toBe(true);
      rows.push(...page.items);
      if (!page.nextCursor) {
        expect(new Set(rows.map(row => row.recipientId)).size).toBe(rows.length);
        return rows.find(row => row.recipientId === recipientId);
      }
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.nextCursor).toBe(page.items.at(-1)!.recipientId);
      if (cursor) expect(page.nextCursor > cursor).toBe(true);
      cursor = page.nextCursor;
    }
    throw new Error("Synthetic receipt status traversal exceeded 100 pages");
  }
  async function snapshot() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'recipients',(SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.id) FROM public.rfp_recipients rr),
      'confirmations',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM mmhr_private.rfp_receipt_confirmations e),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a),
      'submissions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.rfp_portal_submissions s),
      'normalizations',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.rfp_response_normalizations n),
      'inboundEvents',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.inbound_email_events e)) AS proof`;
    return row!.proof;
  }
  async function recipientProof(recipientId: string) {
    const [row] = await fixture.owner`SELECT jsonb_build_object('state',rr.state,'acknowledgedAt',rr.acknowledged_at,
      'respondedAt',rr.responded_at,'confirmations',(SELECT count(*) FROM mmhr_private.rfp_receipt_confirmations e WHERE e.recipient_id=rr.id),
      'confirmationReceipts',(SELECT count(*) FROM mmhr_private.rfp_receipt_confirmations e JOIN public.security_command_receipts r ON r.id=e.receipt_id WHERE e.recipient_id=rr.id),
      'confirmationAudits',(SELECT count(*) FROM mmhr_private.rfp_receipt_confirmations e JOIN public.security_command_receipts r ON r.id=e.receipt_id JOIN public.audit_events a ON a.id=r.audit_event_id WHERE e.recipient_id=rr.id),
      'submissions',(SELECT count(*) FROM public.rfp_portal_submissions s WHERE s.recipient_id=rr.id),
      'responseReceipts',(SELECT count(*) FROM public.rfp_portal_submissions s JOIN public.security_command_receipts r ON r.entity_id=s.normalization_id AND r.command='r4.rsp.portal_submit' WHERE s.recipient_id=rr.id),
      'responseAudits',(SELECT count(*) FROM public.rfp_portal_submissions s JOIN public.security_command_receipts r ON r.entity_id=s.normalization_id AND r.command='r4.rsp.portal_submit' JOIN public.audit_events a ON a.id=r.audit_event_id WHERE s.recipient_id=rr.id)) proof
      FROM public.rfp_recipients rr WHERE rr.id=${recipientId}::uuid`;
    return row!.proof;
  }
  async function signedOwner<T>(operation: (sql: SecurityTransaction) => Promise<T>) {
    await verifiedApiClaims(vendor.aal1, "aal1");
    const claims = await vendor.aal1.auth.getClaims(); expect(claims.error).toBeNull();
    return fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims.data!.claims)},true)`;
      const [actor] = await sql<{ actor: string }[]>`SELECT mmhr_private.r4_receipt_actor(${source.vendors[0]!.organizationId}::uuid) actor`;
      expect(actor!.actor).toBe(vendor.identityId);
      return operation(sql);
    });
  }
  const response = { supportedRequirements: ["Synthetic payroll support"], unsupportedRequirements: [], caveats: [], dependencies: [],
    commitments: [], implementationDetails: [], missingAnswers: [], proposedFollowUps: [] };
  async function submit(target: Awaited<ReturnType<typeof freshRequest>>) {
    const result = await vendor.aal1.rpc("mmhr_submit_portal_response", { payload: { organizationId: source.vendors[0]!.organizationId,
      recipientId: target.recipientId, expectedRevision: 0, response }, correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(result.error).toBeNull(); return result;
  }
  registerReceiptTimingRegressions({ fixture: () => fixture, vendorOrganizationId: () => source.vendors[0]!.organizationId,
    intakeId: () => source.intakeId, freshRequest, input, snapshot });
  test("confirms through the application command and exposes safe status to all three roles", async () => {
    const target = await freshRequest(), request = input(target);
    const saved = await confirmRfpReceipt(request, options(vendor.aal1));
    expect(saved).toMatchObject({ ...target, confirmationId: request.confirmationId, state: "acknowledged" });
    for (const view of ["vendor", "staff", "customer"] as const) {
      const page = rfpReceiptPageSchema.parse(await status(view));
      const row = await statusRow(view, target.recipientId);
      expect(row).toMatchObject({ receiptKind: "explicit", acknowledgedAt: saved.acknowledgedAt, canConfirm: false });
      expect(JSON.stringify(page)).not.toContain(vendor.identityId);
      expect(JSON.stringify(page)).not.toContain(request.idempotencyKey);
    }
    const original = await snapshot();
    expect(await confirmRfpReceipt(request, options(vendor.aal1))).toEqual(saved); expect(await snapshot()).toEqual(original);
  }, 120000);
  test("retains original confirmation after response submission without regressing the current state", async () => {
    const target = await freshRequest(), request = input(target), saved = await confirmRfpReceipt(request, options(vendor.aal1));
    await submit(target); const before = await snapshot();
    expect(await confirmRfpReceipt(request, options(vendor.aal1))).toEqual(saved); expect(await snapshot()).toEqual(before);
    expect(await statusRow("vendor", target.recipientId)).toMatchObject({ state: "responded", acknowledgedAt: saved.acknowledgedAt });
    expect((await direct({ ...request, confirmationId: randomUUID() })).error?.code).toBe("40001"); expect(await snapshot()).toEqual(before);
  }, 120000);
  test("keeps response-generated acknowledgement implicit and rejects a new explicit confirmation", async () => {
    const target = await freshRequest(); await submit(target); const before = await snapshot();
    expect(await statusRow("customer", target.recipientId)).toMatchObject({ receiptKind: "recorded", state: "responded" });
    expect((await direct(input(target))).error?.code).toBe("40001"); expect(await snapshot()).toEqual(before);
  }, 120000);
  test("a closed questionnaire preserves original retries but denies a fresh confirmation", async () => {
    const target = await freshRequest(), request = input(target), saved = await confirmRfpReceipt(request, options(vendor.aal1));
    await fixture.owner`UPDATE public.rfp_versions SET status='closed' WHERE id=${target.rfpVersionId}::uuid`;
    const before = await snapshot(); expect(await confirmRfpReceipt(request, options(vendor.aal1))).toEqual(saved);
    expect((await direct({ ...request, confirmationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() })).error?.code).toBe("40001");
    expect(await snapshot()).toEqual(before);
    const unconfirmed = await freshRequest(); await fixture.owner`UPDATE public.rfp_versions SET status='closed' WHERE id=${unconfirmed.rfpVersionId}::uuid`;
    const unconfirmedBefore = await snapshot(); expect((await direct(input(unconfirmed))).error?.code).toBe("42501");
    expect(await snapshot()).toEqual(unconfirmedBefore);
  }, 120000);
  test("serializes concurrent confirmation and response without losing the response or changing the first time", async () => {
    const target = await freshRequest(), request = input(target);
    const [confirmation] = await Promise.all([direct(request), submit(target)]);
    expect(confirmation.error === null || confirmation.error.code === "40001").toBe(true);
    const proof = await recipientProof(target.recipientId), count = confirmation.error ? 0 : 1;
    expect(proof).toMatchObject({ state: "responded", confirmations: count, confirmationReceipts: count, confirmationAudits: count,
      submissions: 1, responseReceipts: 1, responseAudits: 1 });
    expect(proof.acknowledgedAt).not.toBeNull(); expect(proof.respondedAt).not.toBeNull();
    const before = await snapshot();
    if (!confirmation.error) {
      expect(proof.acknowledgedAt).toBe(confirmation.data.acknowledgedAt);
      expect((await direct(request)).data).toEqual(confirmation.data);
    } else expect((await direct(request)).error?.code).toBe("40001");
    expect(await snapshot()).toEqual(before);
  }, 120000);
  test("two concurrent fresh confirmation keys create only one original receipt", async () => {
    const target = await freshRequest(), requests = [input(target), input(target)];
    const results = await Promise.all(requests.map(request => direct(request)));
    expect(results.filter(result => result.error === null)).toHaveLength(1);
    expect(results.filter(result => result.error?.code === "40001")).toHaveLength(1);
    const winner = results.findIndex(result => result.error === null), saved = results[winner]!.data;
    expect(await recipientProof(target.recipientId)).toMatchObject({ state: "acknowledged", acknowledgedAt: saved.acknowledgedAt,
      confirmations: 1, confirmationReceipts: 1, confirmationAudits: 1, submissions: 0, responseReceipts: 0, responseAudits: 0 });
    const before = await snapshot();
    expect((await direct(requests[winner]!)).data).toEqual(saved);
    expect((await direct(requests[1 - winner]!)).error?.code).toBe("40001"); expect(await snapshot()).toEqual(before);
  }, 120000);
  test.each(["confirmed", "responded", "same_transaction"] as const)("denies owner state regression after %s without mutations", async sequence => {
    const target = await freshRequest(), request = input(target);
    if (sequence !== "same_transaction") {
      const saved = await confirmRfpReceipt(request, options(vendor.aal1));
      if (sequence === "responded") await submit(target);
      expect(await recipientProof(target.recipientId)).toMatchObject({ state: sequence === "responded" ? "responded" : "acknowledged",
        acknowledgedAt: saved.acknowledgedAt, confirmations: 1, confirmationReceipts: 1, confirmationAudits: 1,
        submissions: sequence === "responded" ? 1 : 0, responseReceipts: sequence === "responded" ? 1 : 0, responseAudits: sequence === "responded" ? 1 : 0 });
    }
    const before = await snapshot();
    await expect(signedOwner(async sql => {
      if (sequence === "same_transaction") {
        const [saved] = await sql`SELECT public.mmhr_confirm_rfp_receipt(${JSON.stringify(request)}::jsonb,${request.correlationId}::uuid,${request.idempotencyKey}::uuid) result`;
        expect(saved!.result).toMatchObject({ ...target, confirmationId: request.confirmationId, state: "acknowledged" });
        const [row] = await sql`SELECT to_jsonb(rr)->>'acknowledged_at' acknowledged_at,state FROM public.rfp_recipients rr WHERE rr.id=${target.recipientId}::uuid`;
        expect(row!.state).toBe("acknowledged"); expect(row!.acknowledged_at).toBe(saved!.result.acknowledgedAt);
      }
      await sql`UPDATE public.rfp_recipients SET state='distributed' WHERE id=${target.recipientId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({ code: "42501", message: "RFP receipt state cannot regress" });
    expect(await snapshot()).toEqual(before);
  }, 120000);
  test("keeps withdrawal and denies reactivation of an existing receipt", async () => {
    const target = await freshRequest(), request = input(target), saved = await confirmRfpReceipt(request, options(vendor.aal1));
    await signedOwner(async sql => { await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${target.recipientId}::uuid`; });
    expect(await statusRow("customer", target.recipientId)).toMatchObject({ state: "withdrawn", receiptKind: "explicit", acknowledgedAt: saved.acknowledgedAt });
    const before = await snapshot();
    const replay = await direct(request);
    expect(replay.error?.code).toBe("42501"); expect(replay.data).toBeNull();
    expect(await snapshot()).toEqual(before);
    await expect(signedOwner(async sql => { await sql`UPDATE public.rfp_recipients SET state='distributed' WHERE id=${target.recipientId}::uuid`; }))
      .rejects.toMatchObject({ code: "42501", message: "RFP receipt state cannot regress" });
    expect(await snapshot()).toEqual(before);
  }, 120000);
  test.each(["same_transaction", "committed"] as const)("denies withdrawn confirmation reactivation as responded after %s", async sequence => {
    const target = await freshRequest(), request = input(target);
    if (sequence === "committed") {
      const saved = await confirmRfpReceipt(request, options(vendor.aal1));
      await signedOwner(async sql => { await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${target.recipientId}::uuid`; });
      expect(await recipientProof(target.recipientId)).toMatchObject({ state: "withdrawn", acknowledgedAt: saved.acknowledgedAt,
        confirmations: 1, confirmationReceipts: 1, confirmationAudits: 1, submissions: 0, responseReceipts: 0, responseAudits: 0 });
    }
    const before = await snapshot();
    await expect(signedOwner(async sql => {
      if (sequence === "same_transaction") {
        const [saved] = await sql`SELECT public.mmhr_confirm_rfp_receipt(${JSON.stringify(request)}::jsonb,${request.correlationId}::uuid,${request.idempotencyKey}::uuid) result`;
        expect(saved!.result).toMatchObject({ ...target, confirmationId: request.confirmationId, state: "acknowledged" });
        await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${target.recipientId}::uuid`;
      }
      const [withdrawn] = await sql`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${target.recipientId}::uuid`;
      expect(withdrawn!.state).toBe("withdrawn"); expect(withdrawn!.acknowledged_at).not.toBeNull();
      await sql`UPDATE public.rfp_recipients SET state='responded',responded_at=clock_timestamp() WHERE id=${target.recipientId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({ code: "42501", message: "RFP receipt state cannot regress" });
    expect(await snapshot()).toEqual(before);
    if (sequence === "committed") {
      const replay = await direct(request);
      expect(replay.error?.code).toBe("42501"); expect(replay.data).toBeNull();
      expect(await statusRow("vendor", target.recipientId)).toBeUndefined();
      expect(await statusRow("customer", target.recipientId)).toMatchObject({ state: "withdrawn", receiptKind: "explicit", canConfirm: false });
      expect(await snapshot()).toEqual(before);
    } else {
      expect(await recipientProof(target.recipientId)).toMatchObject({ state: "distributed", acknowledgedAt: null,
        confirmations: 0, confirmationReceipts: 0, confirmationAudits: 0, submissions: 0, responseReceipts: 0, responseAudits: 0 });
    }
  }, 120000);
  test("denies customers, another vendor, unassigned users and anonymous callers without mutations", async () => {
    const before = await snapshot();
    for (const client of [customer.aal1, foreignVendor.aal1, fixture.identityTarget.aal1, fixture.anonymous]) {
      expect((await direct(input(), client)).error?.code).toBe("42501"); expect(await snapshot()).toEqual(before);
    }
    for (const [view, client] of [["staff", fixture.pair[0].aal1], ["customer", foreignVendor.aal1], ["vendor", customer.aal1]] as const) {
      await expect(status(view, client)).rejects.toBeInstanceOf(AuthorizationError); expect(await snapshot()).toEqual(before);
    }
  });
  test("rejects wrong stored version and altered or missing correlation/key without writes", async () => {
    const before = await snapshot(), request = input();
    expect((await direct({ ...request, rfpVersionId: randomUUID() })).error?.code).toBe("42501");
    for (const altered of [{ ...request, correlationId: randomUUID() }, { ...request, idempotencyKey: randomUUID() },
      { ...request, correlationId: undefined }, { ...request, idempotencyKey: undefined }, { ...request, actorIdentityId: vendor.identityId }]) {
      expect((await direct(altered, vendor.aal1, request.correlationId, request.idempotencyKey)).error?.code).toBe("22023");
      expect(await snapshot()).toEqual(before);
    }
  });
  test("rejects a foreign pagination cursor and leaves staff/customer controls disabled", async () => {
    const foreign = source.vendors[1]!.recipientId;
    await expect(status("vendor", undefined, foreign)).rejects.toBeInstanceOf(AuthorizationError);
    for (const view of ["customer", "staff"] as const) expect((await status(view)).items.every(row => !row.canConfirm)).toBe(true);
  });
  test("pages stored delivery rows without duplicates or crossed scopes", async () => {
    const first = await status("staff"); expect(first.items.length).toBeGreaterThan(0);
    const pivot = first.items[Math.floor(first.items.length / 2)]!;
    const next = await status("staff", undefined, pivot.recipientId), prefix = first.items.filter(row => row.recipientId <= pivot.recipientId);
    expect(next.items.length).toBeGreaterThan(0); expect(next.items.every(row => row.recipientId > pivot.recipientId)).toBe(true);
    expect(new Set([...prefix, ...next.items].map(row => row.recipientId)).size).toBe(prefix.length + next.items.length);
    if (!first.nextCursor) expect(next.items).toEqual(first.items.filter(row => row.recipientId > pivot.recipientId));
    else expect(first.nextCursor).toBe(first.items.at(-1)!.recipientId);
  });
  test("denies forged owner acknowledgement and preserves all row, receipt and audit bytes", async () => {
    const before = await snapshot();
    await expect(signedOwner(async sql => {
      await sql`UPDATE public.rfp_recipients SET state='acknowledged',acknowledged_at=clock_timestamp() WHERE id=${deniedTarget.recipientId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({ code: "42501", message: "RFP acknowledgement requires confirmation evidence" });
    expect(await snapshot()).toEqual(before);
  });
  test.each(["distributed", "responded"] as const)("denies owner-forged implicit receipt in %s state without response evidence", async state => {
    const before = await snapshot();
    await expect(signedOwner(async sql => {
      await sql`UPDATE public.rfp_recipients SET state=${state},acknowledged_at=clock_timestamp() WHERE id=${deniedTarget.recipientId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({ code: "42501", message: "RFP receipt requires a submitted response or confirmation" });
    expect(await snapshot()).toEqual(before);
  });
  test.each(["digest", "audit_action", "audit_reason"] as const)("denies owner-forged %s evidence in a valid current actor context", async attack => {
    const request = input(), before = await snapshot();
    await expect(signedOwner(async sql => {
      const auditId = randomUUID(), receiptId = randomUUID();
      const [clock] = await sql<{ at: string }[]>`SELECT clock_timestamp()::text at`;
      await sql`INSERT INTO public.audit_events(id,actor_type,actor_identity_id,organization_id,command,action,entity_type,entity_id,
        reason,correlation_id,idempotency_key,after_summary,occurred_at)
        VALUES(${auditId}::uuid,'user',${vendor.identityId}::uuid,${request.organizationId}::uuid,'r4.rfp.confirm_receipt',
          ${attack === "audit_action" ? "rfp.other_action" : "rfp.confirm_receipt"},'rfp_receipt_confirmation',${request.confirmationId},
          ${attack === "audit_reason" ? "Synthetic forged evidence" : "Confirm receipt of delivered questionnaire"},${request.correlationId}::uuid,${request.idempotencyKey},
          ${JSON.stringify({ record_id: request.recipientId })}::jsonb,${clock!.at}::timestamptz)`;
      await sql`INSERT INTO public.security_command_receipts(id,actor_identity_id,command,idempotency_key,request_digest,entity_id,action,audit_event_id,created_at)
        VALUES(${receiptId}::uuid,${vendor.identityId}::uuid,'r4.rfp.confirm_receipt',${request.idempotencyKey}::uuid,
          CASE WHEN ${attack === "digest"} THEN ${"0".repeat(64)} ELSE encode(sha256(convert_to(${JSON.stringify(request)}::jsonb::text,'UTF8')),'hex') END,
          ${request.confirmationId}::uuid,'rfp.confirm_receipt',${auditId}::uuid,${clock!.at}::timestamptz)`;
      await sql`INSERT INTO mmhr_private.rfp_receipt_confirmations(id,recipient_id,customer_organization_id,vendor_organization_id,rfp_version_id,
        actor_identity_id,original_request,original_result,receipt_id,correlation_id,acknowledged_at)
        VALUES(${request.confirmationId}::uuid,${request.recipientId}::uuid,${fixture.organizationId}::uuid,${request.organizationId}::uuid,
          ${request.rfpVersionId}::uuid,${vendor.identityId}::uuid,${JSON.stringify(request)}::jsonb,
          jsonb_build_object('organizationId',${request.organizationId}::uuid,'confirmationId',${request.confirmationId}::uuid,
            'recipientId',${request.recipientId}::uuid,'rfpVersionId',${request.rfpVersionId}::uuid,'correlationId',${request.correlationId}::uuid,
            'acknowledgedAt',${clock!.at}::timestamptz,'state','acknowledged'),${receiptId}::uuid,${request.correlationId}::uuid,${clock!.at}::timestamptz)`;
    })).rejects.toMatchObject({ code: "42501", message: "RFP receipt command evidence denied" });
    expect(await snapshot()).toEqual(before);
  });
  test("denies raw table access and immutable receipt changes with no table grant", async () => {
    expect((await vendor.aal1.from("rfp_recipients").select("*")).error?.code).toBe("42501");
    const target = await freshRequest(), request = input(target); await confirmRfpReceipt(request, options(vendor.aal1));
    const before = await snapshot();
    await expect(fixture.owner`UPDATE mmhr_private.rfp_receipt_confirmations SET original_result='{}' WHERE id=${request.confirmationId}::uuid`).rejects.toMatchObject({ code: "P0001" });
    await expect(fixture.owner`DELETE FROM mmhr_private.rfp_receipt_confirmations WHERE id=${request.confirmationId}::uuid`).rejects.toMatchObject({ code: "P0001" });
    await expect(fixture.owner`TRUNCATE mmhr_private.rfp_receipt_confirmations`).rejects.toMatchObject({ code: "P0001" });
    await expect(fixture.owner`UPDATE public.rfp_recipients SET acknowledged_at=clock_timestamp() WHERE id=${target.recipientId}::uuid`).rejects.toMatchObject({ code: "42501" });
    expect(await snapshot()).toEqual(before);
  }, 120000);
  test("rolls back when the audit insertion fails", async () => {
    const target = await freshRequest(), request = input(target), before = await snapshot();
    await expect(signedOwner(async sql => {
      await sql`CREATE FUNCTION mmhr_private.r4_receipt_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''Synthetic receipt audit failure''; END;'`;
      await sql`CREATE TRIGGER r4_receipt_test_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_receipt_test_audit_failure()`;
      await sql`SELECT public.mmhr_confirm_rfp_receipt(${JSON.stringify(request)}::jsonb,${request.correlationId}::uuid,${request.idempotencyKey}::uuid)`;
    })).rejects.toMatchObject({ code: "P0001", message: "Synthetic receipt audit failure" });
    expect(await snapshot()).toEqual(before);
  }, 120000);
  test("retains function hardening and default-deny private table authority", async () => {
    const functions = await fixture.owner<{ name: string; definer: boolean; settings: string[] }[]>`SELECT p.proname name,p.prosecdef definer,p.proconfig settings
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('mmhr_confirm_rfp_receipt','mmhr_get_rfp_receipt_status')`;
    expect(functions).toHaveLength(2);
    for (const fn of functions) { expect(fn.definer).toBe(true); expect(fn.settings).toContain('search_path=""'); expect(fn.settings.some(setting => /^timezone=UTC$/i.test(setting))).toBe(true); }
    const privateNames = ['r4_receipt_actor','r4_receipt_evidence_guard','r4_receipt_timestamp_guard','r4_receipt_projection_guard'];
    const grants = await fixture.owner<{ name: string; schema: string; roles: string[] }[]>`SELECT p.proname name,n.nspname schema,
      ARRAY(SELECT CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
        WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>p.proowner ORDER BY acl.grantee) roles
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
      (n.nspname='public' AND p.proname IN ('mmhr_confirm_rfp_receipt','mmhr_get_rfp_receipt_status')) OR
      (n.nspname='mmhr_private' AND p.proname IN ('r4_receipt_actor','r4_receipt_evidence_guard','r4_receipt_timestamp_guard','r4_receipt_projection_guard'))`;
    expect(grants).toHaveLength(6);
    expect(grants.filter(fn => fn.schema === 'mmhr_private').map(fn => fn.name).sort()).toEqual([...privateNames].sort());
    for (const fn of grants) expect(fn.roles).toEqual(fn.schema === 'public' ? ['authenticated'] : []);
    const authority = await fixture.owner<{ schema: string; role: string; allowed: boolean }[]>`SELECT n.nspname schema,roles.rolname role,
      has_function_privilege(roles.oid,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN pg_roles roles WHERE roles.rolname IN ('anon','authenticated','service_role','mmhr_worker') AND
      ((n.nspname='public' AND p.proname IN ('mmhr_confirm_rfp_receipt','mmhr_get_rfp_receipt_status')) OR
      (n.nspname='mmhr_private' AND p.proname IN ('r4_receipt_actor','r4_receipt_evidence_guard','r4_receipt_timestamp_guard','r4_receipt_projection_guard')))`;
    expect(authority).toHaveLength(24);
    for (const permission of authority) expect(permission.allowed).toBe(permission.schema === 'public' && permission.role === 'authenticated');
    const [rls] = await fixture.owner`SELECT relrowsecurity FROM pg_class WHERE oid='mmhr_private.rfp_receipt_confirmations'::regclass`;
    expect(rls!.relrowsecurity).toBe(true);
    for (const role of ['anon','authenticated','service_role','mmhr_worker']) {
      const [privilege] = await fixture.owner`SELECT has_table_privilege(${role},'mmhr_private.rfp_receipt_confirmations','SELECT,INSERT,UPDATE,DELETE') allowed`;
      expect(privilege!.allowed).toBe(false);
    }
  });
  test("a deleted genuine session denies exact and fresh requests without changing evidence", async () => {
    const actor = await fixture.createSyntheticPrincipal();
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${source.vendors[0]!.organizationId}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false)`;
    const target = await freshRequest(), request = input(target);
    await confirmRfpReceipt(request, options(actor.aal1));
    const claims = await verifiedApiClaims(actor.aal1, "aal1");
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${actor.subjectId}::uuid`;
    const before = await snapshot();
    expect((await direct(request, actor.aal1)).error?.code).toBe("42501");
    expect((await direct(input(), actor.aal1)).error?.code).toBe("42501");
    await expect(status("vendor", actor.aal1)).rejects.toBeInstanceOf(AuthorizationError); expect(await snapshot()).toEqual(before);
  }, 120000);
  test("a current scoped permission denial overrides an otherwise valid portal session", async () => {
    const actor = await fixture.createSyntheticPrincipal();
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${source.vendors[0]!.organizationId}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,'contributor','contributor',false)`;
    const target = await freshRequest(), request = input(target); await confirmRfpReceipt(request, options(actor.aal1));
    await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${actor.identityId}::uuid,'portal.vendor.access','organization',${request.organizationId}::uuid,
        ${'organization:' + request.organizationId},'deny',${fixture.pair[0].identityId}::uuid,'Synthetic current permission denial')`;
    const before = await snapshot(); expect((await direct(request, actor.aal1)).error?.code).toBe("42501");
    await expect(status("vendor", actor.aal1)).rejects.toBeInstanceOf(AuthorizationError); expect(await snapshot()).toEqual(before);
  }, 120000);
  test("revoked portal access denies original retries until a new authorized grant exists", async () => {
    const target = await freshRequest(), request = input(target), saved = await confirmRfpReceipt(request, options(vendor.aal1));
    const staff = elevatedClient(fixture.pair[0]);
    async function authorizePortalAdministration(permission: "portal.access.revoke" | "portal.access.grant") {
      const authorization = await staff.rpc("mmhr_authorize", { permission_key: permission, organization_id: request.organizationId });
      expect(authorization.error).toBeNull();
      expect(authorization.data).toEqual([expect.objectContaining({ identity_id: fixture.pair[0].identityId,
        authorized_organization_id: request.organizationId, assurance: "aal2" })]);
    }
    const [grant] = await fixture.owner<{ id: string }[]>`SELECT id FROM public.portal_access_grants WHERE organization_id=${request.organizationId}::uuid AND portal='vendor' AND state='active'`;
    expect(grant).toBeDefined();
    await authorizePortalAdministration("portal.access.revoke");
    const revoked = await elevatedClient(fixture.pair[0]).rpc("mmhr_revoke_portal_access", { organization_id: request.organizationId,
      grant_id: grant!.id, reason: "Synthetic receipt access revocation", correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(revoked.error).toBeNull(); const before = await snapshot();
    expect((await direct(request)).error?.code).toBe("42501"); await expect(status("vendor")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await snapshot()).toEqual(before);
    await authorizePortalAdministration("portal.access.grant");
    const restored = await elevatedClient(fixture.pair[0]).rpc("mmhr_grant_portal_access", { organization_id: request.organizationId,
      portal: "vendor", reason: "New synthetic authorized portal grant", correlation_id: randomUUID(), idempotency_key: randomUUID() });
    expect(restored.error).toBeNull(); const restoredBefore = await snapshot();
    expect(await confirmRfpReceipt(request, options(vendor.aal1))).toEqual(saved); expect(await snapshot()).toEqual(restoredBefore);
  }, 120000);
  registerRfpReceiptOverflow(() => ({ fixture, vendorOrganizationId: source.vendors[0]!.organizationId, intakeId: source.intakeId, freshRequest, status }));
  test("an inactive vendor profile denies writes and excludes vendor status rows", async () => {
    const target = await freshRequest(), request = input(target), saved = await confirmRfpReceipt(request, options(vendor.aal1));
    const [prior] = await fixture.owner<{ status: string }[]>`SELECT status FROM public.vendor_profiles WHERE id=${source.vendors[0]!.profileId}::uuid`;
    try {
      await fixture.owner`UPDATE public.vendor_profiles SET status='paused' WHERE id=${source.vendors[0]!.profileId}::uuid`;
      const before = await snapshot();
      expect((await direct(request)).error?.code).toBe("42501"); expect((await direct(input())).error?.code).toBe("42501");
      const page = await status("vendor"); expect(page.items).toEqual([]); expect(page.nextCursor).toBeNull();
      expect(await snapshot()).toEqual(before);
    } finally { await fixture.owner`UPDATE public.vendor_profiles SET status=${prior!.status} WHERE id=${source.vendors[0]!.profileId}::uuid`; }
    const restored = await snapshot(); expect(await confirmRfpReceipt(request, options(vendor.aal1))).toEqual(saved); expect(await snapshot()).toEqual(restored);
  }, 120000);
  test("revoked membership denies status and exact replay with immutable evidence retained", async () => {
    const target = await freshRequest(), request = input(target); await confirmRfpReceipt(request, options(vendor.aal1));
    await fixture.owner`UPDATE public.org_members SET status='revoked',revoked_at=clock_timestamp(),revoked_by_identity_id=${fixture.organizationAdmin.identityId}::uuid,
      revoked_reason='Synthetic receipt revocation' WHERE org_id=${request.organizationId}::uuid AND identity_id=${vendor.identityId}::uuid`;
    const before = await snapshot(); expect((await direct(request)).error?.code).toBe("42501");
    await expect(status("vendor")).rejects.toBeInstanceOf(AuthorizationError); expect(await snapshot()).toEqual(before);
  }, 120000);
});
