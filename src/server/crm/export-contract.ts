import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const crmExportResources = [
  "customer",
  "vendor",
  "product",
  "contact",
  "deal",
  "activity",
  "task",
] as const;
export type CrmExportResource = (typeof crmExportResources)[number];

const allowedExportFields: Readonly<Record<CrmExportResource, readonly string[]>> = {
  customer: ["recordId", "status", "createdAt", "updatedAt"],
  vendor: ["recordId", "status", "createdAt", "updatedAt"],
  product: ["recordId", "status", "createdAt", "updatedAt"],
  contact: ["recordId", "status", "title"],
  deal: ["recordId", "stage", "createdAt", "updatedAt"],
  activity: ["recordId", "kind", "occurredAt"],
  task: ["recordId", "state", "dueAt"],
};

const exportRequestSchema = z
  .object({
    exportId: uuid,
    organizationId: uuid,
    requestedByIdentityId: uuid,
    resource: z.enum(crmExportResources),
    fields: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    purpose: z.string().trim().min(1).max(300),
    requestedAt: timestamp,
  })
  .strict()
  .superRefine((request, context) => {
    const allowed = new Set(allowedExportFields[request.resource]);
    const invalid = request.fields.filter((field) => !allowed.has(field));
    if (invalid.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: `Fields are not exportable for ${request.resource}`,
      });
    }
    if (new Set(request.fields).size !== request.fields.length) {
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Export fields must be unique",
      });
    }
  });

const exportDecisionSchema = z
  .object({
    decisionId: uuid,
    exportId: uuid,
    organizationId: uuid,
    reviewerIdentityId: uuid,
    decision: z.enum(["approved", "denied"]),
    decidedAt: timestamp,
    reason: z.string().trim().max(500).nullable(),
  })
  .strict();

export type CrmExportRequest = z.infer<typeof exportRequestSchema>;
export type CrmExportDecision = z.infer<typeof exportDecisionSchema>;
export type CrmExportResult = Readonly<{
  exportId: string;
  resource: CrmExportResource;
  fields: readonly string[];
  rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  audit: Readonly<{
    exportId: string;
    organizationId: string;
    requestedByIdentityId: string;
    reviewerIdentityId: string;
    decisionId: string;
    decidedAt: string;
  }>;
}>;

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

export function parseCrmExportRequest(value: unknown): CrmExportRequest {
  return parse(exportRequestSchema, value, "Invalid CRM export request");
}

export function parseCrmExportDecision(value: unknown): CrmExportDecision {
  return parse(exportDecisionSchema, value, "Invalid CRM export decision");
}

/** Builds a redacted export only after an organization-scoped approval. */
export function buildCrmExport(input: {
  request: unknown;
  decision: unknown;
  rows: readonly unknown[];
}): CrmExportResult {
  const request = parseCrmExportRequest(input.request);
  const decision = parseCrmExportDecision(input.decision);
  if (
    decision.exportId !== request.exportId
    || decision.organizationId !== request.organizationId
  ) {
    throw new Error("CRM export approval scope mismatch");
  }
  if (decision.decision !== "approved") throw new Error("CRM export was denied");

  const rows = input.rows.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid CRM export row");
    }
    const row = value as Record<string, unknown>;
    if (row.organizationId !== request.organizationId) {
      throw new Error("CRM export row organization mismatch");
    }
    if (typeof row.recordId !== "string" || !uuid.safeParse(row.recordId).success) {
      throw new Error("Invalid CRM export row");
    }
    const redacted = Object.fromEntries(
      request.fields.map((field) => [field, row[field] ?? null]),
    ) as Record<string, string | number | boolean | null>;
    return Object.freeze(redacted);
  });

  return Object.freeze({
    exportId: request.exportId,
    resource: request.resource,
    fields: Object.freeze([...request.fields]),
    rows: Object.freeze(rows),
    audit: Object.freeze({
      exportId: request.exportId,
      organizationId: request.organizationId,
      requestedByIdentityId: request.requestedByIdentityId,
      reviewerIdentityId: decision.reviewerIdentityId,
      decisionId: decision.decisionId,
      decidedAt: decision.decidedAt,
    }),
  });
}

export { allowedExportFields, exportRequestSchema, exportDecisionSchema };
