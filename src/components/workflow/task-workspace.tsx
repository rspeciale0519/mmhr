import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { taskQueues, taskQueueCursorSchema } from "@/lib/deal-follow-up";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getDealFollowUp, getDealFollowUpChoices, getDealFollowUpHistory, getDealFollowUpQueue,
  TaskRevisionConflict, TaskInputError } from "@/server/commands/deal-follow-up";
import { TaskForm } from "./task-form";

function time(value: string | null) { return value ? new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC") : "Not set"; }
type Search = Promise<Record<string, string | string[] | undefined>>;
export async function TaskWorkspace({ taskId, searchParams }: { taskId?: string; searchParams: Search }) {
  await requirePagePermission("admin.access", { kind: "platform" });
  const { authorization } = await requireSelectedOrganizationPermission("workspace.access");
  if (authorization.scope.kind !== "organization") forbidden();
  const organizationId = authorization.scope.organizationId, options = { supabase: authorization.supabase };
  const parsed = z.strictObject({ queue: z.enum(taskQueues).default("owned"), cursor: z.string().min(1).max(1024).optional(),
    beforeRevision: z.coerce.number().int().positive().optional() })
    .refine(value => taskId ? !value.cursor : !value.beforeRevision).safeParse(await searchParams);
  if (!parsed.success || (taskId && !z.uuid().safeParse(taskId).success)) notFound();
  const input = () => ({ organizationId, correlationId: randomUUID() });
  let cursor;
  if (parsed.data.cursor) {
    try {
      const bytes = Buffer.from(parsed.data.cursor, "base64url");
      if (bytes.toString("base64url") !== parsed.data.cursor) notFound();
      cursor = taskQueueCursorSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch { notFound(); }
  }
  const frame = (children: React.ReactNode) => <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
    <header className="space-y-3"><Link className="inline-flex min-h-11 items-center underline" href="/admin">Back to administration</Link>
      <h1 className="text-balance text-3xl font-semibold">Customer deal follow-up tasks</h1>
      <p className="text-sm leading-7">Track staff work, due dates, blockers, and task history in the selected customer workspace.</p>
      <Link className="inline-flex min-h-11 items-center text-sm underline" href="/workspaces">Change customer workspace</Link>
    </header>{children}</main>;
  const denied = (error: unknown): never => { if (error instanceof AuthorizationError || error instanceof TaskInputError) notFound(); throw error; };
  const people = await getDealFollowUpChoices({ ...input(), kind: "people" }, options).catch(denied);
  if (taskId) {
    const [detail, history] = await Promise.all([
      getDealFollowUp({ ...input(), taskId }, options),
      getDealFollowUpHistory({ ...input(), taskId, beforeRevision: parsed.data.beforeRevision }, options),
    ]).catch(denied);
    const item = detail.item;
    return frame(<><Link className="inline-flex min-h-11 items-center underline" href="/admin/tasks">Back to task queues</Link>
      <article className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <h2 className="text-2xl font-semibold">{item.title}</h2>
        <p className="text-sm">{item.state.replaceAll("_", " ")} · {item.priority} priority · Revision {item.revision}</p>
        <p className="whitespace-pre-wrap text-sm">{item.description ?? "No description is recorded."}</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Owner</dt><dd>{item.ownerLabel}{!item.ownerAvailable && " · Access is unavailable"}</dd></div>
          <div><dt className="font-medium">Assignee</dt><dd>{item.assigneeLabel ?? "Unassigned"}{item.assigneeAvailable === false && " · Access is unavailable"}</dd></div>
          <div><dt className="font-medium">Due</dt><dd className="tabular-nums">{time(item.dueAt)}</dd></div>
          <div><dt className="font-medium">Customer deal</dt><dd>{item.dealLabel}</dd></div>
        </dl>
        {item.blockerReason && <section><h3 className="font-medium">Blocker</h3><p className="whitespace-pre-wrap text-sm leading-7">{item.blockerReason}</p></section>}
        {!item.ownerAvailable && <p className="text-sm">A team manager can transfer ownership to an active staff member.</p>}
      </article>
      <TaskForm key={item.revision} organizationId={organizationId} item={item} people={people}/>
      <section className="space-y-4"><h2 className="text-xl font-semibold">Task history</h2>
        <p className="text-sm">People and deal labels use their current records. Saved task fields preserve the original values.</p>
        {history.events.length === 0 && <p>No older task changes are available.</p>}
        <ul className="divide-y">{history.events.map(event => <li key={event.eventId} className="space-y-3 py-4 [overflow-wrap:anywhere]">
          <p className="font-medium">Revision {event.revision} · {event.action.replaceAll("_", " ")}</p>
          <p className="text-sm">{time(event.occurredAt)} · Recorded by {event.actorLabel}</p>
          <p className="whitespace-pre-wrap text-sm">{event.reason}</p>
          <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">Read saved changes</summary>
            <div className="grid gap-4 pt-3 sm:grid-cols-2">{(["before", "after"] as const).map(side => { const snapshot = event[side]; return <section key={side}>
              <h3 className="font-medium">{side === "before" ? "Before" : "After"}</h3>{snapshot ? <dl className="space-y-2">
                <div><dt className="font-medium">Title</dt><dd>{snapshot.title}</dd></div>
                <div><dt className="font-medium">Description</dt><dd className="whitespace-pre-wrap">{snapshot.description ?? "Not set"}</dd></div>
                <div><dt className="font-medium">Customer deal</dt><dd>{snapshot.dealLabel}</dd></div>
                <div><dt className="font-medium">Created by</dt><dd>{snapshot.createdByLabel}</dd></div>
                <div><dt className="font-medium">Owner</dt><dd>{snapshot.ownerLabel}</dd></div>
                <div><dt className="font-medium">Assignee</dt><dd>{snapshot.assigneeLabel ?? "Unassigned"}</dd></div>
                <div><dt className="font-medium">State</dt><dd>{snapshot.state.replaceAll("_", " ")}</dd></div>
                <div><dt className="font-medium">Priority</dt><dd>{snapshot.priority}</dd></div>
                <div><dt className="font-medium">Due</dt><dd className="tabular-nums">{time(snapshot.dueAt)}</dd></div>
                <div><dt className="font-medium">Blocker</dt><dd className="whitespace-pre-wrap">{snapshot.blockerReason ?? "Not set"}</dd></div>
                <div><dt className="font-medium">Revision</dt><dd className="tabular-nums">{snapshot.revision}</dd></div>
              </dl> : <p>No earlier task existed.</p>}</section>; })}</div>
          </details>
        </li>)}</ul>
        {history.nextRevision && <Link className="inline-flex min-h-11 items-center underline" href={`/admin/tasks/${taskId}?beforeRevision=${history.nextRevision}`}>Older task changes</Link>}
      </section></>);
  }
  let queue;
  try { queue = await getDealFollowUpQueue({ ...input(), queue: parsed.data.queue,
    ...(cursor ? { cursor } : {}) }, options); }
  catch (error) {
    if (error instanceof TaskRevisionConflict) return frame(<section className="space-y-4"><p role="alert">The task queue changed. Start a fresh page.</p>
      <Link className="inline-flex min-h-11 items-center underline" href={`/admin/tasks?queue=${parsed.data.queue}`}>Reload task queue</Link></section>);
    return denied(error);
  }
  const deals = await getDealFollowUpChoices({ ...input(), kind: "deals" }, options).catch(denied);
  return frame(<><nav aria-label="Task queues" className="flex flex-wrap gap-4">{taskQueues.map(name =>
    <Link className="inline-flex min-h-11 items-center text-sm underline" aria-current={name === parsed.data.queue ? "page" : undefined}
      key={name} href={`/admin/tasks?queue=${name}`}>{name.replaceAll("_", " ")}{name !== "all" && <span className="ml-2 tabular-nums">({queue.counts[name]})</span>}</Link>)}</nav>
    <section className="space-y-4"><h2 className="text-xl font-semibold">{parsed.data.queue} tasks</h2>
      <p className="text-sm">Overdue dates use {time(queue.asOf)}. Reload the queue to check the current time.</p>
      {queue.items.length === 0 && <p>No tasks are in this queue.</p>}
      <ul className="divide-y">{queue.items.map(item => <li className="space-y-2 py-4" key={item.taskId}>
        <Link className="inline-flex min-h-11 items-center font-medium underline [overflow-wrap:anywhere]" href={`/admin/tasks/${item.taskId}`}>{item.title}</Link>
        <p className="text-sm">{item.state.replaceAll("_", " ")} · {item.priority} priority · Due {time(item.dueAt)}</p>
        <p className="text-sm [overflow-wrap:anywhere]">{item.dealLabel} · Owner {item.ownerLabel} · Assignee {item.assigneeLabel ?? "Unassigned"}</p>
        {(!item.ownerAvailable || item.assigneeAvailable === false) && <p className="text-sm">An owner or assignee has no current access.</p>}
      </li>)}</ul>
      {queue.nextCursor && <Link className="inline-flex min-h-11 items-center underline"
        href={`/admin/tasks?queue=${parsed.data.queue}&cursor=${Buffer.from(JSON.stringify(queue.nextCursor)).toString("base64url")}`}>Next task page</Link>}
    </section>
    {deals.items.length ? <TaskForm organizationId={organizationId} people={people} deals={deals} viewerIdentityId={authorization.identityId}/>
      : <p>A customer deal is required before staff can create a follow-up task.</p>}
  </>);
}
