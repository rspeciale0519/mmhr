import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { projectPlanCommandSchema } from "./project-plan";
describe("R8 project-plan command", () => {
  test("accepts template approval and generation payloads", () => { const b={organizationId:randomUUID(),actorIdentityId:randomUUID(),correlationId:randomUUID(),idempotencyKey:randomUUID()}; expect(projectPlanCommandSchema.parse({...b,action:"approve_template",templateId:randomUUID()}).action).toBe("approve_template"); });
  test("rejects malformed edits", () => { expect(projectPlanCommandSchema.safeParse({action:"edit",planId:randomUUID(),milestoneId:randomUUID(),expectedRevision:0,milestones:[]}).success).toBe(false); });
});
