import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const key = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
const amount = z.number().finite().min(0).max(1_000_000_000);
const range = z.strictObject({ minimum: amount, maximum: amount })
  .refine((value) => value.minimum <= value.maximum, "Estimate range is reversed");

// Customer evidence uses controlled values. Raw URLs, product names, notes,
// document identifiers, and vendor-written text belong to the staff record.
export const maskedEvidenceSchema = z.strictObject({
  basis: z.enum(["evidence", "override"]),
  capturedAt: timestamp,
  reviewedAt: timestamp,
  validUntil: timestamp,
  version: z.number().int().positive().nullable(),
}).refine((value) => Date.parse(value.capturedAt) <= Date.parse(value.reviewedAt)
  && Date.parse(value.reviewedAt) < Date.parse(value.validUntil), "Evidence dates are inconsistent");

export const featureCoverageSchema = z.enum(["native", "add_on", "partner", "limited", "not_supported", "unknown"]);
export const comparisonModuleSchema = z.enum([
  "hr", "payroll", "time", "benefits", "recruiting", "performance", "learning", "expenses", "compensation", "analytics",
]);
const modules = z.array(comparisonModuleSchema).min(1).max(10)
  .refine((value) => new Set(value).size === value.length, "Modules must be unique");
const assumption = z.enum([
  "standard_configuration", "customer_data_ready", "single_entity", "multiple_entities",
  "annual_billing", "monthly_billing", "remote_training", "standard_integrations", "custom_integration_required",
]);
const assumptions = z.array(assumption).min(1).max(9)
  .refine((value) => new Set(value).size === value.length, "Assumptions must be unique");
const exclusions = z.array(z.enum(["taxes", "implementation", "migration", "training", "third_party_fees", "optional_modules"]))
  .max(6).refine((value) => new Set(value).size === value.length, "Exclusions must be unique");

export const publishedFeatureDetailSchema = z.strictObject({
  requirementKey: key,
  outcome: z.enum(["match", "mismatch", "unknown"]),
  coverage: featureCoverageSchema,
  evidence: maskedEvidenceSchema.nullable(),
  coverageEvidence: maskedEvidenceSchema.nullable(),
}).superRefine((value, context) => {
  if (value.outcome !== "unknown" && !value.evidence) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "Known features require approved evidence" });
  }
  if (value.coverage !== "unknown" && !value.coverageEvidence) {
    context.addIssue({ code: "custom", path: ["coverageEvidence"], message: "Known delivery types require approved evidence" });
  }
});

export const annualCostEstimateSchema = z.strictObject({
  recurring: range,
  currency: z.enum(["USD", "CAD", "GBP", "EUR", "AUD"]),
  employeeCount: z.number().int().min(1).max(10_000_000),
  includedModules: modules,
  assumptions,
  exclusions,
  oneTime: range.nullable(),
  evidence: maskedEvidenceSchema,
});

export const setupEstimateSchema = z.strictObject({
  duration: range,
  unit: z.enum(["days", "weeks", "months"]),
  scope: z.enum(["initial_implementation", "payroll_migration", "module_addition"]),
  includedModules: modules,
  assumptions,
  evidence: maskedEvidenceSchema,
});

export const maskedPublicationDetailsSchema = z.strictObject({
  version: z.literal(1),
  features: z.array(publishedFeatureDetailSchema).max(2_000),
  annualCost: annualCostEstimateSchema.nullable(),
  setup: setupEstimateSchema.nullable(),
}).refine((value) => new Set(value.features.map((feature) => feature.requirementKey)).size === value.features.length,
  "Feature requirements must be unique");

export type MaskedEvidence = z.output<typeof maskedEvidenceSchema>;
export type PublishedFeatureDetail = z.output<typeof publishedFeatureDetailSchema>;
export type AnnualCostEstimate = z.output<typeof annualCostEstimateSchema>;
export type SetupEstimate = z.output<typeof setupEstimateSchema>;
export type MaskedPublicationDetails = z.output<typeof maskedPublicationDetailsSchema>;
