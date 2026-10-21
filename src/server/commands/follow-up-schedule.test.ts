import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { followUpScheduleCommandSchema } from "./follow-up-schedule";

const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), scheduleId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("R8 follow-up schedule command", () => {
  test("accepts each supported subject type", () => {
    for (const subjectType of ["vendor", "customer", "product", "risk"] as const) {
      const parsed = followUpScheduleCommandSchema.parse({ ...base, action: "create", subjectType, subjectId: randomUUID(), intervalDays: 30, firstCheckInAt: "2026-09-03T00:00:00Z", nextCheckInAt: "2026-10-03T00:00:00Z" });
      if (parsed.action !== "create") throw new Error("Expected create command");
      expect(parsed.subjectType).toBe(subjectType);
    }
  });
  test("rejects invalid cadence and check-in order", () => {
    expect(followUpScheduleCommandSchema.safeParse({ ...base, action: "create", subjectType: "risk", subjectId: randomUUID(), intervalDays: 0, firstCheckInAt: "2026-09-03T00:00:00Z", nextCheckInAt: "2026-09-02T00:00:00Z" }).success).toBe(false);
  });
  test("requires a revision for state changes", () => {
    expect(followUpScheduleCommandSchema.safeParse({ ...base, action: "pause" }).success).toBe(false);
  });
});
