import "server-only";
import { z } from "zod";
import { taskChoicesPageSchema, taskChoicesReadSchema, taskCommandSchema, taskDetailReadSchema, taskDetailSchema,
  taskHistoryPageSchema, taskHistoryReadSchema, taskQueuePageSchema, taskQueueReadSchema, taskResultSchema } from "@/lib/deal-follow-up";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

export class TaskRevisionConflict extends Error {
  constructor() { super("The task or queue changed. Reload the page before another change."); }
}
export class TaskInputError extends Error {
  constructor() { super("The task fields or action are invalid. Check the fields before another change."); }
}
async function invoke(name: string, input: { organizationId: string; correlationId: string; idempotencyKey?: string }, options: AuthorizationOptions) {
  try {
  const context = await requirePermission("admin.access", { kind: "platform" }, { ...options, correlationId: input.correlationId });
  const workspace = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { supabase: context.supabase, correlationId: input.correlationId });
  if (context.scope.kind !== "platform" || context.assurance !== "aal2" || context.correlationId !== input.correlationId
    || workspace.scope.kind !== "organization" || workspace.scope.organizationId !== input.organizationId
    || workspace.identityId !== context.identityId || workspace.assurance !== "aal2" || workspace.correlationId !== input.correlationId) {
    throw new AuthorizationError();
  }
  const response = await context.supabase.rpc(name, { payload: input, correlation_id: input.correlationId,
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}) });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error?.code === "40001") throw new TaskRevisionConflict();
  if (["22023", "22007", "22008"].includes(response.error?.code ?? "")) throw new TaskInputError();
  if (response.error) throw new Error("Task request failed");
  if (name === "mmhr_get_deal_follow_up_queue" && response.data && typeof response.data === "object"
    && "nextCursor" in response.data && response.data.nextCursor && typeof response.data.nextCursor === "object"
    && "actorIdentityId" in response.data.nextCursor && response.data.nextCursor.actorIdentityId !== context.identityId) {
    throw new Error("Invalid task cursor");
  }
  return response.data as unknown;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof TaskRevisionConflict || error instanceof TaskInputError) throw error;
    throw new Error("Task request failed");
  }
}
async function read<T extends z.ZodType>(name: string, value: unknown, inputSchema: z.ZodType<{ organizationId: string; correlationId: string }>,
  outputSchema: T, options: AuthorizationOptions): Promise<z.infer<T>> {
  const input = inputSchema.parse(value);
  const output = outputSchema.parse(await invoke(name, input, options));
  const scope = output as { organizationId: string; correlationId: string };
  if (scope.organizationId !== input.organizationId || scope.correlationId !== input.correlationId) throw new Error("Invalid task response");
  return output;
}
export async function recordDealFollowUp(value: unknown, options: AuthorizationOptions = {}) {
  const input = taskCommandSchema.parse(value), result = taskResultSchema.parse(await invoke("mmhr_record_deal_follow_up", input, options));
  const expectedState = input.action === "create" ? "open" : input.action === "start" || input.action === "resume" ? "in_progress"
    : input.action === "block" ? "blocked" : input.action === "complete" ? "completed" : input.action === "cancel" ? "cancelled" : null;
  if (result.taskId !== input.taskId || result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.action !== input.action || result.revision !== (input.action === "create" ? 1 : input.expectedRevision + 1)
    || (expectedState ? result.state !== expectedState : result.state === "completed" || result.state === "cancelled")) {
    throw new Error("Invalid task response");
  }
  return result;
}
export async function getDealFollowUpQueue(value: unknown, options: AuthorizationOptions = {}) {
  const input = taskQueueReadSchema.parse(value);
  const page = await read("mmhr_get_deal_follow_up_queue", input, taskQueueReadSchema, taskQueuePageSchema, options);
  let previous = input.cursor?.afterId;
  for (const item of page.items) {
    if (item.organizationId !== input.organizationId || (previous && item.taskId <= previous)) throw new Error("Invalid task page");
    previous = item.taskId;
  }
  if (page.queue !== input.queue || (page.nextCursor && (page.items.length !== 25 || page.nextCursor.afterId !== previous
    || page.nextCursor.version !== page.version || page.nextCursor.organizationId !== input.organizationId
    || page.nextCursor.queue !== input.queue || page.nextCursor.asOf !== page.asOf))
    || (input.cursor && (page.version !== input.cursor.version || page.asOf !== input.cursor.asOf))) throw new Error("Invalid task cursor");
  return page;
}
export async function getDealFollowUp(value: unknown, options: AuthorizationOptions = {}) {
  const input = taskDetailReadSchema.parse(value);
  const page = await read("mmhr_get_deal_follow_up", input, taskDetailReadSchema, taskDetailSchema, options);
  if (page.item.taskId !== input.taskId || page.item.organizationId !== input.organizationId) throw new Error("Invalid task detail");
  return page;
}
export async function getDealFollowUpHistory(value: unknown, options: AuthorizationOptions = {}) {
  const input = taskHistoryReadSchema.parse(value);
  const page = await read("mmhr_get_deal_follow_up_history", input, taskHistoryReadSchema, taskHistoryPageSchema, options);
  if (page.taskId !== input.taskId) throw new Error("Invalid task history");
  let previous = input.beforeRevision;
  for (const event of page.events) {
    if ((previous !== undefined && event.revision !== previous - 1) || event.after.taskId !== input.taskId
      || event.after.organizationId !== input.organizationId || event.after.revision !== event.revision
      || (event.before !== null && (event.before.revision !== event.revision - 1 || event.before.taskId !== input.taskId
        || event.before.organizationId !== input.organizationId))) throw new Error("Invalid task history");
    previous = event.revision;
  }
  if (page.nextRevision && (page.events.length !== 25 || page.nextRevision !== previous)) throw new Error("Invalid task history cursor");
  return page;
}
export async function getDealFollowUpChoices(value: unknown, options: AuthorizationOptions = {}) {
  const input = taskChoicesReadSchema.parse(value);
  const page = await read("mmhr_get_deal_follow_up_choices", input, taskChoicesReadSchema, taskChoicesPageSchema, options);
  let previous = input.afterId;
  for (const item of page.items) { if (previous && item.id <= previous) throw new Error("Invalid task choices"); previous = item.id; }
  if (page.kind !== input.kind || (page.nextCursor && (page.items.length !== 25 || page.nextCursor !== previous))) throw new Error("Invalid task choices cursor");
  return page;
}
