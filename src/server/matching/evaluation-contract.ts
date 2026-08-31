import "server-only";

import { z } from "zod";

import {
  rankCandidates,
  type MatchingRequirement,
  type MatchingResult,
} from "./deterministic-matching";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const stableKey = z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/, "Value must be a stable lowercase key");
const reference = z.string().trim().min(1).max(500).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/,
  "Reference contains unsupported characters",
);
const explanation = z.string().trim().min(1).max(1_000);

export const scoringCriterionSchema = z.strictObject({
  key: stableKey,
  importance: z.enum(["must", "nice", "not_applicable"]),
  weight: z.number().int().min(1).max(100),
});

export type ScoringCriterion = z.output<typeof scoringCriterionSchema>;

export const scoringConfigurationInputSchema = z.strictObject({
  configurationId: uuid,
  version: z.number().int().positive().max(10_000),
  status: z.enum(["draft", "approved"]),
  criteria: z.array(scoringCriterionSchema).min(1).max(100),
  createdByIdentityId: uuid,
  createdAt: timestamp,
  approvedByIdentityId: uuid.nullable(),
  approvedAt: timestamp.nullable(),
  approvalReference: reference.regex(/^approval:/, "Approval reference must identify an approval record").nullable(),
  sourceReferences: z.array(reference).max(100),
}).superRefine((configuration, context) => {
  const keys = new Set<string>();
  for (const criterion of configuration.criteria) {
    if (keys.has(criterion.key)) {
      context.addIssue({ code: "custom", path: ["criteria"], message: `Duplicate scoring criterion: ${criterion.key}` });
    }
    keys.add(criterion.key);
  }

  const approvalValues = [configuration.approvedByIdentityId, configuration.approvedAt, configuration.approvalReference];
  const approvalFieldsPresent = approvalValues.some((value) => value !== null);
  const hasApproval = configuration.approvedByIdentityId !== null
    && configuration.approvedAt !== null
    && configuration.approvalReference !== null;
  if (approvalFieldsPresent !== hasApproval) {
    context.addIssue({ code: "custom", path: ["status"], message: "Scoring approval evidence must be complete" });
  }
  if (configuration.status === "approved" && !hasApproval) {
    context.addIssue({ code: "custom", path: ["status"], message: "Approved scoring requires approval evidence" });
  }
  if (configuration.status === "draft" && hasApproval) {
    context.addIssue({ code: "custom", path: ["status"], message: "Draft scoring cannot contain approval evidence" });
  }
});

export type ScoringConfigurationInput = z.output<typeof scoringConfigurationInputSchema>;
export type ScoringConfiguration = Readonly<ScoringConfigurationInput>;

export const scoringApprovalSchema = z.strictObject({
  configurationId: uuid,
  version: z.number().int().positive().max(10_000),
  approvedByIdentityId: uuid,
  approvedAt: timestamp,
  approvalReference: reference.regex(/^approval:/, "Approval reference must identify an approval record"),
});

export type ScoringApproval = z.output<typeof scoringApprovalSchema>;

export const evaluationCandidateSchema = z.strictObject({
  candidateId: reference,
  capabilities: z.record(stableKey, z.boolean()).refine(
    (capabilities) => Object.keys(capabilities).length <= 100,
    "A candidate cannot contain more than 100 capability keys",
  ),
  confidence: z.number().min(0).max(1),
  evidenceFreshAt: timestamp.nullable(),
});

export type EvaluationCandidate = z.output<typeof evaluationCandidateSchema>;

export type RankedEvaluationCandidate = Readonly<MatchingResult & {
  confidence: number;
  evidenceFreshAt: string | null;
}>;

export type RankedEvaluation = Readonly<{
  configurationId: string;
  configurationVersion: number;
  algorithm: "deterministic-v1";
  commercialDataUsed: false;
  candidates: readonly RankedEvaluationCandidate[];
}>;

export const candidateIdentitySchema = z.strictObject({
  candidateId: reference,
  vendorName: explanation.max(200),
  productName: explanation.max(200),
});

export type CandidateIdentity = z.output<typeof candidateIdentitySchema>;

export const maskRequestSchema = z.strictObject({
  candidateId: reference,
  maskedByIdentityId: uuid,
  maskedAt: timestamp,
  reason: explanation,
  auditReference: reference,
  displayNumber: z.number().int().positive().max(100),
});

export type MaskRequest = z.output<typeof maskRequestSchema>;

const maskedEventSchema = z.strictObject({
  action: z.literal("masked"),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason: explanation,
  auditReference: reference,
});

export const maskedCandidateSchema = z.strictObject({
  candidateId: reference,
  displayLabel: z.string().trim().min(1).max(100),
  masked: z.literal(true),
  maskingEvent: maskedEventSchema,
});

export type MaskedCandidate = Readonly<{
  candidateId: string;
  displayLabel: string;
  masked: true;
  maskingEvent: Readonly<{
    action: "masked";
    actorIdentityId: string;
    occurredAt: string;
    reason: string;
    auditReference: string;
  }>;
}>;

export const unmaskApprovalSchema = z.strictObject({
  candidateId: reference,
  requestedByIdentityId: uuid,
  approvedByIdentityId: uuid,
  approvedAt: timestamp,
  approvalReference: reference.regex(/^approval:/, "Approval reference must identify an approval record"),
  reason: explanation,
  auditReference: reference,
  approvalScope: z.literal("internal"),
});

