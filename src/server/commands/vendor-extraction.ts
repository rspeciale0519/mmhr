import "server-only";

import { z } from "zod";

import { AiService, vendorEvidenceSchema, type AiAdapter } from "@/server/ai/ai-service";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { validateVendorExtraction, vendorExtractionRequestSchema, type VendorExtractionIssue } from "@/server/vendor/extraction-contract";

const resultSchema = z.strictObject({
  runId: z.string().min(1),
  status: z.string(),
  output: vendorEvidenceSchema.nullable(),
  issues: z.array(z.strictObject({ code: z.enum(["low_confidence", "material_change"]), field: z.string(), detail: z.string() })),
  reviewRequired: z.literal(true),
});

export type VendorExtractionCommandOptions = AuthorizationOptions & { aiAdapter: AiAdapter; createRunId?: () => string; now?: () => Date };
export type VendorExtractionCommandResult = z.infer<typeof resultSchema>;

export async function runVendorExtraction(input: unknown, options: VendorExtractionCommandOptions): Promise<VendorExtractionCommandResult> {
  const parsed = vendorExtractionRequestSchema.parse(input);
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.organizationId }, options);
  if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.organizationId) throw new AuthorizationError();
  const run = await new AiService(options.aiAdapter, options.createRunId, options.now).run({
    capability: "extract_vendor_evidence",
    dataClass: "confidential",
    input: { sourceId: parsed.sourceId, content: parsed.content },
    schema: vendorEvidenceSchema,
    templateVersion: parsed.templateVersion,
    sourceReferences: parsed.sourceReferences,
    maxCostCents: parsed.maxCostCents,
  });
  const validation = run.output === undefined ? { accepted: false, reviewRequired: true as const, issues: [] as readonly VendorExtractionIssue[] } : validateVendorExtraction(run.output, parsed.previousClaims);
  const result = { runId: run.runId, status: run.status, output: run.output ?? null, issues: [...validation.issues], reviewRequired: true as const };
  return resultSchema.parse(result);
}
