import { describe, expect, test } from "vitest";

import {
  addIntakeRequirement,
  canTransitionIntake,
  createIntake,
  intakeInputSchema,
  transitionIntake,
} from "./intake-contract";

const ids = {
  intake: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  owner: "33333333-3333-4333-8333-333333333333",
  requirement: "44444444-4444-4444-8444-444444444444",
  actor: "55555555-5555-4555-8555-555555555555",
  correlation: "66666666-6666-4666-8666-666666666666",
};
const input = {
  intakeId: ids.intake,
  organizationId: ids.organization,
  ownerIdentityId: ids.owner,
  companyContext: { size: "mid-market" },
  currentSystems: ["Legacy HRIS"],
  complianceNeeds: ["SOC 2"],
  budget: { currency: "USD" },
  timeline: { target: "Q4" },
  stakeholders: ["Finance"],
  decisionProcess: { approvers: "CFO" },
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  revision: 1,
  correlationId: ids.correlation,
};
const requirement = {
  requirementId: ids.requirement,
  intakeId: ids.intake,
  organizationId: ids.organization,
  stableKey: "payroll",
  label: "Payroll processing",
  importance: "must" as const,
  weight: 10,
  ownerIdentityId: ids.owner,
  response: null,
  status: "active" as const,
  revision: 1,
  correlationId: ids.correlation,
};
const transition = (fromStatus: "draft" | "in_progress" | "submitted" | "under_review", toStatus: "in_progress" | "submitted" | "under_review" | "completed" | "archived", expectedRevision: number) => ({
  intakeId: ids.intake,
  fromStatus,
  toStatus,
  expectedRevision,
  actorIdentityId: ids.actor,
  occurredAt: "2026-09-01T11:00:00.000Z",
  correlationId: ids.correlation,
});

describe("R3 intake contract", () => {
  test("creates a normalized immutable draft", () => {
    const record = createIntake({ ...input, intakeId: input.intakeId.toUpperCase(), companyContext: undefined });
    expect(record).toMatchObject({ status: "draft", submittedAt: null, requirements: [], revision: 1 });
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.companyContext).toEqual({});
  });

  test("rejects unsupported fields, invalid dates, and malformed values", () => {
    expect(intakeInputSchema.safeParse({ ...input, extra: true }).success).toBe(false);
    expect(() => createIntake({ ...input, updatedAt: "2026-08-01T00:00:00.000Z" })).toThrow("precede");
    expect(() => createIntake({ ...input, companyContext: { size: [] } })).toThrow("Invalid intake");
  });

  test("adds scoped unique requirements and protects the snapshot", () => {
    const record = addIntakeRequirement(createIntake(input), requirement);
    expect(record.requirements).toHaveLength(1);
    expect(() => addIntakeRequirement(record, requirement)).toThrow("Duplicate");
    expect(() => addIntakeRequirement(record, { ...requirement, organizationId: ids.owner })).toThrow("scope");
    expect(() => (record.requirements as unknown as Array<unknown>).push(requirement)).toThrow();
  });

  test("requires an applicable requirement before submission", () => {
    const draft = createIntake(input);
    expect(() => transitionIntake(draft, transition("draft", "submitted", 1))).toThrow("applicable requirement");
    const ready = addIntakeRequirement(draft, requirement);
    const submitted = transitionIntake(ready, transition("draft", "submitted", 1));
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toBe("2026-09-01T11:00:00.000Z");
    expect(submitted.revision).toBe(2);
  });

  test("rejects stale, skipped, and terminal transitions", () => {
    const draft = createIntake(input);
    expect(() => transitionIntake(draft, transition("in_progress", "submitted", 1))).toThrow("stale");
    expect(() => transitionIntake(draft, transition("draft", "under_review", 1) as never)).toThrow("not allowed");
    const submitted = transitionIntake(addIntakeRequirement(draft, requirement), transition("draft", "submitted", 1));
    expect(() => transitionIntake(submitted, transition("submitted", "under_review", 1))).toThrow("stale");
    const reviewed = transitionIntake(submitted, transition("submitted", "under_review", 2));
    const completed = transitionIntake(reviewed, transition("under_review", "completed", 3));
    expect(() => transitionIntake(completed, transition("under_review", "completed", 4))).toThrow("stale");
  });

  test("exposes the approved state graph", () => {
    expect(canTransitionIntake("draft", "in_progress")).toBe(true);
    expect(canTransitionIntake("under_review", "in_progress")).toBe(true);
    expect(canTransitionIntake("completed", "draft")).toBe(false);
    expect(canTransitionIntake("archived", "in_progress")).toBe(false);
  });

  test("allows draft-to-in-progress without submission", () => {
    const next = transitionIntake(createIntake(input), transition("draft", "in_progress", 1));
    expect(next.status).toBe("in_progress");
    expect(next.submittedAt).toBeNull();
    expect(next.transitions).toHaveLength(1);
  });

  test("does not allow requirements after submission", () => {
    const submitted = transitionIntake(addIntakeRequirement(createIntake(input), requirement), transition("draft", "submitted", 1));
    expect(() => addIntakeRequirement(submitted, { ...requirement, requirementId: ids.actor, stableKey: "benefits" })).toThrow("after submission");
  });

  test("archives an intake without changing submittedAt history", () => {
    const draft = createIntake(input);
    const archived = transitionIntake(draft, { ...transition("draft", "archived", 1) });
    expect(archived.status).toBe("archived");
    expect(archived.submittedAt).toBeNull();
    expect(archived.transitions).toHaveLength(1);
  });
});
