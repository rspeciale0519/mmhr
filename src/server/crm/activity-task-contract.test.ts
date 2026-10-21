import { describe, expect, test } from "vitest";

import { appendActivity, createTask, parseActivity, taskInputSchema, transitionTask } from "./activity-task-contract";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { revision: 1, correlationId: id(90), createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" };
const task = (overrides: Record<string, unknown> = {}) => ({ taskId: id(1), organizationId: id(2), subjectType: "deal", subjectId: id(3), title: "Review proposal", description: null, assigneeIdentityId: id(4), dueAt: "2026-09-02T10:00:00.000Z", state: "open", ...base, ...overrides });
const activity = (overrides: Record<string, unknown> = {}) => ({ activityId: id(10), organizationId: id(2), actorIdentityId: id(4), subjectType: "deal", subjectId: id(3), kind: "note", occurredAt: "2026-09-01T11:00:00.000Z", correlationId: id(90), summary: "Proposal reviewed", ...overrides });

describe("R2B activity and task contracts", () => {
  test("parses immutable activities and rejects unknown fields", () => {
    expect(Object.isFrozen(parseActivity(activity()))).toBe(true);
    expect(() => parseActivity({ ...activity(), unknown: true })).toThrow("Invalid activity");
  });

  test("appends unique same-organization activity in timestamp order", () => {
    const result = appendActivity([activity({ activityId: id(11), occurredAt: "2026-09-01T12:00:00.000Z" })], activity());
    expect(result.map((entry) => entry.activityId)).toEqual([id(10), id(11)]);
    expect(() => appendActivity([activity()], activity())).toThrow("Duplicate activity");
    expect(() => appendActivity([activity({ activityId: id(12), organizationId: id(99) })], activity())).toThrow("scope");
  });

  test("creates only open revision-one tasks", () => {
    const result = createTask(task());
    expect(result.state).toBe("open");
    expect(Object.isFrozen(result)).toBe(true);
    expect(taskInputSchema.safeParse(task({ state: "completed" })).success).toBe(true);
    expect(() => createTask(task({ state: "completed" }))).toThrow("start open");
  });

  test("applies scoped optimistic transitions and keeps history", () => {
    const result = transitionTask(createTask(task()), { taskId: id(1), organizationId: id(2), fromState: "open", toState: "in_progress", expectedRevision: 1, actorIdentityId: id(4), occurredAt: "2026-09-01T11:00:00.000Z", reason: "Started work", correlationId: id(90) });
    expect(result.state).toBe("in_progress");
    expect(result.revision).toBe(2);
    expect(result.history).toHaveLength(1);
    expect(Object.isFrozen(result.history)).toBe(true);
  });

  test("rejects stale and cross-organization transitions", () => {
    const initial = createTask(task());
    const transition = { taskId: id(1), organizationId: id(2), fromState: "open", toState: "completed", expectedRevision: 1, actorIdentityId: id(4), occurredAt: "2026-09-01T11:00:00.000Z", reason: "Done", correlationId: id(90) };
    expect(transitionTask(initial, transition).state).toBe("completed");
    expect(() => transitionTask(initial, { ...transition, organizationId: id(99) })).toThrow("scope");
    expect(() => transitionTask(initial, { ...transition, expectedRevision: 2 })).toThrow("stale");
  });

  test("blocks terminal task reopening and unsupported transitions", () => {
    const completed = transitionTask(createTask(task()), { taskId: id(1), organizationId: id(2), fromState: "open", toState: "completed", expectedRevision: 1, actorIdentityId: id(4), occurredAt: "2026-09-01T11:00:00.000Z", reason: "Done", correlationId: id(90) });
    expect(() => transitionTask(completed, { taskId: id(1), organizationId: id(2), fromState: "completed", toState: "open", expectedRevision: 2, actorIdentityId: id(4), occurredAt: "2026-09-01T12:00:00.000Z", reason: "Reopen", correlationId: id(90) })).toThrow("Invalid task transition");
  });
});
