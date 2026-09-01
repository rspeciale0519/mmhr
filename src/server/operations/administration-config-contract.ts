import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const key = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_.-]*$/);
const value = z.union([z.string().trim().max(500), z.number().finite(), z.boolean()]);

export const administrationConfigCategories = [
  "stage", "questionnaire", "scorecard", "template", "reminder", "commission", "ai_review", "document_category", "system",
] as const;
export type AdministrationConfigCategory = (typeof administrationConfigCategories)[number];

const entrySchema = z.strictObject({ key, value });

export const administrationConfigSchema = z.strictObject({
  configurationId: uuid,
  organizationId: uuid.nullable(),
  category: z.enum(administrationConfigCategories),
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "approved", "retired"]),
  entries: z.array(entrySchema).min(1).max(200),
  createdByIdentityId: uuid,
  approvedByIdentityId: uuid.nullable(),
  approvedAt: timestamp.nullable(),
  approvalReference: z.string().trim().min(1).max(200).nullable(),
}).superRefine((configuration, context) => {
  if (new Set(configuration.entries.map((entry) => entry.key)).size !== configuration.entries.length) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Configuration keys must be unique" });
  }
  if (configuration.entries.some((entry) => /(secret|token|password|api[_.-]?key)/i.test(entry.key))) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Secrets must not be stored in administration configuration" });
  }
  const hasApproval = configuration.approvedByIdentityId !== null && configuration.approvedAt !== null && configuration.approvalReference !== null;
  if (configuration.status === "approved" && !hasApproval) context.addIssue({ code: "custom", path: ["status"], message: "Approved configuration requires approval evidence" });
  if (configuration.status === "draft" && hasApproval) context.addIssue({ code: "custom", path: ["status"], message: "Draft configuration cannot contain approval evidence" });
  if (configuration.approvedByIdentityId === configuration.createdByIdentityId && configuration.approvedByIdentityId !== null) {
    context.addIssue({ code: "custom", path: ["approvedByIdentityId"], message: "Creators cannot approve their own configuration" });
  }
});

export type AdministrationConfiguration = z.output<typeof administrationConfigSchema>;

const approvalSchema = z.strictObject({
  configurationId: uuid,
  expectedRevision: z.number().int().positive(),
  approvedByIdentityId: uuid,
  approvedAt: timestamp,
  approvalReference: z.string().trim().min(1).max(200),
});

const retirementSchema = z.strictObject({
  configurationId: uuid,
  expectedRevision: z.number().int().positive(),
  retiredAt: timestamp,
});

function parseConfiguration(valueInput: unknown): AdministrationConfiguration {
  const result = administrationConfigSchema.safeParse(valueInput);
  if (!result.success) throw new Error("Invalid administration configuration");
  return result.data;
}

/** Approves one immutable configuration version with explicit reviewer evidence. */
export function approveAdministrationConfiguration(configurationInput: unknown, approvalInput: unknown): Readonly<AdministrationConfiguration> {
  const configuration = parseConfiguration(configurationInput);
  const approval = approvalSchema.safeParse(approvalInput);
  if (!approval.success || approval.data.configurationId !== configuration.configurationId || approval.data.expectedRevision !== configuration.revision) throw new Error("Administration configuration approval is stale or invalid");
  if (configuration.status !== "draft") throw new Error("Only draft administration configuration can be approved");
  if (approval.data.approvedByIdentityId === configuration.createdByIdentityId) throw new Error("Creators cannot approve their own configuration");
  return Object.freeze({
    ...configuration,
    status: "approved" as const,
    revision: configuration.revision + 1,
    approvedByIdentityId: approval.data.approvedByIdentityId,
    approvedAt: approval.data.approvedAt,
    approvalReference: approval.data.approvalReference,
  });
}

/** Retires an approved version without deleting its history. */
export function retireAdministrationConfiguration(configurationInput: unknown, retirementInput: unknown): Readonly<AdministrationConfiguration> {
  const configuration = parseConfiguration(configurationInput);
  const retirement = retirementSchema.safeParse(retirementInput);
  if (!retirement.success || retirement.data.configurationId !== configuration.configurationId || retirement.data.expectedRevision !== configuration.revision) throw new Error("Administration configuration retirement is stale or invalid");
  if (configuration.status !== "approved") throw new Error("Only approved administration configuration can be retired");
  return Object.freeze({ ...configuration, status: "retired" as const, revision: configuration.revision + 1 });
}

export { entrySchema, key, timestamp, uuid, value };
