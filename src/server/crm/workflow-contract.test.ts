import { describe, expect, test } from "vitest";

import {
  appendActivity,
  parseActivity,
  parseTaskTransition,
} from "./workflow-contract";

const organizationId = "11111111-1111-4111-8111-111111111111";
const actorIdentityId = "22222222-2222-4222-8222-222222222222";
const subjectId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";

function activity(overrides: Record<string, unknown> = {}) {
  return {
    activityId: "55555555-5555-4555-8555-555555555555",
    organizationId,
    actorIdentityId,
    subjectType: "contact",
    subjectId,
    kind: "note",
    occurredAt: "2026-08-31T12:00:00.000Z",
    correlationId,
    summary: "Reviewed account requirements",
    ...overrides,
  };
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    taskId: subjectId,
    organizationId,
    fromState: "open",
    toState: "in_progress",
    expectedRevision: 1,
    occurredAt: "2026-08-31T12:00:00.000Z",
    actorIdentityId,
    correlationId,
    ...overrides,
  };
}

describe("CRM workflow contract", () => {
  test("accepts allowlisted activity records and rejects private payload fields", () => {
    expect(parseActivity(activity())).toMatchObject({ kind: "note", organizationId });
    expect(() => parseActivity(activity({ email: "person@example.com" }))).toThrow(
      "Invalid activity record",
    );
  });

  test("appends immutable activity in deterministic order", () => {
    const first = activity();
    const second = activity({
      activityId: "66666666-6666-4666-8666-666666666666",
      occurredAt: "2026-08-31T13:00:00.000Z",
    });
    const history = appendActivity([second], first);
    expect(history.map((item) => item.activityId)).toEqual([
      first.activityId,
      second.activityId,
    ]);
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history[0])).toBe(true);
    expect(() => appendActivity(history, first)).toThrow("Duplicate activity");
  });

  test("rejects cross-organization activity history", () => {
    expect(() => appendActivity([activity({
      activityId: "77777777-7777-4777-8777-777777777777",
      organizationId: "88888888-8888-4888-8888-888888888888",
    })], activity()))
      .toThrow("Activity organization scope mismatch");
  });

  test("accepts a task transition with a positive expected revision", () => {
    expect(parseTaskTransition(transition())).toMatchObject({
      fromState: "open",
      toState: "in_progress",
      expectedRevision: 1,
    });
  });

  test("rejects no-op and terminal task transitions", () => {
    expect(() => parseTaskTransition(transition({ toState: "open" }))).toThrow(
      "Invalid task transition",
    );
    expect(() => parseTaskTransition(transition({
      fromState: "completed",
      toState: "open",
    }))).toThrow("Invalid task transition");
  });
});
