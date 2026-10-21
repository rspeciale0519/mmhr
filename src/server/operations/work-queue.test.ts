import { describe, expect, test } from "vitest";

import { parseWorkItem, projectWorkQueues, summarizeOperations } from "./work-queue";

const orgId = "00000000-0000-4000-8000-000000000001";
const advisorId = "00000000-0000-4000-8000-000000000101";

function item(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "00000000-0000-4000-8000-000000000011",
    organizationId: orgId,
    queue: "follow_ups",
    assignedRole: "advisor",
    assigneeIdentityId: advisorId,
    status: "open",
    priority: "normal",
    dueAt: "2026-08-31T11:00:00.000Z",
    reminderAt: "2026-08-31T10:00:00.000Z",
    escalated: false,
    createdAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("work queue contract", () => {
  test("accepts safe operational fields and rejects free text or unknown fields", () => {
    expect(parseWorkItem(item())).toMatchObject({ queue: "follow_ups", assignedRole: "advisor" });
    expect(() => parseWorkItem(item({ customerEmail: "person@example.com" }))).toThrow("Invalid work item");
    expect(() => parseWorkItem(item({ blockerNotes: "waiting for customer" }))).toThrow("Invalid work item");
  });

  test("rejects invalid reminder order and escalated closed work", () => {
    expect(() => parseWorkItem(item({ reminderAt: "2026-08-31T12:00:00.000Z", createdAt: "2026-08-31T13:00:00.000Z" }))).toThrow(
      "Invalid work item",
    );
    expect(() => parseWorkItem(item({ status: "completed", escalated: true }))).toThrow("Invalid work item");
  });

  test("filters by role, omits closed work, and derives overdue items", () => {
    const report = projectWorkQueues(
      [
        item({ priority: "high", escalated: true }),
        item({ taskId: "00000000-0000-4000-8000-000000000012", assignedRole: "finance", queue: "commissions" }),
        item({ taskId: "00000000-0000-4000-8000-000000000013", status: "completed" }),
      ],
      "2026-08-31T12:00:00.000Z",
      "advisor",
    );

    expect(report.visibleItemCount).toBe(1);
    expect(report.byQueue.follow_ups.map((entry) => entry.taskId)).toEqual([
      "00000000-0000-4000-8000-000000000011",
    ]);
    expect(report.byQueue.overdue.map((entry) => entry.taskId)).toEqual([
      "00000000-0000-4000-8000-000000000011",
    ]);
    expect(report.byQueue.commissions).toEqual([]);
  });

  test("super administrators see all open queues in stable urgency order", () => {
    const report = projectWorkQueues(
      [
        item({ taskId: "00000000-0000-4000-8000-000000000014", assignedRole: "finance", queue: "commissions", priority: "normal", dueAt: "2026-09-01T10:00:00.000Z" }),
        item({ taskId: "00000000-0000-4000-8000-000000000015", assignedRole: "operations", queue: "onboarding_risks", priority: "urgent", dueAt: "2026-09-01T10:00:00.000Z" }),
      ],
      "2026-08-31T12:00:00.000Z",
      "super_admin",
    );

    expect(report.visibleItemCount).toBe(2);
    expect(report.byQueue.commissions[0]?.assignedRole).toBe("finance");
    expect(report.byQueue.onboarding_risks[0]?.priority).toBe("urgent");
    expect(report.byQueue.overdue).toEqual([]);
  });

  test("rejects duplicate task identifiers and invalid as-of timestamps", () => {
    expect(() => projectWorkQueues([item(), item()], "2026-08-31T12:00:00.000Z", "advisor")).toThrow(
      "Duplicate work item",
    );
    expect(() => projectWorkQueues([], "not-a-date", "advisor")).toThrow("Invalid work queue as-of timestamp");
  });

  test("summarizes open, overdue, and escalated work from the role-scoped projection", () => {
    const report = summarizeOperations([
      item({ taskId: "00000000-0000-4000-8000-000000000016", escalated: true }),
      item({ taskId: "00000000-0000-4000-8000-000000000017", dueAt: "2026-09-01T12:00:00.000Z" }),
      item({ taskId: "00000000-0000-4000-8000-000000000018", assignedRole: "finance", queue: "commissions" }),
    ], "2026-08-31T12:00:00.000Z", "advisor");
    expect(report).toMatchObject({ totalOpen: 2, overdueCount: 1, escalatedCount: 1, byQueue: { follow_ups: { open: 2, overdue: 1, escalated: 1 }, commissions: { open: 0 } } });
    expect(Object.isFrozen(report)).toBe(true);
  });

  test("keeps the operations report deny-first for invalid input", () => {
    expect(() => summarizeOperations([item({ blockerNotes: "private" })], "2026-08-31T12:00:00.000Z", "advisor")).toThrow("Invalid work item");
  });
});
