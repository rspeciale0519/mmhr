import { z } from "zod";

import { requirementResponseSchema } from "@/server/matching/requirement-input";

const uuidSchema = z.uuid().transform((value) => value.toLowerCase());
const timestampSchema = z.iso.datetime({ offset: true });
const stableKeySchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/);

const criterionSchema = z.strictObject({
  requirementKey: stableKeySchema,
  factKey: stableKeySchema.refine(
    (value) => !/^(commission|payout|referral|payment_status)/.test(value),
    "Commercial fields cannot affect organic ranking",
  ),
  responsePath: z.array(z.string().min(1).max(100)).max(5),
});

export const publicationConfigSchema = z.strictObject({
  version: z.literal(1),
  criteria: z.array(criterionSchema).min(1).max(2_000),
}).superRefine((config, context) => {
  const seen = new Set<string>();
  config.criteria.forEach((criterion, index) => {
    if (seen.has(criterion.requirementKey)) {
      context.addIssue({ code: "custom", path: ["criteria", index, "requirementKey"], message: "Requirement keys must be unique" });
    }
    seen.add(criterion.requirementKey);
  });
});

const publicationRequirementSchema = z.strictObject({
  requirementId: uuidSchema,
  revision: z.number().int().positive(),
  key: stableKeySchema,
  label: z.string().trim().min(1).max(200),
  importance: z.enum(["must", "nice"]),
  weight: z.number().int().min(1).max(100),
  response: requirementResponseSchema,
});

export const approvedVendorInputSchema = z.strictObject({
  fact_id: uuidSchema,
  field_key: stableKeySchema,
  value: z.string().min(1).max(2_000),
  provenance: z.enum(["evidence", "override"]),
  evidence_id: uuidSchema.nullable(),
  source_id: uuidSchema.nullable(),
  review_id: uuidSchema.nullable(),
  evidence_version: z.number().int().positive().nullable(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  observed_at: timestampSchema,
  captured_at: timestampSchema,
  valid_until: timestampSchema,
  override_id: uuidSchema.nullable(),
  approved_at: timestampSchema,
});

export const maskedOptionSchema = z.strictObject({
  optionId: uuidSchema,
  ordinal: z.number().int().min(1),
  maskedLabel: z.string().regex(/^Option [1-9][0-9]*$/),
  eligibility: z.enum(["eligible", "ineligible", "unknown"]),
  deterministicScore: z.number().int().min(0).max(10_000),
  confidenceBasisPoints: z.number().int().min(0).max(10_000),
  fitReasons: z.array(z.string().min(1).max(200)).max(2_000),
  limitations: z.array(z.string().min(1).max(200)).max(2_000),
  evidenceFreshAt: timestampSchema.nullable(),
  validUntil: timestampSchema.nullable(),
}).superRefine((option, context) => {
  if (option.maskedLabel !== `Option ${option.ordinal}`) {
    context.addIssue({ code: "custom", path: ["maskedLabel"], message: "Masked label must match the option ordinal" });
  }
});

export const publicationReadSchema = z.strictObject({
  publicationId: uuidSchema,
  organizationId: uuidSchema,
  intakeId: uuidSchema,
  sequence: z.number().int().positive(),
  configurationVersion: z.number().int().positive(),
  state: z.enum(["prepared", "published"]),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  optionCount: z.number().int().nonnegative(),
  options: z.array(maskedOptionSchema).max(50),
  nextOrdinal: z.number().int().positive().nullable(),
  correlationId: uuidSchema,
}).superRefine((publication, context) => {
  if (publication.configurationVersion !== publication.sequence) {
    context.addIssue({ code: "custom", path: ["configurationVersion"], message: "Configuration version must equal publication sequence" });
  }
  const ordinals = new Set<number>();
  const optionIds = new Set<string>();
  publication.options.forEach((option, index) => {
    if (ordinals.has(option.ordinal)) {
      context.addIssue({ code: "custom", path: ["options", index, "ordinal"], message: "Option ordinals must be unique" });
    }
    ordinals.add(option.ordinal);
    if (optionIds.has(option.optionId)) {
      context.addIssue({ code: "custom", path: ["options", index, "optionId"], message: "Option identities must be unique" });
    }
    optionIds.add(option.optionId);
  });
});

export const optionPublicationConfigSchema = publicationConfigSchema;
export const approvedInputSchema = approvedVendorInputSchema;
export const maskedPublicationOptionSchema = maskedOptionSchema;
export const optionPublicationReadSchema = publicationReadSchema;

export type PublicationConfig = z.output<typeof publicationConfigSchema>;
export type PublicationRequirement = z.output<typeof publicationRequirementSchema>;
export type ApprovedVendorInput = z.output<typeof approvedVendorInputSchema>;
export type MaskedOption = z.output<typeof maskedOptionSchema>;
export type PublicationRead = z.output<typeof publicationReadSchema>;
export type PublishedOptionEvaluation = Omit<MaskedOption, "optionId" | "ordinal" | "maskedLabel">;

type Scalar = string | number | boolean;

// SQL rejects legacy numeric lexemes that cannot round-trip through the
// JavaScript number used by this oracle. The runtime guard still fails closed
// for values JavaScript cannot represent as finite numbers.
function isRuntimeRepresentableNumber(value: number): boolean {
  return Number.isFinite(value);
}

function fail(message: string): never {
  throw new Error(`Invalid option publication input: ${message}`);
}

function parseRequirements(requirements: readonly unknown[]): PublicationRequirement[] {
  const parsed = z.array(publicationRequirementSchema).min(1).max(2_000).safeParse(requirements);
  if (!parsed.success) fail("requirements are invalid");
  const seen = new Set<string>();
  for (const requirement of parsed.data) {
    if (seen.has(requirement.key)) fail(`duplicate requirement: ${requirement.key}`);
    seen.add(requirement.key);
  }
  return parsed.data;
}

function parseConfig(config: unknown): PublicationConfig {
  const parsed = publicationConfigSchema.safeParse(config);
  if (!parsed.success) fail("configuration is invalid");
  return parsed.data;
}

function parseInputs(inputs: readonly unknown[]): ApprovedVendorInput[] {
  const parsed = z.array(approvedVendorInputSchema).safeParse(inputs);
  if (!parsed.success) fail("approved inputs are invalid");
  return parsed.data;
}

function readScalar(response: unknown, path: readonly string[]): Scalar | null {
  let current = response;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === "string" || typeof current === "boolean") return current;
  if (typeof current === "number" && isRuntimeRepresentableNumber(current)) return current;
  return null;
}

