import "server-only";

import { z } from "zod";

import { vendorEvidenceSchema, type VendorEvidence } from "@/server/ai/ai-service";

export const vendorExtractionRequestSchema = z.strictObject({
  organizationId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceReferences: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  content: z.string().trim().min(1).max(100_000),
  schemaVersion: z.string().trim().min(1).max(100),
  templateVersion: z.string().trim().min(1).max(100),
  maxCostCents: z.number().int().min(0).max(100_000),
  previousClaims: z.array(z.strictObject({
    field: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(2_000),
  })).max(100).optional(),
});

export type VendorExtractionRequest = z.infer<typeof vendorExtractionRequestSchema>;

export const vendorExtractionIssueSchema = z.strictObject({
  code: z.enum(["low_confidence", "material_change"]),
  field: z.string().trim().min(1).max(100),
  detail: z.string().trim().min(1).max(500),
});

export type VendorExtractionIssue = z.infer<typeof vendorExtractionIssueSchema>;

export type VendorExtractionValidation = Readonly<{
  accepted: boolean;
  reviewRequired: true;
  issues: readonly VendorExtractionIssue[];
}>;

const highImpactFields = new Set(["pricing", "pricing_model", "implementation_timeline", "security", "compliance", "geography"]);

export function validateVendorExtraction(output: VendorEvidence, previousClaims: VendorExtractionRequest["previousClaims"] = []): VendorExtractionValidation {
  const previous = new Map((previousClaims ?? []).map((claim) => [claim.field, claim.value]));
  const issues: VendorExtractionIssue[] = [];
  for (const claim of output.claims) {
    if (claim.confidence < 0.75) issues.push({ code: "low_confidence", field: claim.field, detail: "Confidence is below the review threshold" });
    if (highImpactFields.has(claim.field) && previous.get(claim.field) !== undefined && previous.get(claim.field) !== claim.value) {
      issues.push({ code: "material_change", field: claim.field, detail: "High-impact value changed from the prior approved claim" });
    }
  }
  return Object.freeze({ accepted: issues.length === 0, reviewRequired: true, issues: Object.freeze(issues) });
}

export { vendorEvidenceSchema };
