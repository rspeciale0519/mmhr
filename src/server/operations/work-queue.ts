import "server-only";

import { z } from "zod";

/** Queue families used by internal operations. Overdue is a derived view. */
export const workQueueKinds = [
  "approvals",
  "follow_ups",
  "scheduling",
  "commissions",
  "onboarding_risks",
  "overdue",
] as const;

export type WorkQueueKind = (typeof workQueueKinds)[number];

const sourceQueueKinds = [
  "approvals",
  "follow_ups",
  "scheduling",
  "commissions",
  "onboarding_risks",
] as const;

export const workItemRoles = [
  "super_admin",
  "admin",
  "advisor",
  "sales",
  "finance",
  "operations",
  "support",
] as const;

export type WorkItemRole = (typeof workItemRoles)[number];

export const workItemStatuses = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
export type WorkItemStatus = (typeof workItemStatuses)[number];

export const workItemPriorities = ["low", "normal", "high", "urgent"] as const;
export type WorkItemPriority = (typeof workItemPriorities)[number];

const workItemSchema = z
  .object({
    taskId: z.string().uuid(),
    organizationId: z.string().uuid(),
    queue: z.enum(sourceQueueKinds),
    assignedRole: z.enum(workItemRoles),
    assigneeIdentityId: z.string().uuid().optional(),
    status: z.enum(workItemStatuses),
    priority: z.enum(workItemPriorities),
    dueAt: z.string().datetime({ offset: true }).optional(),
    reminderAt: z.string().datetime({ offset: true }).optional(),
    escalated: z.boolean().default(false),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.reminderAt && Date.parse(item.reminderAt) < Date.parse(item.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["reminderAt"],
        message: "reminderAt cannot be before createdAt",
      });
    }
    if (item.status === "completed" || item.status === "cancelled") {
      if (item.escalated) {
        context.addIssue({
          code: "custom",
          path: ["escalated"],
          message: "closed work cannot remain escalated",
        });
      }
    }
  });

export type WorkItem = z.infer<typeof workItemSchema>;

export type WorkQueueReport = Readonly<{
  asOf: string;
  visibleItemCount: number;
  byQueue: Readonly<Record<WorkQueueKind, readonly WorkItem[]>>;
}>;

export type OperationsReport = Readonly<{
  asOf: string;
  totalOpen: number;
  overdueCount: number;
  escalatedCount: number;
  byQueue: Readonly<Record<(typeof sourceQueueKinds)[number], Readonly<{ open: number; overdue: number; escalated: number }>>>;
}>;

function parseAsOf(value: string | Date): string {
  const asOf = value instanceof Date ? value.toISOString() : value;
  if (!z.string().datetime({ offset: true }).safeParse(asOf).success) {
    throw new Error("Invalid work queue as-of timestamp");
  }
  return asOf;
}

function priorityRank(priority: WorkItemPriority): number {
  return workItemPriorities.indexOf(priority);
}

function sortItems(left: WorkItem, right: WorkItem): number {
  if (left.escalated !== right.escalated) return left.escalated ? -1 : 1;
  if (priorityRank(left.priority) !== priorityRank(right.priority)) {
    return priorityRank(right.priority) - priorityRank(left.priority);
  }
  const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
  return leftDue - rightDue || left.taskId.localeCompare(right.taskId);
}

function emptyQueues(): Record<WorkQueueKind, WorkItem[]> {
  return {
    approvals: [],
    follow_ups: [],
    scheduling: [],
    commissions: [],
    onboarding_risks: [],
    overdue: [],
  };
}

/** Parses one internal work item and rejects free text or unknown fields. */
export function parseWorkItem(value: unknown): WorkItem {
  const result = workItemSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid work item");
  return result.data;
}

/** Builds role-scoped operational queues from immutable task snapshots. */
export function projectWorkQueues(
  items: readonly unknown[],
  asOfInput: string | Date,
  viewerRole: WorkItemRole,
): WorkQueueReport {
  const asOf = parseAsOf(asOfInput);
  const asOfMs = Date.parse(asOf);
  const parsed = items.map(parseWorkItem);
  const seen = new Set<string>();
  const queues = emptyQueues();

  for (const item of parsed) {
    if (seen.has(item.taskId)) throw new Error(`Duplicate work item: ${item.taskId}`);
    seen.add(item.taskId);
    if (item.status === "completed" || item.status === "cancelled") continue;
    if (viewerRole !== "super_admin" && item.assignedRole !== viewerRole) continue;
    if (item.dueAt && Date.parse(item.dueAt) > asOfMs) {
      // A future task is valid, but it is not overdue yet.
    }
    queues[item.queue].push(item);
    if (item.dueAt && Date.parse(item.dueAt) < asOfMs) queues.overdue.push(item);
  }

  for (const queue of workQueueKinds) queues[queue].sort(sortItems);
  return {
    asOf,
    visibleItemCount: new Set(Object.values(queues).flat().map((item) => item.taskId)).size,
    byQueue: queues,
  };
}

/** Summarizes the same role-scoped queue projection without trusting mutable counters. */
export function summarizeOperations(
  items: readonly unknown[],
  asOfInput: string | Date,
  viewerRole: WorkItemRole,
): OperationsReport {
  const report = projectWorkQueues(items, asOfInput, viewerRole);
  const overdueIds = new Set(report.byQueue.overdue.map((item) => item.taskId));
  const byQueue = Object.fromEntries(sourceQueueKinds.map((queue) => {
    const entries = report.byQueue[queue];
    return [queue, Object.freeze({
      open: entries.length,
      overdue: entries.filter((entry) => overdueIds.has(entry.taskId)).length,
      escalated: entries.filter((entry) => entry.escalated).length,
    })];
  })) as OperationsReport["byQueue"];
  const openItems = sourceQueueKinds.flatMap((queue) => report.byQueue[queue]);
  return Object.freeze({
    asOf: report.asOf,
    totalOpen: openItems.length,
    overdueCount: overdueIds.size,
    escalatedCount: openItems.filter((item) => item.escalated).length,
    byQueue: Object.freeze(byQueue),
  });
}

export { workItemSchema };