export type UnmaskApproval = z.output<typeof unmaskApprovalSchema>;

export type UnmaskedCandidate = Readonly<CandidateIdentity & {
  maskingEvent: Readonly<{
    action: "unmasked";
    requestedByIdentityId: string;
    approvedByIdentityId: string;
    approvedAt: string;
    approvalReference: string;
    reason: string;
    auditReference: string;
  }>;
}>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function parseConfiguration(input: unknown): ScoringConfigurationInput {
  const result = scoringConfigurationInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid scoring configuration");
  return result.data;
}

/** Creates an immutable draft. It cannot influence a ranking until approved. */
export function createScoringConfiguration(input: unknown): ScoringConfiguration {
  const configuration = parseConfiguration(input);
  if (configuration.status !== "draft") throw new Error("New scoring configurations must start as drafts");
  return deepFreeze({
    ...configuration,
    criteria: configuration.criteria.map((criterion) => ({ ...criterion })),
    sourceReferences: [...configuration.sourceReferences],
  });
}

/** Approves one draft as a new immutable snapshot with explicit evidence. */
export function approveScoringConfiguration(
  draftInput: unknown,
  approvalInput: unknown,
): ScoringConfiguration {
  const draft = parseConfiguration(draftInput);
  const approvalResult = scoringApprovalSchema.safeParse(approvalInput);
  if (!approvalResult.success) throw new Error("Invalid scoring approval");
  const approval = approvalResult.data;
  if (draft.status !== "draft") throw new Error("Only draft scoring configurations can be approved");
  if (draft.configurationId !== approval.configurationId || draft.version !== approval.version) {
    throw new Error("Scoring approval does not match the draft");
  }
  return deepFreeze({
    ...draft,
    status: "approved" as const,
    approvedByIdentityId: approval.approvedByIdentityId,
    approvedAt: approval.approvedAt,
    approvalReference: approval.approvalReference,
    criteria: draft.criteria.map((criterion) => ({ ...criterion })),
    sourceReferences: [...draft.sourceReferences],
  });
}

/** Ranks only approved criteria and rejects commercial fields at the boundary. */
export function rankApprovedCandidates(
  configurationInput: unknown,
  candidatesInput: readonly unknown[],
): RankedEvaluation {
  const configuration = parseConfiguration(configurationInput);
  if (configuration.status !== "approved") throw new Error("Only approved scoring can rank candidates");
  const candidates = candidatesInput.map((candidate) => {
    const result = evaluationCandidateSchema.safeParse(candidate);
    if (!result.success) throw new Error("Invalid evaluation candidate");
    return result.data;
  });
  const requirements: readonly MatchingRequirement[] = configuration.criteria;
  const ranked = rankCandidates(requirements, candidates.map(({ candidateId, capabilities }) => ({
    id: candidateId,
    capabilities,
  })));
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  return deepFreeze({
    configurationId: configuration.configurationId,
    configurationVersion: configuration.version,
    algorithm: "deterministic-v1" as const,
    commercialDataUsed: false as const,
    candidates: ranked.map((result) => {
      const candidate = byId.get(result.candidateId)!;
      return {
        ...result,
        confidence: candidate.confidence,
        evidenceFreshAt: candidate.evidenceFreshAt,
      };
    }),
  });
}

/** Returns a public-safe candidate view and records why the identity was hidden. */
export function maskCandidateIdentity(
  identityInput: unknown,
  requestInput: unknown,
): MaskedCandidate {
  const identityResult = candidateIdentitySchema.safeParse(identityInput);
  const requestResult = maskRequestSchema.safeParse(requestInput);
  if (!identityResult.success || !requestResult.success) throw new Error("Invalid candidate masking request");
  const identity = identityResult.data;
  const request = requestResult.data;
  if (identity.candidateId !== request.candidateId) throw new Error("Masking request does not match candidate");
  return deepFreeze({
    candidateId: identity.candidateId,
    displayLabel: `Candidate ${request.displayNumber}`,
    masked: true as const,
    maskingEvent: {
      action: "masked" as const,
      actorIdentityId: request.maskedByIdentityId,
      occurredAt: request.maskedAt,
      reason: request.reason,
      auditReference: request.auditReference,
    },
  });
}

/** Reveals identity only with a recorded internal approval and reason. */
export function unmaskCandidateIdentity(
  maskedInput: unknown,
  identityInput: unknown,
  approvalInput: unknown,
): UnmaskedCandidate {
  const maskedResult = maskedCandidateSchema.safeParse(maskedInput);
  const identityResult = candidateIdentitySchema.safeParse(identityInput);
  const approvalResult = unmaskApprovalSchema.safeParse(approvalInput);
  if (!maskedResult.success || !identityResult.success || !approvalResult.success) {
    throw new Error("Invalid candidate unmasking approval");
  }
  const masked = maskedResult.data;
  const identity = identityResult.data;
  const approval = approvalResult.data;
  if (masked.candidateId !== identity.candidateId || masked.candidateId !== approval.candidateId) {
    throw new Error("Unmasking approval does not match candidate");
  }
  return deepFreeze({
    ...identity,
    maskingEvent: {
      action: "unmasked" as const,
      requestedByIdentityId: approval.requestedByIdentityId,
      approvedByIdentityId: approval.approvedByIdentityId,
      approvedAt: approval.approvedAt,
      approvalReference: approval.approvalReference,
      reason: approval.reason,
      auditReference: approval.auditReference,
    },
  });
}
