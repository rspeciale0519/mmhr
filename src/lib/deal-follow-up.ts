import { z } from "zod";

const uuid = z.uuid().transform(value => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const text = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const taskStates = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
const metadata = { organizationId: uuid, correlationId: uuid };
const write = { ...metadata, idempotencyKey: uuid, taskId: uuid, reason: text(2000) };
const change = { ...write, expectedRevision: z.number().int().min(1).max(2147483646) };
export const taskCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...write, action: z.literal("create"), dealId: uuid, title: text(200), description: text(2000).nullable(),
    ownerIdentityId: uuid, assigneeIdentityId: uuid.nullable(), dueAt: timestamp.nullable(), priority: z.enum(taskPriorities) }),
  z.strictObject({ ...change, action: z.literal("edit"), title: text(200).optional(), description: text(2000).nullable().optional(),
    dueAt: timestamp.nullable().optional(), priority: z.enum(taskPriorities).optional() })
    .refine(value => ["title", "description", "dueAt", "priority"].some(key => key in value), "Choose a field to change"),
  z.strictObject({ ...change, action: z.literal("reassign"), assigneeIdentityId: uuid.nullable() }),
  z.strictObject({ ...change, action: z.literal("transfer_owner"), ownerIdentityId: uuid }),
  z.strictObject({ ...change, action: z.literal("start") }),
  z.strictObject({ ...change, action: z.literal("block"), blockerReason: text(2000) }),
  z.strictObject({ ...change, action: z.literal("resume") }),
  z.strictObject({ ...change, action: z.literal("complete") }),
  z.strictObject({ ...change, action: z.literal("cancel") }),
]);
export type TaskCommand = z.infer<typeof taskCommandSchema>;
export type TaskState = typeof taskStates[number];
export const taskResultSchema = z.strictObject({ ...metadata, taskId: uuid, action: z.enum([
  "create", "edit", "reassign", "transfer_owner", "start", "block", "resume", "complete", "cancel"]),
  state: z.enum(taskStates), revision: z.number().int().positive(), outcomeCode: z.enum(["recorded", "replayed"]) });
export function canApplyTaskAction(state: TaskState, action: TaskCommand["action"]) {
  if (state === "completed" || state === "cancelled") return false;
  if (action === "create") return false;
  if (action === "start") return state === "open";
  if (action === "block") return state === "open" || state === "in_progress";
  if (action === "resume") return state === "blocked";
  if (action === "complete") return state === "open" || state === "in_progress";
  return true;
}
export const taskItemSchema = z.strictObject({ taskId: uuid, organizationId: uuid, dealId: uuid, title: text(200),
  dealLabel: z.string().min(1).max(800), ownerLabel: z.string().min(1).max(320), assigneeLabel: z.string().min(1).max(320).nullable(),
  createdByLabel: z.string().min(1).max(320),
  description: z.string().max(2000).nullable(), createdByIdentityId: uuid, ownerIdentityId: uuid,
  assigneeIdentityId: uuid.nullable(), ownerAvailable: z.boolean(), assigneeAvailable: z.boolean().nullable(),
  dueAt: timestamp.nullable(), priority: z.enum(taskPriorities), state: z.enum(taskStates), blockerReason: z.string().max(2000).nullable(),
  revision: z.number().int().positive(), createdAt: timestamp, updatedAt: timestamp,
  canManage: z.boolean(), canProgress: z.boolean() });
export type TaskItem = z.infer<typeof taskItemSchema>;
export const taskQueues = ["all", "owned", "assigned", "blocked", "overdue", "completed"] as const;
export const taskQueueCursorSchema = z.strictObject({ version: z.number().int().nonnegative(), afterId: uuid,
  organizationId: uuid, actorIdentityId: uuid, queue: z.enum(taskQueues), asOf: timestamp });
export const taskQueueReadSchema = z.strictObject({ ...metadata, queue: z.enum(taskQueues), cursor: taskQueueCursorSchema.optional() });
export const taskDetailReadSchema = z.strictObject({ ...metadata, taskId: uuid });
export const taskHistoryReadSchema = z.strictObject({ ...metadata, taskId: uuid, beforeRevision: z.number().int().positive().optional() });
export const taskChoicesReadSchema = z.strictObject({ ...metadata, kind: z.enum(["deals", "people"]), afterId: uuid.optional() });
export const taskQueuePageSchema = z.strictObject({ ...metadata, queue: z.enum(taskQueues), version: z.number().int().nonnegative(),
  asOf: timestamp, items: z.array(taskItemSchema).max(25), nextCursor: taskQueueCursorSchema.nullable(),
  counts: z.strictObject({ owned: z.number().int().nonnegative(), assigned: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(), overdue: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }) });
export const taskDetailSchema = z.strictObject({ ...metadata, item: taskItemSchema });
export const taskHistoryPageSchema = z.strictObject({ ...metadata, taskId: uuid, events: z.array(z.strictObject({
  eventId: uuid, revision: z.number().int().positive(), action: taskResultSchema.shape.action, actorIdentityId: uuid, actorLabel: z.string().min(1).max(320),
  occurredAt: timestamp, reason: text(2000), before: taskItemSchema.omit({ ownerAvailable: true, assigneeAvailable: true,
    canManage: true, canProgress: true }).nullable(), after: taskItemSchema.omit({ ownerAvailable: true, assigneeAvailable: true,
    canManage: true, canProgress: true }) })).max(25), nextRevision: z.number().int().positive().nullable() });
export const taskChoicesPageSchema = z.strictObject({ ...metadata, kind: z.enum(["deals", "people"]),
  items: z.array(z.strictObject({ id: uuid, label: z.string().min(1).max(800) })).max(25), nextCursor: uuid.nullable() });