function serializedScalar(value: Scalar): string {
  if (typeof value === "number") {
    // PostgreSQL numeric emits plain decimals. Expand JS exponent notation so
    // both evaluators compare the same representation, including small values.
    const text = String(value);
    if (!/[eE]/.test(text)) return text;
    const [coefficient, exponent] = text.split(/[eE]/);
    const negative = coefficient.startsWith("-");
    const unsigned = negative ? coefficient.slice(1) : coefficient;
    const [whole, fraction = ""] = unsigned.split(".");
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    const decimal = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
    return negative ? `-${decimal}` : decimal;
  }
  // Format 1 folds ASCII letters and trims ASCII spaces only. Locale-specific
  // case conversion must not change scores between JavaScript and PostgreSQL.
  return String(value).replace(/^ +| +$/g, "").replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function oldestTimestamp(inputs: readonly ApprovedVendorInput[], field: "captured_at" | "valid_until"): string | null {
  if (inputs.length === 0) return null;
  return inputs.reduce((oldest, input) => Date.parse(input[field]) < Date.parse(oldest) ? input[field] : oldest, inputs[0][field]);
}

/**
 * Calculates one masked option from immutable approved inputs.
 * The caller adds the option identity and ordinal after publication allocation.
 */
export function evaluatePublishedOption(
  requirements: readonly unknown[],
  config: unknown,
  inputs: readonly unknown[],
): PublishedOptionEvaluation {
  const parsedRequirements = parseRequirements(requirements);
  const parsedConfig = parseConfig(config);
  const parsedInputs = parseInputs(inputs);
  const criteria = new Map(parsedConfig.criteria.map((criterion) => [criterion.requirementKey, criterion]));
  const requirementKeys = new Set(parsedRequirements.map((requirement) => requirement.key));
  if (criteria.size !== requirementKeys.size || parsedConfig.criteria.some((criterion) => !requirementKeys.has(criterion.requirementKey))) {
    fail("configuration criteria must exactly match requirements");
  }

  const relevantInputs = parsedInputs.filter((input) => parsedConfig.criteria.some((criterion) => criterion.factKey === input.field_key));
  const orderedRequirements = [...parsedRequirements].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const totalWeight = parsedRequirements.reduce((sum, requirement) => sum + requirement.weight, 0);
  let satisfiedWeight = 0;
  let coveredWeight = 0;
  const fitReasons: string[] = [];
  const limitations: string[] = [];

  for (const requirement of orderedRequirements) {
    const criterion = criteria.get(requirement.key);
    if (!criterion) fail(`missing criterion for ${requirement.key}`);
    const matchingInputs = relevantInputs.filter((input) => input.field_key === criterion.factKey);
    if (matchingInputs.length > 0) coveredWeight += requirement.weight;
    const response = readScalar(requirement.response, criterion.responsePath);
    if (response === null) fail("response path must resolve to a scalar");
    const satisfied = matchingInputs.some((input) => serializedScalar(input.value) === serializedScalar(response));
    if (satisfied) {
      satisfiedWeight += requirement.weight;
      fitReasons.push(requirement.key);
    } else {
      limitations.push(requirement.key);
    }
  }

  const noRelevantInputs = relevantInputs.length === 0;
  const missingMust = orderedRequirements.some((requirement) => requirement.importance === "must" && !fitReasons.includes(requirement.key));
  const eligibility = noRelevantInputs ? "unknown" : missingMust ? "ineligible" : "eligible";
  return {
    eligibility,
    deterministicScore: Math.round((satisfiedWeight / totalWeight) * 10_000),
    confidenceBasisPoints: Math.round((coveredWeight / totalWeight) * 10_000),
    fitReasons,
    limitations,
    evidenceFreshAt: oldestTimestamp(relevantInputs, "captured_at"),
    validUntil: oldestTimestamp(relevantInputs, "valid_until"),
  };
}
