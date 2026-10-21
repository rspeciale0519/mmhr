import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { taskCommandSchema, type TaskCommand } from "@/lib/deal-follow-up";
import { elevatedClient, verifiedApiClaims, type SecurityApiPrincipal,
  type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

type CreateCommand = Extract<TaskCommand, { action: "create" }>;
type Context = {
  fixture: SecurityCommandApiFixtures;
  owner: SecurityApiPrincipal;
  create: () => unknown;
  write: (input: unknown) => Promise<unknown>;
  snapshot: () => Promise<unknown>;
};
type Forgery = {
  name: string;
  request: (input: CreateCommand) => unknown;
  receiptRequest?: (input: CreateCommand) => unknown;
  message: string;
};

type HistoricalEvidence = { commands: TaskCommand[]; results: unknown[]; proof: unknown; functions: unknown };

async function taskFunctionProperties(fixture: SecurityCommandApiFixtures) {
  const rows = await fixture.owner`SELECT p.oid::text,p.proname,p.proowner::text,p.proacl::text,p.provolatile,p.prosecdef,p.proconfig,
    pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
      (n.nspname='mmhr_private' AND p.proname IN ('r8_task_event_guard','r8_task_commit_guard'))
      OR (n.nspname='public' AND p.proname='mmhr_record_deal_follow_up') ORDER BY n.nspname,p.proname`;
  expect(rows).toHaveLength(3);
  return rows;
}

async function historicalProof(fixture: SecurityCommandApiFixtures, taskId: string) {
  const [row] = await fixture.owner`SELECT jsonb_build_object(
    'events',(SELECT jsonb_agg(to_jsonb(e)-'original_request' ORDER BY e.revision) FROM public.deal_follow_up_events e WHERE e.task_id=${taskId}::uuid),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r WHERE r.entity_id=${taskId}::uuid AND r.command='r8.deal_follow_up'),
    'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a WHERE a.entity_id=${taskId}::text AND a.command='r8.deal_follow_up')) AS proof`;
  return row!.proof;
}

// Call before the additive migration in an owned fixture. Never disable triggers or insert fake legacy rows.
export async function captureHistoricalTaskRequests(context: Context): Promise<HistoricalEvidence> {
  const input = taskCommandSchema.parse(context.create());
  if (input.action !== "create") throw new Error("A genuine create fixture is required");
  const edit = taskCommandSchema.parse({ organizationId: input.organizationId, taskId: input.taskId, reason: input.reason,
    correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "edit", expectedRevision: 1, priority: "normal" });
  const results = [await context.write(input), await context.write(edit)];
  return { commands: [input, edit], results, proof: await historicalProof(context.fixture, input.taskId),
    functions: await taskFunctionProperties(context.fixture) };
}

export function registerHistoricalTaskRequestRegression(context: () => Context & { historical: HistoricalEvidence }) {
  test("preserves genuine pre-migration events, receipts, audit records and exact original replies", async () => {
    const current = context(), { historical } = current, taskId = historical.commands[0]!.taskId;
    expect(await historicalProof(current.fixture, taskId)).toEqual(historical.proof);
    expect(await taskFunctionProperties(current.fixture)).toEqual(historical.functions);
    const [row] = await current.fixture.owner<{ count: number }[]>`SELECT count(*)::integer AS count
      FROM public.deal_follow_up_events WHERE task_id=${taskId}::uuid AND original_request IS NULL`;
    expect(row!.count).toBe(2);
    const before = await current.snapshot();
    for (let index = 0; index < historical.commands.length; index++) {
      expect(await current.write(historical.commands[index])).toEqual({ ...(historical.results[index] as object), outcomeCode: "replayed" });
    }
    expect(await historicalProof(current.fixture, taskId)).toEqual(historical.proof);
    expect(await current.snapshot()).toEqual(before);
  });
}

// Register inside the existing genuine Auth suite. Its live context is ready after beforeAll.
export function registerTaskRequestRegressions(context: () => Context) {
  async function command() {
    const value = taskCommandSchema.parse(context().create());
    if (value.action !== "create") throw new Error("A genuine create fixture is required");
    return value;
  }
  async function claims() {
    const client = elevatedClient(context().owner);
    await verifiedApiClaims(client, "aal2");
    const result = await client.auth.getClaims();
    if (result.error || !result.data?.claims || result.data.claims.aal !== "aal2") {
      throw new Error("Verified genuine AAL2 claims are required");
    }
    return result.data.claims;
  }

  const forgeries: Forgery[] = [
    { name: "a different payload digest", request: input => input,
      receiptRequest: input => ({ ...input, title: "Different receipt request" }), message: "Task request evidence is required" },
    { name: "matching digest with different stored effects", request: input => ({ ...input, title: "Different requested title" }),
      message: "Task request effects do not match" },
    { name: "missing original request", request: () => null, receiptRequest: input => input,
      message: "Task request evidence is required" },
    { name: "missing request correlation", request: input => { const value: Record<string, unknown> = { ...input }; delete value.correlationId; return value; },
      message: "Task request evidence is required" },
    { name: "a different request idempotency key", request: input => ({ ...input, idempotencyKey: randomUUID() }),
      message: "Task request evidence is required" },
    { name: "a different request organization", request: input => ({ ...input, organizationId: randomUUID() }),
      message: "Task request evidence is required" },
    { name: "a different request actor assignment", request: input => ({ ...input, ownerIdentityId: randomUUID() }),
      message: "Task request assignment is not authorized" },
  ];

  test.each(forgeries)("denies owner evidence with $name and rolls back all writes", async attack => {
    const { fixture, owner, snapshot } = context(), input = await command(), verified = await claims();
    const originalRequest = attack.request(input), receiptRequest = attack.receiptRequest?.(input) ?? originalRequest;
    const before = await snapshot(); let receiptCreated = false, actorVerified = false;
    await expect(fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(verified)},true)`;
      const [authority] = await sql<{ actor: string }[]>`SELECT mmhr_private.r8_task_actor(${fixture.organizationId}::uuid) AS actor`;
      expect(authority!.actor).toBe(owner.identityId); actorVerified = true;
      const [clock] = await sql<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
      await sql`INSERT INTO public.crm_tasks(id,organization_id,subject_type,subject_id,title,description,assignee_identity_id,
        due_at,state,revision,correlation_id,created_at,updated_at) VALUES(${input.taskId}::uuid,${input.organizationId}::uuid,'deal',
        ${input.dealId}::uuid,${input.title},${input.description},${input.assigneeIdentityId}::uuid,${input.dueAt}::timestamptz,
        'open',1,${input.correlationId}::uuid,${clock!.at},${clock!.at})`;
      await sql`INSERT INTO public.deal_follow_ups(task_id,organization_id,deal_id,created_by_identity_id,owner_identity_id,priority)
        VALUES(${input.taskId}::uuid,${input.organizationId}::uuid,${input.dealId}::uuid,${owner.identityId}::uuid,
          ${input.ownerIdentityId}::uuid,${input.priority})`;
      const [proof] = await sql<{ receipt: { receipt_id: string } }[]>`SELECT mmhr_private.r1_finish_security_command(
        ${owner.identityId}::uuid,'r8.deal_follow_up','create','task',${input.taskId}::uuid,${input.organizationId}::uuid,
        ${input.reason},${input.correlationId}::uuid,${input.idempotencyKey}::uuid,${JSON.stringify(receiptRequest)}::jsonb,
        NULL::jsonb,jsonb_build_object('task_state','open','task_revision',1),${clock!.at}::timestamptz) AS receipt`;
      expect(proof!.receipt.receipt_id).toMatch(/^[0-9a-f-]{36}$/); receiptCreated = true;
      await sql`INSERT INTO public.deal_follow_up_events(organization_id,task_id,revision,actor_identity_id,action,reason,
        after_snapshot,original_result,receipt_id,occurred_at,correlation_id,original_request)
        VALUES(${input.organizationId}::uuid,${input.taskId}::uuid,1,${owner.identityId}::uuid,'create',${input.reason},
          mmhr_private.r8_task_snapshot(${input.taskId}::uuid),jsonb_build_object('organizationId',${input.organizationId}::text,
          'taskId',${input.taskId}::text,'action','create','state','open','revision',1,'outcomeCode','recorded',
          'correlationId',${input.correlationId}::text),${proof!.receipt.receipt_id}::uuid,${clock!.at},${input.correlationId}::uuid,
          ${originalRequest === null ? null : JSON.stringify(originalRequest)}::jsonb)`;
      await sql`INSERT INTO public.deal_follow_up_queue_versions(organization_id,revision) VALUES(${input.organizationId}::uuid,1)
        ON CONFLICT(organization_id) DO UPDATE SET revision=deal_follow_up_queue_versions.revision+1`;
    })).rejects.toMatchObject({ code: "42501", message: attack.message });
    expect(actorVerified).toBe(true); expect(receiptCreated).toBe(true); expect(await snapshot()).toEqual(before);
  });

  test("stores exact omitted and cleared fields and preserves original replies after later revisions", async () => {
    const { fixture, write, snapshot } = context(), input = await command(), first = await write(input);
    const metadata = { organizationId: input.organizationId, taskId: input.taskId, reason: input.reason };
    const omitted = { ...metadata, correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "edit", expectedRevision: 1, priority: "low" };
    const cleared = { ...metadata, correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "edit", expectedRevision: 2,
      description: null, dueAt: null };
    const editResult = await write(omitted); await write(cleared);
    const rows = await fixture.owner<{ original_request: unknown; digest_matches: boolean }[]>`SELECT e.original_request,
      r.request_digest=encode(sha256(convert_to(e.original_request::text,'UTF8')),'hex') AS digest_matches
      FROM public.deal_follow_up_events e JOIN public.security_command_receipts r ON r.id=e.receipt_id
      WHERE e.task_id=${input.taskId}::uuid ORDER BY e.revision`;
    expect(rows.map(row => row.original_request)).toEqual([input, omitted, cleared]);
    expect(rows.every(row => row.digest_matches)).toBe(true);
    const before = await snapshot();
    expect(await write(input)).toEqual({ ...(first as object), outcomeCode: "replayed" });
    expect(await write(omitted)).toEqual({ ...(editResult as object), outcomeCode: "replayed" });
    expect(await snapshot()).toEqual(before);
  });

  test("retains direct signed request timestamp text and its exact microsecond effect", async () => {
    const { fixture, owner, write, snapshot } = context(), input = { ...await command(), dueAt: "2026-10-03T13:10:00.123456+02:30" };
    const client = elevatedClient(owner), arguments_ = { payload: input, correlation_id: input.correlationId, idempotency_key: input.idempotencyKey };
    const first = await client.rpc("mmhr_record_deal_follow_up", arguments_);
    expect(first.error).toBeNull(); expect(first.data).toMatchObject({ revision: 1, state: "open", outcomeCode: "recorded" });
    const [row] = await fixture.owner<{ request: unknown; exact_due: boolean; digest_matches: boolean }[]>`SELECT e.original_request AS request,
      t.due_at=${input.dueAt}::timestamptz AS exact_due,r.request_digest=encode(sha256(convert_to(e.original_request::text,'UTF8')),'hex') AS digest_matches
      FROM public.deal_follow_up_events e JOIN public.crm_tasks t ON t.id=e.task_id
      JOIN public.security_command_receipts r ON r.id=e.receipt_id WHERE e.task_id=${input.taskId}::uuid AND e.revision=1`;
    expect(row).toMatchObject({ request: input, exact_due: true, digest_matches: true });
    await write({ organizationId: input.organizationId, taskId: input.taskId, reason: input.reason,
      correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "edit", expectedRevision: 1, dueAt: null });
    const before = await snapshot(), retry = await client.rpc("mmhr_record_deal_follow_up", arguments_);
    expect(retry.error).toBeNull(); expect(retry.data).toEqual({ ...first.data, outcomeCode: "replayed" });
    expect(await snapshot()).toEqual(before);
  });

  test("denies an edit receipt that claims a completion and rolls back its state history", async () => {
    const { fixture, owner, write, snapshot } = context(), input = await command(); await write(input);
    const verified = await claims(), edit = { organizationId: input.organizationId, taskId: input.taskId, reason: input.reason,
      correlationId: randomUUID(), idempotencyKey: randomUUID(), action: "edit", expectedRevision: 1, title: "Valid edit request" };
    const before = await snapshot(); let receiptCreated = false, actorVerified = false;
    await expect(fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(verified)},true)`;
      const [authority] = await sql<{ actor: string }[]>`SELECT mmhr_private.r8_task_actor(${input.organizationId}::uuid) AS actor`;
      expect(authority!.actor).toBe(owner.identityId); actorVerified = true;
      const [stored] = await sql<{ snapshot: unknown; at: Date }[]>`SELECT mmhr_private.r8_task_snapshot(${input.taskId}::uuid) AS snapshot,
        clock_timestamp() AS at`;
      await sql`UPDATE public.crm_tasks SET title=${edit.title},state='completed',revision=2,correlation_id=${edit.correlationId}::uuid,
        updated_at=${stored!.at} WHERE id=${input.taskId}::uuid`;
      await sql`INSERT INTO public.crm_task_state_history(organization_id,task_id,from_state,to_state,expected_revision,
        actor_identity_id,occurred_at,reason,correlation_id) VALUES(${input.organizationId}::uuid,${input.taskId}::uuid,'open','completed',1,
        ${owner.identityId}::uuid,${stored!.at},${edit.reason},${edit.correlationId}::uuid)`;
      const [proof] = await sql<{ receipt: { receipt_id: string } }[]>`SELECT mmhr_private.r1_finish_security_command(
        ${owner.identityId}::uuid,'r8.deal_follow_up','edit','task',${input.taskId}::uuid,${input.organizationId}::uuid,
        ${edit.reason},${edit.correlationId}::uuid,${edit.idempotencyKey}::uuid,${JSON.stringify(edit)}::jsonb,
        jsonb_build_object('task_state','open','task_revision',1),jsonb_build_object('task_state','completed','task_revision',2),
        ${stored!.at}::timestamptz) AS receipt`;
      receiptCreated = true;
      await sql`INSERT INTO public.deal_follow_up_events(organization_id,task_id,revision,actor_identity_id,action,reason,before_snapshot,
        after_snapshot,original_result,receipt_id,occurred_at,correlation_id,original_request) VALUES(${input.organizationId}::uuid,
        ${input.taskId}::uuid,2,${owner.identityId}::uuid,'edit',${edit.reason},${JSON.stringify(stored!.snapshot)}::jsonb,
        mmhr_private.r8_task_snapshot(${input.taskId}::uuid),jsonb_build_object('organizationId',${input.organizationId}::text,
          'taskId',${input.taskId}::text,'action','edit','state','completed','revision',2,'outcomeCode','recorded',
          'correlationId',${edit.correlationId}::text),${proof!.receipt.receipt_id}::uuid,${stored!.at},${edit.correlationId}::uuid,${JSON.stringify(edit)}::jsonb)`;
      await sql`UPDATE public.deal_follow_up_queue_versions SET revision=revision+1 WHERE organization_id=${input.organizationId}::uuid`;
    })).rejects.toMatchObject({ code: "42501", message: "Task request effects do not match" });
    expect(actorVerified).toBe(true); expect(receiptCreated).toBe(true); expect(await snapshot()).toEqual(before);
  });
}
