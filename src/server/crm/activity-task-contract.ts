import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(2_000);

export const activityKinds = ["call", "email", "meeting", "note", "status_change", "task_completed"] as const;
export const activitySubjects = ["customer", "vendor", "product", "contact", "deal", "task"] as const;
export const taskStates = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
export type TaskState = (typeof taskStates)[number];

export const activitySchema = z.strictObject({
  activityId: uuid,
  organizationId: uuid,
  actorIdentityId: uuid,
  subjectType: z.enum(activitySubjects),
  subjectId: uuid,
  kind: z.enum(activityKinds),
  occurredAt: timestamp,
  correlationId: uuid,
  summary: z.string().trim().min(1).max(500),
});
export type Activity = Readonly<z.output<typeof activitySchema>>;

const taskInputSchema = z.strictObject({
  taskId: uuid,
  organizationId: uuid,
  subjectType: z.enum(activitySubjects),
  subjectId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable(),
  assigneeIdentityId: uuid.nullable(),
  dueAt: timestamp.nullable(),
  state: z.enum(taskStates),
  revision: z.number().int().positive(),
  correlationId: uuid,
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((task, context) => {
  if (Date.parse(task.updatedAt) < Date.parse(task.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Task update cannot precede creation" });
  }
});
export type TaskInput = z.output<typeof taskInputSchema>;
export type TaskRecord = Readonly<TaskInput & { history: readonly TaskTransition[] }>;

export const taskTransitionSchema = z.strictObject({
  taskId: uuid,
  organizationId: uuid,
  fromState: z.enum(taskStates),
  toState: z.enum(taskStates),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason,
  correlationId: uuid,
}).superRefine((transition, context) => {
  if (transition.fromState === transition.toState) {
    context.addIssue({ code: "custom", path: ["toState"], message: "Task state must change" });
  }
  if ((transition.fromState === "completed" || transition.fromState === "cancelled")) {
    context.addIssue({ code: "custom", path: ["fromState"], message: "Completed and cancelled tasks are terminal" });
  }
  const allowed: Readonly<Record<TaskState, readonly TaskState[]>> = {
    open: ["in_progress", "blocked", "completed", "cancelled"],
    in_progress: ["blocked", "completed", "cancelled"],
    blocked: ["in_progress", "cancelled"],
    completed: [],
    cancelled: [],
  };
  if (!allowed[transition.fromState].includes(transition.toState)) {
    context.addIssue({ code: "custom", path: ["toState"], message: "Task state transition is not allowed" });
  }
});
export type TaskTransition = z.output<typeof taskTransitionSchema>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function parseActivity(input: unknown): Activity {
  const result = activitySchema.safeParse(input);
  if (!result.success) throw new Error("Invalid activity");
  return deepFreeze(result.data);
}

export function appendActivity(historyInput: readonly unknown[], input: unknown): readonly Activity[] {
  const history = historyInput.map(parseActivity);
  const activity = parseActivity(input);
  if (history.some((entry) => entry.activityId === activity.activityId)) throw new Error("Duplicate activity");
  if (history.some((entry) => entry.organizationId !== activity.organizationId)) throw new Error("Activity organization scope mismatch");
  return deepFreeze([...history, activity].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.activityId.localeCompare(right.activityId)));
}

export function createTask(input: unknown): TaskRecord {
  const result = taskInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid task");
  if (result.data.state !== "open" || result.data.revision !== 1) throw new Error("New tasks must start open at revision one");
  return deepFreeze({ ...result.data, history: [] });
}

export function transitionTask(record: TaskRecord, input: unknown): TaskRecord {
  const result = taskTransitionSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid task transition");
  const transition = result.data;
  if (transition.taskId !== record.taskId || transition.organizationId !== record.organizationId) throw new Error("Task transition scope does not match");
  if (transition.fromState !== record.state || transition.expectedRevision !== record.revision) throw new Error("Task transition is stale");
  return deepFreeze({ ...record, state: transition.toState, revision: record.revision + 1, updatedAt: transition.occurredAt, history: [...record.history, transition] });
}

export { taskInputSchema };
