import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityApiPrincipal,
  type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { getDealFollowUp, getDealFollowUpChoices, getDealFollowUpHistory, getDealFollowUpQueue,
  recordDealFollowUp, TaskRevisionConflict, TaskInputError } from "@/server/commands/deal-follow-up";
import { registerTaskRequestRegressions } from "./test/r8-task-request-regressions";

describe("Customer deal follow-ups with genuine signed Auth", () => {
  let fixture: SecurityCommandApiFixtures, owner: SecurityApiPrincipal, assignee: SecurityApiPrincipal,
    other: SecurityApiPrincipal, dealId: string, foreignOrg: string, foreignDeal: string;
  const metadata = (taskId: string = randomUUID()) => ({ organizationId: fixture.organizationId, taskId,
    correlationId: randomUUID(), idempotencyKey: randomUUID(), reason: "Synthetic task verification" });
  const create = (taskId: string = randomUUID()) => ({ ...metadata(taskId), action: "create", dealId, title: "Synthetic customer follow-up",
    description: "Synthetic task scope", ownerIdentityId: owner.identityId, assigneeIdentityId: assignee.identityId,
    priority: "high", dueAt: "2026-01-01T10:00:00.000Z" });
  const change = (taskId: string, expectedRevision: number, action: string, fields: Record<string, unknown> = {}) =>
    ({ ...metadata(taskId), expectedRevision, action, ...fields });
  const write = (input: unknown, principal = owner) => recordDealFollowUp(input, { supabase: elevatedClient(principal) });
  const read = (taskId: string, principal = owner) => getDealFollowUp({ organizationId: fixture.organizationId, taskId,
    correlationId: randomUUID() }, { supabase: elevatedClient(principal) });
  const queue = (name = "all", cursor?: unknown, principal = owner) => getDealFollowUpQueue({ organizationId: fixture.organizationId,
    queue: name, correlationId: randomUUID(), ...(cursor ? { cursor } : {}) }, { supabase: elevatedClient(principal) });
  async function rpc(input: Record<string, unknown>, principal = owner, original = input) {
    return elevatedClient(principal).rpc("mmhr_record_deal_follow_up", { payload: input,
      correlation_id: original.correlationId, idempotency_key: original.idempotencyKey });
  }
  async function phase<T>(name: string, action: () => PromiseLike<T>) {
    const started = performance.now();
    try { return await action(); }
    finally { console.info("R8 signed diagnostic phase", { name, milliseconds: Math.round(performance.now() - started) }); }
  }
  function errorCategory(error: { code: string; message: string } | null) {
    if (!error) return "none";
    const stages: Record<string, string> = {
      "Security command denied": "security_command_evidence_or_capacity",
      "Task request is not authorized": "task_actor_or_scope",
      "Task assignment is not authorized": "assignment_eligibility",
      "Task evidence is required": "task_evidence",
      "Task event evidence is required": "event_evidence",
      "Task state history evidence is required": "state_history_evidence",
      "Task queue version is monotonic": "queue_version",
      "Task queue event evidence is required": "queue_event_evidence",
    };
    return stages[error.message] ?? (error.code === "42702" ? "ambiguous_sql_reference"
      : error.code === "22P02" ? "invalid_sql_text_representation" : "unclassified_sql");
  }
  async function snapshot() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.crm_tasks t),
      'bindings',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY task_id),'[]'::jsonb) FROM public.deal_follow_ups b),
      'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM public.deal_follow_up_events e),
      'states',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY id),'[]'::jsonb) FROM public.crm_task_state_history h),
      'queues',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY organization_id),'[]'::jsonb) FROM public.deal_follow_up_queue_versions v),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r WHERE command='r8.deal_follow_up'),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a WHERE command='r8.deal_follow_up')) AS state`;
    return row!.state;
  }
  async function addStaff() {
    const principal = await fixture.createSyntheticPrincipal({ mfa: true });
    const [assignment] = await fixture.owner<{ id: string }[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
      VALUES(${principal.identityId}::uuid,'staff',clock_timestamp(),'Synthetic task authority') RETURNING id`;
    await fixture.owner`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
      SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
      FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
      WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
    return principal;
  }
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures(); owner = await addStaff(); assignee = await addStaff(); other = await addStaff();
    for (const principal of [owner, assignee, other, ...fixture.pair]) {
      const issuer = principal.identityId === fixture.pair[1].identityId ? fixture.pair[0] : fixture.pair[1];
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${principal.identityId}::uuid,${principal.subjectId}::uuid,'contributor','contributor',false)`;
      await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${principal.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},
          'allow',${issuer.identityId}::uuid,'Synthetic scoped follow-up authority')`;
    }
    dealId = randomUUID(); foreignOrg = randomUUID(); foreignDeal = randomUUID();
    await fixture.owner`INSERT INTO public.deals(id,organization_id,owner_identity_id) VALUES(${dealId}::uuid,${fixture.organizationId}::uuid,${owner.identityId}::uuid)`;
    await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${foreignOrg}::uuid,'Synthetic foreign customer','customer','active',now(),false)`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${foreignOrg}::uuid,${fixture.pair[1].identityId}::uuid,${fixture.pair[1].subjectId}::uuid,'admin','organization_admin',false)`;
    await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${fixture.pair[1].identityId}::uuid,'workspace.access','organization',${foreignOrg}::uuid,${`organization:${foreignOrg}`},
        'allow',${fixture.pair[0].identityId}::uuid,'Synthetic foreign administration capacity')`;
    await fixture.owner`INSERT INTO public.deals(id,organization_id,owner_identity_id) VALUES(${foreignDeal}::uuid,${foreignOrg}::uuid,${other.identityId}::uuid)`;
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  }, 420000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180000);

  registerTaskRequestRegressions(() => ({ fixture, owner, create, write, snapshot }));

  test("accepts declared task audit states while retaining the generic status boundary", async () => {
    const summaries = [...["open", "in_progress", "blocked", "completed", "cancelled"].map(task_state => ({ task_state })),
      { status: "open" }, { task_state: "active" }];
    const rows = await fixture.owner<{ allowed: boolean }[]>`SELECT mmhr_private.r1_audit_summary_is_safe(entry.value) AS allowed
      FROM jsonb_array_elements(${JSON.stringify(summaries)}::jsonb) WITH ORDINALITY entry(value,position) ORDER BY entry.position`;
    expect(rows.map(row => row.allowed)).toEqual([true, true, true, true, true, false, false]);
  });
  test("bounds task audit revisions without changing generic version validation", async () => {
    const summaries = [1, 2147483647, 0, -1, 2147483648, 1.5, "1", null, {}, []].map(task_revision => ({ task_revision }));
    const rows = await fixture.owner<{ allowed: boolean }[]>`SELECT mmhr_private.r1_audit_summary_is_safe(entry.value) AS allowed
      FROM jsonb_array_elements(${JSON.stringify([...summaries, { version: 1 }, { version: 2147483647 }])}::jsonb)
      WITH ORDINALITY entry(value,position) ORDER BY entry.position`;
    expect(rows.map(row => row.allowed)).toEqual([true, true, false, false, false, false, false, false, false, false, true, false]);
  });

  test("verifies genuine positive fixture authority and exact public task RPC stages", async () => {
    const client = elevatedClient(owner), input = create(), common = {
      organizationId: fixture.organizationId, correlationId: randomUUID(),
    };
    const claims = await phase("verified_claims", () => client.auth.getClaims());
    const platform = await phase("platform_authorization", () => authorizePermission("admin.access", { kind: "platform" }, { supabase: client }));
    const scoped = await phase("scoped_authorization", () => authorizePermission("workspace.access",
      { kind: "organization", organizationId: fixture.organizationId }, { supabase: client }));
    const created = await phase("public_create", () => rpc(input));
    const queued = await phase("public_queue", () => client.rpc("mmhr_get_deal_follow_up_queue", {
      payload: { ...common, queue: "all" }, correlation_id: common.correlationId,
    }));
    const choices = await phase("public_choices", () => client.rpc("mmhr_get_deal_follow_up_choices", {
      payload: { ...common, kind: "people" }, correlation_id: common.correlationId,
    }));
    const authority = { verifiedAal2: claims.error === null && claims.data?.claims.aal === "aal2",
      platformAuthorized: platform?.identityId === owner.identityId, scopedAuthorized: scoped?.identityId === owner.identityId };
    console.info("R8 signed diagnostic authority", authority);
    for (const [name, result] of [["create", created], ["queue", queued], ["choices", choices]] as const) {
      const sqlState = result.error ? (/^[0-9A-Z]{5}$/.test(result.error.code) ? result.error.code : "unclassified") : null;
      console.info("R8 signed diagnostic RPC", { name, accepted: result.error === null, category: errorCategory(result.error), sqlState });
    }
    expect(Object.values(authority).every(Boolean)).toBe(true);
    expect(created.error === null).toBe(true); expect(queued.error === null).toBe(true); expect(choices.error === null).toBe(true);
  });

  test("completes create, edit, reassign, start, block, resume, owner transfer and complete with immutable history", async () => {
    const command = create(), first = await write(command); expect(first).toMatchObject({ state: "open", revision: 1 });
    await write(change(command.taskId, 1, "edit", { title: "Revised follow-up", description: null, dueAt: null, priority: "urgent" }));
    await write(change(command.taskId, 2, "reassign", { assigneeIdentityId: other.identityId }));
    await write(change(command.taskId, 3, "start"), other);
    await write(change(command.taskId, 4, "block", { blockerReason: "Await synthetic vendor answer" }), other);
    expect((await read(command.taskId)).item).toMatchObject({ state: "blocked", blockerReason: "Await synthetic vendor answer" });
    await write(change(command.taskId, 5, "resume"), other);
    await write(change(command.taskId, 6, "transfer_owner", { ownerIdentityId: assignee.identityId }));
    await write(change(command.taskId, 7, "complete"), other);
    const detail = (await read(command.taskId, assignee)).item;
    expect(detail).toMatchObject({ revision: 8, state: "completed", ownerIdentityId: assignee.identityId,
      createdByIdentityId: owner.identityId, description: null, dueAt: null, blockerReason: null, canManage: false, canProgress: false });
    const history = await getDealFollowUpHistory({ organizationId: fixture.organizationId, taskId: command.taskId,
      correlationId: randomUUID() }, { supabase: elevatedClient(assignee) });
    expect(history.events.map(event => event.revision)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(history.events.at(-1)?.before).toBeNull();
    for (let index = 0; index < history.events.length - 1; index++) expect(history.events[index]!.before).toEqual(history.events[index + 1]!.after);
  });
  test("returns exact original create and edit receipts after later states without duplicate writes", async () => {
    const input = create(), first = await write(input), edit = change(input.taskId, 1, "edit", { title: "Original saved edit" });
    const second = await write(edit); await write(change(input.taskId, 2, "complete")); const before = await snapshot();
    expect(await write(input)).toEqual({ ...first, outcomeCode: "replayed" });
    expect(await write(edit)).toEqual({ ...second, outcomeCode: "replayed" }); expect(await snapshot()).toEqual(before);
  });
  test("clears an assignee and preserves omitted optional fields", async () => {
    const input = create(); await write(input);
    await write(change(input.taskId, 1, "reassign", { assigneeIdentityId: null }));
    await write(change(input.taskId, 2, "edit", { priority: "low" }));
    expect((await read(input.taskId)).item).toMatchObject({ assigneeIdentityId: null, description: input.description, dueAt: input.dueAt });
  });
  test("removes closed tasks from active ownership, assignment and overdue counts", async () => {
    const before = await queue(), input = create(); await write(input); const active = await queue();
    expect(active.counts.owned).toBe(before.counts.owned + 1); expect(active.counts.overdue).toBe(before.counts.overdue + 1);
    await write(change(input.taskId, 1, "complete")); const closed = await queue();
    expect(closed.counts.owned).toBe(before.counts.owned); expect(closed.counts.overdue).toBe(before.counts.overdue);
    expect(closed.counts.completed).toBe(before.counts.completed + 1);
    expect((await queue("owned")).items.some(item => item.taskId === input.taskId)).toBe(false);
  });
  test.each(["owner", "assignee"])("allows team repair after the %s account leaves without reviving its creator", async role => {
    const input = create(); await write(input); const principal = role === "owner" ? owner : assignee;
    await fixture.owner`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=${principal.subjectId}::uuid`;
    try {
      const before = await snapshot();
      await expect(write(change(input.taskId, 1, "start"), principal)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(write(change(input.taskId, 1, role === "owner" ? "transfer_owner" : "reassign",
        role === "owner" ? { ownerIdentityId: principal.identityId } : { assigneeIdentityId: principal.identityId }), fixture.pair[0]))
        .rejects.toBeInstanceOf(AuthorizationError);
      expect(await snapshot()).toEqual(before);
      const item = (await read(input.taskId, fixture.pair[0])).item;
      expect(role === "owner" ? item.ownerAvailable : item.assigneeAvailable).toBe(false);
      expect(role === "owner" ? item.ownerLabel : item.assigneeLabel).toContain("@example.invalid");
      if (role === "owner") await write(change(input.taskId, 1, "start"), assignee);
      const repairRevision = role === "owner" ? 2 : 1;
      await write(change(input.taskId, repairRevision, role === "owner" ? "transfer_owner" : "reassign",
        role === "owner" ? { ownerIdentityId: other.identityId } : { assigneeIdentityId: other.identityId }), fixture.pair[0]);
      await write(change(input.taskId, repairRevision + 1, "cancel"), role === "owner" ? other : owner);
      expect((await read(input.taskId, fixture.pair[0])).item).toMatchObject({ createdByIdentityId: owner.identityId, state: "cancelled" });
      const history = await getDealFollowUpHistory({ organizationId: fixture.organizationId, taskId: input.taskId,
        correlationId: randomUUID() }, { supabase: elevatedClient(fixture.pair[0]) });
      expect(history.events.at(-1)?.actorLabel).toContain("@example.invalid");
      expect(history.events.at(-1)?.after.ownerLabel).toContain("@example.invalid");
    } finally { await fixture.owner`UPDATE auth.users SET banned_until=NULL WHERE id=${principal.subjectId}::uuid`; }
  });
  test("denies a former owner and former assignee after transfer and reassignment", async () => {
    const input = create(); await write(input); const start = change(input.taskId, 1, "start"); await write(start, assignee);
    await write(change(input.taskId, 2, "reassign", { assigneeIdentityId: other.identityId }));
    await write(change(input.taskId, 3, "transfer_owner", { ownerIdentityId: other.identityId }));
    const before = await snapshot();
    for (const [payload, principal] of [[start, assignee], [input, owner], [change(input.taskId, 4, "edit", { title: "Denied edit" }), owner]] as const) {
      await expect(write(payload, principal)).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(await snapshot()).toEqual(before);
  });
  test("denies unrelated staff metadata changes while allowing only the assigned progress actions", async () => {
    const input = create(); await write(input); const before = await snapshot();
    for (const action of ["edit", "reassign", "transfer_owner", "cancel"]) {
      const fields = action === "edit" ? { title: "Denied" } : action === "reassign" ? { assigneeIdentityId: other.identityId }
        : action === "transfer_owner" ? { ownerIdentityId: other.identityId } : {};
      await expect(write(change(input.taskId, 1, action, fields), assignee)).rejects.toBeInstanceOf(AuthorizationError);
    }
    await expect(write(change(input.taskId, 1, "start"), other)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(write({ ...create(), ownerIdentityId: other.identityId })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await snapshot()).toEqual(before);
    await write(change(input.taskId, 1, "start"), assignee);
  });
  test.each(["completed", "cancelled"])("denies every new action on a %s task", async state => {
    const input = create(); await write(input); await write(change(input.taskId, 1, state === "completed" ? "complete" : "cancel"));
    const before = await snapshot();
    for (const action of ["edit", "reassign", "transfer_owner", "start", "block", "resume", "complete", "cancel"]) {
      const fields = action === "edit" ? { title: "Forbidden reopen" } : action === "reassign" ? { assigneeIdentityId: null }
        : action === "transfer_owner" ? { ownerIdentityId: other.identityId } : action === "block" ? { blockerReason: "Forbidden" } : {};
      expect((await rpc(change(input.taskId, 2, action, fields))).error?.code).toBe("22023");
    }
    expect(await snapshot()).toEqual(before);
  });
  test("detects concurrent expected revisions without losing edits", async () => {
    const input = create(); await write(input);
    const responses = await Promise.allSettled([write(change(input.taskId, 1, "edit", { title: "First concurrent edit" })),
      write(change(input.taskId, 1, "edit", { priority: "urgent" }))]);
    expect(responses.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = responses.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(TaskRevisionConflict);
    expect((await read(input.taskId)).item.revision).toBe(2);
  });
  test("rejects changed payloads under one idempotency key without another write", async () => {
    const input = create(); await write(input); const before = await snapshot();
    expect((await rpc({ ...input, title: "Changed payload" })).error?.code).toBe("22023"); expect(await snapshot()).toEqual(before);
  });
  test.each(["correlationId", "idempotencyKey"])("binds altered and missing %s RPC metadata", async field => {
    const input = create(), before = await snapshot();
    for (const mode of ["altered", "missing"]) {
      const payload: Record<string, unknown> = { ...input, [field]: randomUUID() }; if (mode === "missing") delete payload[field];
      expect((await rpc(payload, owner, input)).error?.code).toBe("22023");
    }
    expect(await snapshot()).toEqual(before);
  });
  test("denies foreign scopes, foreign deals and ineligible assignment targets", async () => {
    const before = await snapshot();
    for (const payload of [{ ...create(), dealId: foreignDeal }, { ...create(), organizationId: foreignOrg },
      { ...create(), assigneeIdentityId: fixture.outsider.identityId }, { ...create(), ownerIdentityId: fixture.organizationAdmin.identityId }]) {
      expect((await rpc(payload)).error?.code).toBe("42501");
    }
    expect(await snapshot()).toEqual(before);
    const forged = create();
    expect((await rpc({ ...forged, assignedRole: "super_admin" })).error?.code).toBe("22023");
    expect(await snapshot()).toEqual(before);
  });
  test("denies signed AAL1, customer and external roles, and anonymous reads and writes", async () => {
    const input = create(), before = await snapshot();
    for (const supabase of [owner.aal1, fixture.organizationAdmin.aal1, elevatedClient(fixture.organizationAdmin), fixture.outsider.aal1, fixture.anonymous]) {
      await expect(recordDealFollowUp(input, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
      const direct = await supabase.rpc("mmhr_record_deal_follow_up", { payload: input, correlation_id: input.correlationId, idempotency_key: input.idempotencyKey });
      expect(direct.error).not.toBeNull();
      await expect(getDealFollowUpQueue({ organizationId: fixture.organizationId, queue: "all", correlationId: randomUUID() }, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    }
    expect(await snapshot()).toEqual(before);
  });
  test("rolls back all rows, history, queue versions and receipts when required audit storage fails", async () => {
    const input = create(); await write(input); const before = await snapshot();
    await fixture.owner`ALTER TABLE public.audit_events ADD CONSTRAINT r8_task_audit_failure CHECK(command<>'r8.deal_follow_up') NOT VALID`;
    try { await expect(write(change(input.taskId, 1, "block", { blockerReason: "Synthetic audit rollback" }))).rejects.toThrow("Task request failed"); }
    finally { await fixture.owner`ALTER TABLE public.audit_events DROP CONSTRAINT r8_task_audit_failure`; }
    expect(await snapshot()).toEqual(before);
  });
  test("denies raw task REST tables to all request roles", async () => {
    for (const supabase of [fixture.anonymous, fixture.outsider.aal1, elevatedClient(owner), elevatedClient(fixture.pair[0])]) {
      for (const table of ["crm_tasks", "crm_task_state_history", "deal_follow_ups", "deal_follow_up_events", "deal_follow_up_queue_versions"]) {
        const result = await supabase.from(table).select("*"); expect(result.error?.code).toBe("42501"); expect(result.data).toBeNull();
      }
    }
  });
  test("denies direct owner edits, removal and truncate when managed evidence would change", async () => {
    const input = create(); await write(input); const before = await snapshot();
    const attempts = [
      { attempt: () => fixture.owner`UPDATE public.crm_tasks SET title='Missing receipt' WHERE id=${input.taskId}::uuid`, error: { code: "42501" } },
      { attempt: () => fixture.owner`UPDATE public.crm_tasks SET state='completed' WHERE id=${input.taskId}::uuid`, error: { code: "42501" } },
      { attempt: () => fixture.owner`UPDATE public.deal_follow_ups SET owner_identity_id=${other.identityId}::uuid WHERE task_id=${input.taskId}::uuid`, error: { code: "42501" } },
      { attempt: () => fixture.owner`DELETE FROM public.crm_tasks WHERE id=${input.taskId}::uuid`, error: { code: "42501" } },
      { attempt: () => fixture.owner`TRUNCATE public.crm_tasks CASCADE`, error: { code: "42501" } },
      { attempt: () => fixture.owner`UPDATE public.deal_follow_up_events SET reason='Altered history' WHERE task_id=${input.taskId}::uuid`, error: { code: "P0001", message: "deal_follow_up_events is append-only" } },
      { attempt: () => fixture.owner`DELETE FROM public.deal_follow_up_events WHERE task_id=${input.taskId}::uuid`, error: { code: "P0001", message: "deal_follow_up_events is append-only" } },
    ];
    for (const { attempt, error } of attempts) { await expect(attempt()).rejects.toMatchObject(error); expect(await snapshot()).toEqual(before); }
  });
  test("rejects a complete-looking event bound to another entity receipt before commit", async () => {
    const input = create(), before = await snapshot(); let receiptCreated = false;
    await expect(fixture.owner.begin(async sql => {
      const [clock] = await sql<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
      await sql`INSERT INTO public.crm_tasks(id,organization_id,subject_type,subject_id,title,description,assignee_identity_id,due_at,state,revision,correlation_id,created_at,updated_at)
        VALUES(${input.taskId}::uuid,${fixture.organizationId}::uuid,'deal',${dealId}::uuid,${input.title},${input.description},
          ${input.assigneeIdentityId}::uuid,${input.dueAt}::timestamptz,'open',1,${input.correlationId}::uuid,${clock!.at},${clock!.at})`;
      await sql`INSERT INTO public.deal_follow_ups(task_id,organization_id,deal_id,created_by_identity_id,owner_identity_id,priority)
        VALUES(${input.taskId}::uuid,${fixture.organizationId}::uuid,${dealId}::uuid,${owner.identityId}::uuid,${owner.identityId}::uuid,${input.priority})`;
      const [proof] = await sql<{ receipt: { receipt_id: string } }[]>`SELECT mmhr_private.r1_finish_security_command(
        ${owner.identityId}::uuid,'r8.deal_follow_up','create','task',${randomUUID()}::uuid,${fixture.organizationId}::uuid,
        ${input.reason},${input.correlationId}::uuid,${input.idempotencyKey}::uuid,${JSON.stringify(input)}::jsonb,NULL::jsonb,
        jsonb_build_object('task_state','open','task_revision',1),${clock!.at}::timestamptz) AS receipt`;
      receiptCreated = true;
      await sql`INSERT INTO public.deal_follow_up_events(organization_id,task_id,revision,actor_identity_id,action,reason,after_snapshot,
        original_result,receipt_id,occurred_at,correlation_id) VALUES(${fixture.organizationId}::uuid,${input.taskId}::uuid,1,${owner.identityId}::uuid,
        'create',${input.reason},mmhr_private.r8_task_snapshot(${input.taskId}::uuid),jsonb_build_object(
          'organizationId',${fixture.organizationId}::text,'taskId',${input.taskId}::text,'action','create','state','open','revision',1,
          'outcomeCode','recorded','correlationId',${input.correlationId}::text),${proof!.receipt.receipt_id}::uuid,${clock!.at},${input.correlationId}::uuid)`;
    })).rejects.toMatchObject({ code: "42501" });
    expect(receiptCreated).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
  test("denies an extra managed state history row without a matching event", async () => {
    const input = create(); await write(input); const before = await snapshot();
    await expect(fixture.owner`INSERT INTO public.crm_task_state_history(
      organization_id,task_id,from_state,to_state,expected_revision,actor_identity_id,reason,occurred_at,correlation_id)
      VALUES(${fixture.organizationId}::uuid,${input.taskId}::uuid,'open','in_progress',1,
        ${owner.identityId}::uuid,'Synthetic unsupported transition',clock_timestamp(),${randomUUID()}::uuid)`)
      .rejects.toMatchObject({ code: "42501" });
    expect(await snapshot()).toEqual(before);
  });
  test("denies fabricated state history for a real event that did not change state", async () => {
    const input = create(); await write(input);
    await write(change(input.taskId, 1, "edit", { title: "Synthetic unchanged state" }));
    const before = await snapshot();
    await expect(fixture.owner`INSERT INTO public.crm_task_state_history(
      organization_id,task_id,from_state,to_state,expected_revision,actor_identity_id,reason,occurred_at,correlation_id)
      SELECT organization_id,task_id,'open','in_progress',revision-1,actor_identity_id,reason,occurred_at,correlation_id
      FROM public.deal_follow_up_events WHERE task_id=${input.taskId}::uuid AND revision=2`)
      .rejects.toMatchObject({ code: "42501" });
    expect(await snapshot()).toEqual(before);
  });
  test("denies a duplicate managed state history row with exact original event fields", async () => {
    const input = create(); await write(input); await write(change(input.taskId, 1, "start"));
    const before = await snapshot();
    await expect(fixture.owner`INSERT INTO public.crm_task_state_history(
      organization_id,task_id,from_state,to_state,expected_revision,actor_identity_id,reason,occurred_at,correlation_id)
      SELECT organization_id,task_id,from_state,to_state,expected_revision,actor_identity_id,reason,occurred_at,correlation_id
      FROM public.crm_task_state_history WHERE task_id=${input.taskId}::uuid AND expected_revision=1`)
      .rejects.toMatchObject({ code: "42501" });
    expect(await snapshot()).toEqual(before);
  });
  test.each(["reset", "increment_without_event", "delete", "truncate"])(
    "denies direct queue version %s without any managed row changes", async operation => {
      await write(create()); const before = await snapshot();
      const attempt = operation === "reset"
        ? () => fixture.owner`UPDATE public.deal_follow_up_queue_versions SET revision=1 WHERE organization_id=${fixture.organizationId}::uuid`
        : operation === "increment_without_event"
          ? () => fixture.owner`UPDATE public.deal_follow_up_queue_versions SET revision=revision+1 WHERE organization_id=${fixture.organizationId}::uuid`
          : operation === "delete"
            ? () => fixture.owner`DELETE FROM public.deal_follow_up_queue_versions WHERE organization_id=${fixture.organizationId}::uuid`
            : () => fixture.owner`TRUNCATE public.deal_follow_up_queue_versions`;
      const error = ["delete", "truncate"].includes(operation)
        ? { code: "P0001", message: "deal_follow_up_queue_versions is append-only" } : { code: "42501" };
      await expect(attempt()).rejects.toMatchObject(error);
      expect(await snapshot()).toEqual(before);
    });
  test("keeps function search paths and execution grants restricted to fixed application RPCs", async () => {
    const publicNames = ["mmhr_record_deal_follow_up", "mmhr_get_deal_follow_up_queue", "mmhr_get_deal_follow_up",
      "mmhr_get_deal_follow_up_history", "mmhr_get_deal_follow_up_choices"];
    const rows = await fixture.owner<{ proname: string; prosecdef: boolean; empty_path: boolean; authenticated: boolean;
      anonymous: boolean; service: boolean; worker: boolean }[]>`SELECT p.proname,p.prosecdef,p.proconfig @> ARRAY['search_path=""'] AS empty_path,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service,has_function_privilege('mmhr_worker',p.oid,'EXECUTE') AS worker
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(${publicNames}::text[])`;
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toMatchObject({ prosecdef: true, empty_path: true, authenticated: true, anonymous: false, service: false, worker: false });
    const privateRows = await fixture.owner<{ denied: boolean }[]>`SELECT NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AS denied
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mmhr_private' AND p.proname LIKE 'r8_task_%'`;
    expect(privateRows.length).toBeGreaterThan(5); expect(privateRows.every(row => row.denied)).toBe(true);
  });
  test("reads only current eligible staff and scoped deals through bounded choices", async () => {
    const opts = { supabase: elevatedClient(owner) }, common = { organizationId: fixture.organizationId, correlationId: randomUUID() };
    const people = await getDealFollowUpChoices({ ...common, kind: "people" }, opts);
    expect(people.items.map(item => item.id)).toContain(owner.identityId);
    expect(people.items.map(item => item.id)).not.toContain(fixture.organizationAdmin.identityId);
    const deals = await getDealFollowUpChoices({ ...common, kind: "deals" }, opts);
    expect(deals.items.map(item => item.id)).toContain(dealId); expect(deals.items.map(item => item.id)).not.toContain(foreignDeal);
  });
  test("pages immutable history without repeats after later revisions", async () => phase("history_journey", async () => {
    const input = create(); await phase("history_create", () => write(input));
    for (let revision = 1; revision <= 27; revision++) await phase("history_edit", () => write(change(input.taskId, revision, "edit", { title: `Synthetic revision ${revision + 1}` })));
    const common = { organizationId: fixture.organizationId, taskId: input.taskId, correlationId: randomUUID() }, opts = { supabase: elevatedClient(owner) };
    const first = await phase("history_first_page", () => getDealFollowUpHistory(common, opts)); expect(first.events).toHaveLength(25); expect(first.nextRevision).toBe(4);
    await phase("history_later_edit", () => write(change(input.taskId, 28, "edit", { priority: "urgent" })));
    const second = await phase("history_second_page", () => getDealFollowUpHistory({ ...common, beforeRevision: first.nextRevision! }, opts));
    expect(second.events.map(event => event.revision)).toEqual([3, 2, 1]); expect(second.nextRevision).toBeNull();
  }), 120_000);
  test("rejects changed, foreign and malformed queue cursors and refreshes live counts after writes", async () => phase("queue_journey", async () => {
    // Earlier tests leave closed and foreign-owned tasks in the shared org, so edit only a task this test owns.
    const created: string[] = [];
    for (let index = 0; index < 27; index++) { const input = create(); created.push(input.taskId); await phase("queue_create", () => write(input)); }
    const first = await phase("queue_first_page", () => queue()); expect(first.items).toHaveLength(25); expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor!;
    for (const change of [{ organizationId: foreignOrg }, { actorIdentityId: other.identityId }, { queue: "assigned" }, { afterId: randomUUID() }]) {
      await expect(queue("all", { ...cursor, ...change })).rejects.toBeInstanceOf(TaskInputError);
    }
    for (const change of [{ asOf: new Date(Date.now() + 60000).toISOString() }, { asOf: new Date(Date.now() - 16 * 60000).toISOString() }]) {
      await expect(queue("all", { ...cursor, ...change })).rejects.toBeInstanceOf(TaskRevisionConflict);
    }
    const malformed = { organizationId: fixture.organizationId, correlationId: randomUUID(), queue: "all", cursor: { ...cursor, asOf: "invalid" } };
    const rejected = await elevatedClient(owner).rpc("mmhr_get_deal_follow_up_queue", { payload: malformed, correlation_id: malformed.correlationId });
    expect(rejected.error?.code).toBe("22023");
    await write(change(created[0]!, 1, "edit", { priority: "low" }));
    await expect(queue("all", cursor)).rejects.toBeInstanceOf(TaskRevisionConflict);
    expect((await queue()).version).toBeGreaterThan(first.version);
  }), 120_000);
  test("holds overdue observation time across pages when time alone changes eligibility", async () => {
    const late = create("00000000-0000-4000-8000-000000000001");
    late.dueAt = new Date(Date.now() + 5000).toISOString(); await write(late);
    const first = await queue("overdue"); expect(first.nextCursor).not.toBeNull();
    expect(Date.parse(first.asOf)).toBeLessThan(Date.parse(late.dueAt));
    const deadline = Date.parse(late.dueAt) + 20;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now())));
    const second = await queue("overdue", first.nextCursor!);
    expect(second.asOf).toBe(first.asOf); expect(second.counts.overdue).toBe(first.counts.overdue);
    expect(second.items.some(item => item.taskId === late.taskId)).toBe(false);
    const live = await queue("overdue"); expect(live.items.some(item => item.taskId === late.taskId)).toBe(true);
  });
  test("reauthorizes original retries after scoped access revocation and stale or deleted genuine Auth sessions", async () => {
    const principal = await addStaff();
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${principal.identityId}::uuid,${principal.subjectId}::uuid,'contributor','contributor',false)`;
    const [override] = await fixture.owner<{ id: string }[]>`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${principal.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${fixture.pair[1].identityId}::uuid,'Synthetic retry checks') RETURNING id`;
    const input = { ...create(), ownerIdentityId: principal.identityId }, first = await write(input, principal), before = await snapshot();
    await fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE id=${override!.id}::uuid`;
    try { await expect(write(input, principal)).rejects.toBeInstanceOf(AuthorizationError); }
    finally { await fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE id=${override!.id}::uuid`; }
    const client = elevatedClient(principal), claims = await verifiedApiClaims(client, "aal2");
    const [session] = await fixture.owner`SELECT not_after FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    await fixture.owner`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id=${claims.sessionId}::uuid`;
    try { expect((await client.auth.getClaims()).error).toBeNull(); await expect(write(input, principal)).rejects.toBeInstanceOf(AuthorizationError); }
    finally { await fixture.owner`UPDATE auth.sessions SET not_after=${session!.not_after} WHERE id=${claims.sessionId}::uuid`; }
    expect(await write(input, principal)).toEqual({ ...first, outcomeCode: "replayed" });
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
    expect((await client.auth.getClaims()).error).toBeNull(); await expect(write(input, principal)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await snapshot()).toEqual(before);
  });
});
