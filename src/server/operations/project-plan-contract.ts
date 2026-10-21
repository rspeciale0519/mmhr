import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const role = z.enum(["operations", "support", "advisor", "sales", "finance"]);

export const projectPlanTemplateSchema = z
  .strictObject({
    templateId: uuid,
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    approved: z.boolean(),
    approvedByIdentityId: uuid.nullable(),
    approvedAt: timestamp.nullable(),
    milestones: z.array(z.strictObject({
      milestoneKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/),
      title: z.string().trim().min(1).max(300),
      offsetDaysBeforeGoLive: z.number().int().nonnegative().max(3_650),
      ownerRole: role,
    })).min(1).max(200),
  })
  .superRefine((template, context) => {
    if (new Set(template.milestones.map((milestone) => milestone.milestoneKey)).size !== template.milestones.length) {
      context.addIssue({ code: "custom", path: ["milestones"], message: "Template milestone keys must be unique" });
    }
    if (template.approved !== (template.approvedByIdentityId !== null && template.approvedAt !== null)) {
      context.addIssue({ code: "custom", path: ["approved"], message: "Approval requires reviewer and timestamp" });
    }
  });

export type ProjectPlanTemplate = z.infer<typeof projectPlanTemplateSchema>;

const projectPlanMilestoneSchema = z.strictObject({
  milestoneId: uuid,
  milestoneKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  ownerRole: role,
  dueAt: timestamp,
  status: z.enum(["pending", "in_progress", "completed", "blocked", "skipped"]),
  completedAt: timestamp.nullable(),
});

export const projectPlanSchema = z
  .strictObject({
    planId: uuid,
    organizationId: uuid,
    dealId: uuid,
    templateId: uuid,
    templateVersion: z.number().int().positive(),
    targetGoLiveAt: timestamp,
    revision: z.number().int().positive(),
    milestones: z.array(projectPlanMilestoneSchema).min(1).max(200),
  })
  .superRefine((plan, context) => {
    if (new Set(plan.milestones.map((milestone) => milestone.milestoneId)).size !== plan.milestones.length) {
      context.addIssue({ code: "custom", path: ["milestones"], message: "Plan milestone identifiers must be unique" });
    }
    if (plan.milestones.some((milestone) => Date.parse(milestone.dueAt) > Date.parse(plan.targetGoLiveAt))) {
      context.addIssue({ code: "custom", path: ["milestones"], message: "Milestones cannot be due after go-live" });
    }
  });

export type ProjectPlan = Readonly<Omit<z.infer<typeof projectPlanSchema>, "milestones"> & {
  milestones: readonly z.infer<typeof projectPlanMilestoneSchema>[];
}>;

export const projectPlanEditSchema = z.strictObject({
  planId: uuid,
  milestoneId: uuid,
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(300).optional(),
  dueAt: timestamp.optional(),
  actorIdentityId: uuid,
  correlationId: uuid,
});

export function generateProjectPlan(input: {
  planId: string;
  organizationId: string;
  dealId: string;
  targetGoLiveAt: string;
  template: unknown;
}): Readonly<ProjectPlan> {
  const template = projectPlanTemplateSchema.safeParse(input.template);
  const identifiers = z.strictObject({ planId: uuid, organizationId: uuid, dealId: uuid, targetGoLiveAt: timestamp }).safeParse({
    planId: input.planId,
    organizationId: input.organizationId,
    dealId: input.dealId,
    targetGoLiveAt: input.targetGoLiveAt,
  });
  if (!template.success || !identifiers.success || !template.data.approved) throw new Error("Only approved project-plan templates can be generated");
  const goLiveMs = Date.parse(identifiers.data.targetGoLiveAt);
  const milestones = template.data.milestones.map((milestone, index) => ({
    milestoneId: `${identifiers.data.planId.slice(0, -3)}${String(index + 1).padStart(3, "0")}`,
    milestoneKey: milestone.milestoneKey,
    title: milestone.title,
    ownerRole: milestone.ownerRole,
    dueAt: new Date(goLiveMs - milestone.offsetDaysBeforeGoLive * 86_400_000).toISOString(),
    status: "pending" as const,
    completedAt: null,
  }));
  const result = projectPlanSchema.safeParse({
    ...identifiers.data,
    templateId: template.data.templateId,
    templateVersion: template.data.version,
    revision: 1,
    milestones,
  });
  if (!result.success) throw new Error("Generated project plan is invalid");
  return Object.freeze({ ...result.data, milestones: Object.freeze(result.data.milestones.map((milestone) => Object.freeze(milestone))) });
}

export function editProjectPlan(planInput: unknown, editInput: unknown): Readonly<ProjectPlan> {
  const plan = projectPlanSchema.safeParse(planInput);
  const edit = projectPlanEditSchema.safeParse(editInput);
  if (!plan.success || !edit.success || edit.data.planId !== plan.data.planId || edit.data.expectedRevision !== plan.data.revision) throw new Error("Project-plan edit is stale or invalid");
  const index = plan.data.milestones.findIndex((milestone) => milestone.milestoneId === edit.data.milestoneId);
  if (index < 0) throw new Error("Project-plan milestone was not found");
  if (plan.data.milestones[index]?.status === "completed") throw new Error("Completed milestones cannot be edited");
  const milestones = plan.data.milestones.map((milestone, itemIndex) => itemIndex === index
    ? { ...milestone, ...(edit.data.title === undefined ? {} : { title: edit.data.title }), ...(edit.data.dueAt === undefined ? {} : { dueAt: edit.data.dueAt }) }
    : milestone);
  const result = projectPlanSchema.safeParse({ ...plan.data, revision: plan.data.revision + 1, milestones });
  if (!result.success) throw new Error("Project-plan edit is invalid");
  return Object.freeze({ ...result.data, milestones: Object.freeze(result.data.milestones.map((milestone) => Object.freeze(milestone))) });
}

export { projectPlanMilestoneSchema };
