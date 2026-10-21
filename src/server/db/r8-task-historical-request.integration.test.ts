import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims,
  type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

describe("R8 original request evidence preserves genuine earlier task history", () => {
  let fixture: SecurityCommandApiFixtures, principal: SecurityApiPrincipal, taskId: string;
  let create: Record<string, unknown>, edit: Record<string, unknown>, first: Record<string, unknown>, second: Record<string, unknown>;
  let originalProof: unknown, originalFunctions: unknown;
  async function write(input: Record<string, unknown>) {
    const result = await elevatedClient(principal).rpc("mmhr_record_deal_follow_up", {
      payload: input, correlation_id: input.correlationId, idempotency_key: input.idempotencyKey,
    });
    expect(result.error).toBeNull();
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error("A task result is required");
    return result.data as Record<string, unknown>;
  }
  async function proof() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'events',(SELECT jsonb_agg(to_jsonb(e)-'original_request' ORDER BY e.revision)
        FROM public.deal_follow_up_events e WHERE e.task_id=${taskId}::uuid AND e.revision<=2),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r
        JOIN public.deal_follow_up_events e ON e.receipt_id=r.id WHERE e.task_id=${taskId}::uuid AND e.revision<=2),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a
        JOIN public.security_command_receipts r ON r.audit_event_id=a.id JOIN public.deal_follow_up_events e ON e.receipt_id=r.id
        WHERE e.task_id=${taskId}::uuid AND e.revision<=2)) AS evidence`;
    return row!.evidence;
  }
  async function state() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'task',(SELECT to_jsonb(t) FROM public.crm_tasks t WHERE t.id=${taskId}::uuid),
      'binding',(SELECT to_jsonb(b) FROM public.deal_follow_ups b WHERE b.task_id=${taskId}::uuid),
      'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.revision) FROM public.deal_follow_up_events e WHERE e.task_id=${taskId}::uuid),
      'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]'::jsonb) FROM public.crm_task_state_history h WHERE h.task_id=${taskId}::uuid),
      'queue',(SELECT to_jsonb(q) FROM public.deal_follow_up_queue_versions q WHERE q.organization_id=${fixture.organizationId}::uuid),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r WHERE r.entity_id=${taskId}::uuid),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a WHERE a.entity_id=${taskId}::text)) AS evidence`;
    return row!.evidence;
  }
  async function functions() {
    const rows = await fixture.owner`SELECT p.oid::text,p.proname,p.proowner::text,p.proacl::text,p.provolatile,p.prosecdef,p.proconfig,
      pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
        (n.nspname='mmhr_private' AND p.proname IN ('r8_task_event_guard','r8_task_commit_guard'))
        OR (n.nspname='public' AND p.proname='mmhr_record_deal_follow_up') ORDER BY n.nspname,p.proname`;
    expect(rows).toHaveLength(3); return rows;
  }
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures({ migrationStage: "before_r8_task_request_evidence" });
    expect(fixture.taskRequestEvidenceMigration).not.toBeNull();
    principal = await fixture.createSyntheticPrincipal({ mfa: true });
    const claims = await verifiedApiClaims(elevatedClient(principal), "aal2");
    expect(claims.subjectId).toBe(principal.subjectId);
    const [role] = await fixture.owner<{ id: string }[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
      VALUES(${principal.identityId}::uuid,'staff',clock_timestamp(),'Genuine historical task verification') RETURNING id`;
    await fixture.owner`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
      SELECT 'platform_assignment','reviewed_owner',${role!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
      FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${role!.id}::uuid
      WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${principal.identityId}::uuid,${principal.subjectId}::uuid,'contributor','contributor',false)`;
    await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${principal.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},
        'allow',${fixture.pair[1].identityId}::uuid,'Genuine historical task scope')`;
    const dealId = randomUUID(); taskId = randomUUID();
    await fixture.owner`INSERT INTO public.deals(id,organization_id,owner_identity_id)
      VALUES(${dealId}::uuid,${fixture.organizationId}::uuid,${principal.identityId}::uuid)`;
    const [legacy] = await fixture.owner<{ request_column: boolean; request_helper: boolean }[]>`SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='deal_follow_up_events'
        AND column_name='original_request') AS request_column,
      to_regprocedure('mmhr_private.r8_task_assert_request_evidence(public.deal_follow_up_events)') IS NOT NULL AS request_helper`;
    expect(legacy).toMatchObject({ request_column: false, request_helper: false });
    create = { organizationId: fixture.organizationId, taskId, dealId, correlationId: randomUUID(), idempotencyKey: randomUUID(),
      reason: "Genuine historical create", action: "create", title: "Earlier task", description: "Preserve earlier history",
      ownerIdentityId: principal.identityId, assigneeIdentityId: null, dueAt: "2026-10-03T13:10:00.123456+02:30", priority: "high" };
    edit = { organizationId: fixture.organizationId, taskId, correlationId: randomUUID(), idempotencyKey: randomUUID(),
      reason: "Genuine historical edit", action: "edit", expectedRevision: 1, title: "Earlier saved edit" };
    first = await write(create); second = await write(edit);
    expect(first).toMatchObject({ state: "open", revision: 1 }); expect(second).toMatchObject({ state: "open", revision: 2 });
    originalProof = await proof(); originalFunctions = await functions();
    const before = await state();
    await fixture.finishTaskRequestEvidenceMigration();
    const [after] = await fixture.owner<{ requests: number }[]>`SELECT count(*)::integer AS requests
      FROM public.deal_follow_up_events WHERE task_id=${taskId}::uuid AND original_request IS NULL`;
    expect(after!.requests).toBe(2);
    // The only added property on earlier immutable events is SQL NULL.
    const current = await state() as { events: Record<string, unknown>[] };
    const comparable = { ...current, events: current.events.map(event => { const copy = { ...event }; delete copy.original_request; return copy; }) };
    expect(comparable).toEqual(before);
    console.info("R8 historical migration capture", fixture.taskRequestEvidenceMigration);
  }, 420_000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180_000);

  test("keeps original event, receipt, audit and function properties unchanged", async () => {
    expect(await proof()).toEqual(originalProof); expect(await functions()).toEqual(originalFunctions);
    const [access] = await fixture.owner<{ private: boolean }[]>`SELECT p.prosecdef AND p.provolatile='v'
      AND p.proconfig @> ARRAY['search_path=""'] AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('mmhr_worker',p.oid,'EXECUTE') AND NOT has_function_privilege('mmhr_document_worker',p.oid,'EXECUTE') AS private
      FROM pg_proc p WHERE p.oid='mmhr_private.r8_task_assert_request_evidence(public.deal_follow_up_events)'::regprocedure`;
    expect(access!.private).toBe(true);
  });
  test("returns exact historical create and edit replies after a new request with captured evidence", async () => {
    const completed = await write({ organizationId: fixture.organizationId, taskId, correlationId: randomUUID(), idempotencyKey: randomUUID(),
      reason: "Complete preserved task after expansion", action: "complete", expectedRevision: 2 });
    expect(completed).toMatchObject({ state: "completed", revision: 3, outcomeCode: "recorded" });
    const [row] = await fixture.owner<{ request_present: boolean; digest_matches: boolean }[]>`SELECT e.original_request IS NOT NULL AS request_present,
      r.request_digest=encode(sha256(convert_to(e.original_request::text,'UTF8')),'hex') AS digest_matches
      FROM public.deal_follow_up_events e JOIN public.security_command_receipts r ON r.id=e.receipt_id
      WHERE e.task_id=${taskId}::uuid AND e.revision=3`;
    expect(row).toMatchObject({ request_present: true, digest_matches: true });
    const before = await state();
    expect(await write(create)).toEqual({ ...first, outcomeCode: "replayed" });
    expect(await write(edit)).toEqual({ ...second, outcomeCode: "replayed" });
    expect(await state()).toEqual(before); expect(await proof()).toEqual(originalProof);
  });
  test("refuses repeated migration completion without new database writes", async () => {
    const before = await state();
    await expect(fixture.finishTaskRequestEvidenceMigration()).rejects.toThrow("The captured task evidence migration is already finished or applying");
    expect(await state()).toEqual(before);
  });
  test("accepts valid task transitions and deferred checks under one consistent non-UTC transaction with genuine signed claims", async () => {
    const client = elevatedClient(principal); await verifiedApiClaims(client,"aal2");
    const verified = await client.auth.getClaims();
    expect(verified.error).toBeNull(); expect(verified.data?.claims.aal).toBe("aal2");
    if (!verified.data?.claims) throw new Error("Genuine signed claims are required");
    const otherTask = randomUUID(), metadata = () => ({organizationId:fixture.organizationId,taskId:otherTask,
      correlationId:randomUUID(),idempotencyKey:randomUUID(),reason:"Consistent non-UTC task action"});
    const commands = [
      {...create,...metadata(),action:"create"},
      {...metadata(),action:"edit",expectedRevision:1,title:"Non-UTC follow-up"},
      {...metadata(),action:"start",expectedRevision:2},
      {...metadata(),action:"block",expectedRevision:3,blockerReason:"Synthetic wait"},
      {...metadata(),action:"resume",expectedRevision:4},
      {...metadata(),action:"transfer_owner",expectedRevision:5,ownerIdentityId:principal.identityId},
      {...metadata(),action:"reassign",expectedRevision:6,assigneeIdentityId:null},
      {...metadata(),action:"complete",expectedRevision:7},
    ];
    await fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(verified.data!.claims)},true)`;
      await sql`SET LOCAL TIME ZONE 'America/New_York'`;
      for (const [index,command] of commands.entries()) {
        const [result] = await sql<{ outcome: { revision: number; action: string } }[]>`SELECT public.mmhr_record_deal_follow_up(
          ${JSON.stringify(command)}::jsonb,${command.correlationId}::uuid,${command.idempotencyKey}::uuid) AS outcome`;
        expect(result!.outcome).toMatchObject({revision:index+1,action:command.action});
      }
      // This forces all deferred guards while the same genuine request and TimeZone remain active.
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    });
    const [row] = await fixture.owner<{ count: number; valid: boolean; timestamp: string }[]>`SELECT count(*)::integer AS count,
      bool_and(r.request_digest=encode(sha256(convert_to(e.original_request::text,'UTF8')),'hex')) AS valid,
      max(e.after_snapshot->>'dueAt') AS timestamp FROM public.deal_follow_up_events e
      JOIN public.security_command_receipts r ON r.id=e.receipt_id WHERE e.task_id=${otherTask}::uuid`;
    expect(row).toMatchObject({count:8,valid:true,timestamp:"2026-10-03T06:40:00.123456-04:00"});
    expect(await proof()).toEqual(originalProof);
  });
});
