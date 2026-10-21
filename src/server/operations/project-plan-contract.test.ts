import { describe, expect, test } from "vitest";

import { editProjectPlan, generateProjectPlan, projectPlanTemplateSchema } from "./project-plan-contract";

const planId = "00000000-0000-4000-8000-000000000301";
const organizationId = "00000000-0000-4000-8000-000000000302";
const dealId = "00000000-0000-4000-8000-000000000303";
const templateId = "00000000-0000-4000-8000-000000000304";
const actorId = "00000000-0000-4000-8000-000000000305";
const correlationId = "00000000-0000-4000-8000-000000000306";

function template(overrides: Record<string, unknown> = {}) {
  return {
    templateId,
    version: 2,
    name: "Standard go-live",
    approved: true,
    approvedByIdentityId: actorId,
    approvedAt: "2026-08-01T00:00:00.000Z",
    milestones: [{ milestoneKey: "configure", title: "Configure workspace", offsetDaysBeforeGoLive: 30, ownerRole: "operations" }],
    ...overrides,
  };
}

test("requires complete template approval metadata", () => {
  expect(projectPlanTemplateSchema.safeParse(template()).success).toBe(true);
  expect(projectPlanTemplateSchema.safeParse(template({ approved: false, approvedByIdentityId: actorId })).success).toBe(false);
});
describe("R8 project-plan contract", () => {
  test("generates milestones from an approved template", () => {
    const plan = generateProjectPlan({ planId, organizationId, dealId, targetGoLiveAt: "2026-12-01T00:00:00.000Z", template: template() });
    expect(plan).toMatchObject({ planId, templateVersion: 2, revision: 1 });
    expect(plan.milestones[0]).toMatchObject({ milestoneKey: "configure", dueAt: "2026-11-01T00:00:00.000Z", status: "pending" });
    expect(Object.isFrozen(plan)).toBe(true);
  });

  test("does not generate from an unapproved template", () => {
    expect(() => generateProjectPlan({ planId, organizationId, dealId, targetGoLiveAt: "2026-12-01T00:00:00.000Z", template: template({ approved: false, approvedByIdentityId: null, approvedAt: null }) })).toThrow("approved");
  });

  test("edits an unfinished milestone with an optimistic revision", () => {
    const plan = generateProjectPlan({ planId, organizationId, dealId, targetGoLiveAt: "2026-12-01T00:00:00.000Z", template: template() });
    const edited = editProjectPlan(plan, { planId, milestoneId: plan.milestones[0]?.milestoneId, expectedRevision: 1, title: "Configure and validate workspace", actorIdentityId: actorId, correlationId });
    expect(edited).toMatchObject({ revision: 2, milestones: [{ title: "Configure and validate workspace" }] });
  });

  test("rejects stale, completed, and after-go-live edits", () => {
    const plan = generateProjectPlan({ planId, organizationId, dealId, targetGoLiveAt: "2026-12-01T00:00:00.000Z", template: template() });
    expect(() => editProjectPlan(plan, { planId, milestoneId: plan.milestones[0]?.milestoneId, expectedRevision: 2, actorIdentityId: actorId, correlationId })).toThrow("stale");
    expect(() => editProjectPlan(plan, { planId, milestoneId: plan.milestones[0]?.milestoneId, expectedRevision: 1, dueAt: "2027-01-01T00:00:00.000Z", actorIdentityId: actorId, correlationId })).toThrow("invalid");
    const completed = { ...plan, milestones: [{ ...plan.milestones[0], status: "completed", completedAt: "2026-11-01T00:00:00.000Z" as const }] };
    expect(() => editProjectPlan(completed, { planId, milestoneId: plan.milestones[0]?.milestoneId, expectedRevision: 1, title: "No change", actorIdentityId: actorId, correlationId })).toThrow("Completed");
  });
});
