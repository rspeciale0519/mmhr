import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const activityKinds = [
  "call",
  "email",
  "meeting",
  "note",
  "status_change",
  "task_completed",
] as const;

export type ActivityKind = (typeof activityKinds)[number];

const activitySchema = z
  .object({
    activityId: uuid,
    organizationId: uuid,
    actorIdentityId: uuid,
    subjectType: z.enum(["customer", "vendor", "product", "contact", "deal", "task"]),
    subjectId: uuid,
    kind: z.enum(activityKinds),
    occurredAt: timestamp,
    correlationId: uuid,
    summary: z.string().trim().min(1).max(500),
  })
  .strict();

export type ActivityRecord = z.infer<typeof activitySchema>;

export const taskStates = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
export type TaskState = (typeof taskStates)[number];

const taskTransitionSchema = z
  .object({
    taskId: uuid,
    organizationId: uuid,
    fromState: z.enum(taskStates),
    toState: z.enum(taskStates),
    expectedRevision: z.number().int().min(1),
    occurredAt: timestamp,
    actorIdentityId: uuid,
    correlationId: uuid,
  })
  .strict()
  .superRefine((transition, context) => {
    if (transition.fromState === transition.toState) {
      context.addIssue({
        code: "custom",
        path: ["toState"],
        message: "Task state must change",
      });
    }

    if (
      (transition.fromState === "completed" || transition.fromState === "cancelled")
      && transition.toState !== transition.fromState
    ) {
      context.addIssue({
        code: "custom",
        path: ["fromState"],
        message: "Completed and cancelled tasks are terminal",
      });
    }
  });

export type TaskTransition = z.infer<typeof taskTransitionSchema>;

export function parseActivity(value: unknown): ActivityRecord {
  const result = activitySchema.safeParse(value);
  if (!result.success) throw new Error("Invalid activity record");
  return Object.freeze(result.data);
}

export function parseTaskTransition(value: unknown): TaskTransition {
  const result = taskTransitionSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid task transition");
  return result.data;
}

/**
 * Appends one immutable activity after checking organization scope and ID
 * uniqueness. The returned array is a new value and cannot mutate history.
 */
export function appendActivity(
  history: readonly unknown[],
  next: unknown,
): readonly ActivityRecord[] {
  const parsed = history.map(parseActivity);
  const activity = parseActivity(next);
  if (parsed.some((item) => item.activityId === activity.activityId)) {
    throw new Error(`Duplicate activity: ${activity.activityId}`);
  }
  if (parsed.some((item) => item.organizationId !== activity.organizationId)) {
    throw new Error("Activity organization scope mismatch");
  }
  const ordered = [...parsed, activity].sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
      || left.activityId.localeCompare(right.activityId),
  );
  return Object.freeze(ordered);
}

export { activitySchema, taskTransitionSchema };
