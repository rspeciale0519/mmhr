import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });

const commandFields = {
  organizationId: uuid,
  intakeId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
};

const optionIds = z.array(uuid).min(1).max(5).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message: "Option identities must be unique" });
  }
});

export const selectInitialEvaluationOptionsSchema = z.strictObject({
  ...commandFields,
  publicationId: uuid,
  expectedDigest: digest,
  optionIds,
});

export const getInitialEvaluationSelectionsSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  correlationId: uuid,
  selectionPublicationId: uuid.optional(),
});

const selectionItemSchema = z.strictObject({
  optionId: uuid,
  candidateId: uuid,
  ordinal: z.number().int().positive(),
  maskedLabel: z.string().regex(/^Option [1-9][0-9]*$/),
});

const selectionResultSchema = z.strictObject({
  selectionId: uuid,
  organizationId: uuid,
  intakeId: uuid,
  publicationId: uuid,
  inputDigest: digest,
  selectedCount: z.number().int().min(1).max(5),
  initialCandidateCount: z.number().int().min(1).max(5),
  items: z.array(selectionItemSchema).min(1).max(5),
  correlationId: uuid,
  outcomeCode: z.enum(["created", "replayed"]),
}).superRefine((result, context) => {
  if (result.selectedCount !== result.items.length) {
    context.addIssue({ code: "custom", path: ["selectedCount"], message: "Selected count must match items" });
  }
  if (result.initialCandidateCount < result.selectedCount) {
    context.addIssue({ code: "custom", path: ["initialCandidateCount"], message: "Initial candidate count is too small" });
  }
  const optionSet = new Set<string>();
  const candidateSet = new Set<string>();
  const ordinalSet = new Set<number>();
  result.items.forEach((item, index) => {
    if (optionSet.has(item.optionId)) context.addIssue({ code: "custom", path: ["items", index, "optionId"], message: "Option identities must be unique" });
    optionSet.add(item.optionId);
    if (candidateSet.has(item.candidateId)) context.addIssue({ code: "custom", path: ["items", index, "candidateId"], message: "Candidate identities must be unique" });
    candidateSet.add(item.candidateId);
    if (ordinalSet.has(item.ordinal)) context.addIssue({ code: "custom", path: ["items", index, "ordinal"], message: "Option ordinals must be unique" });
    ordinalSet.add(item.ordinal);
    if (item.maskedLabel !== `Option ${item.ordinal}`) {
      context.addIssue({ code: "custom", path: ["items", index, "maskedLabel"], message: "Masked label must match the ordinal" });
    }
  });
});

const selectionReadItemSchema = z.strictObject({
  selectionId: uuid,
  publicationId: uuid,
  publicationSequence: z.number().int().positive(),
  optionId: uuid,
  candidateId: uuid,
  ordinal: z.number().int().positive(),
  maskedLabel: z.string().regex(/^Option [1-9][0-9]*$/),
  state: z.enum(["proposed", "active", "paused", "eliminated", "selected", "archived"]),
  selectedAt: timestamp,
});

const selectionReadSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  initialCandidateCount: z.number().int().min(0).max(5),
  remainingInitialChoices: z.number().int().min(0).max(5),
  items: z.array(selectionReadItemSchema).max(5),
  correlationId: uuid,
  selectionPublicationId: uuid.optional(),
  selectedOptionIds: z.array(uuid).optional(),
}).superRefine((result, context) => {
  if (result.items.length > result.initialCandidateCount) {
    context.addIssue({ code: "custom", path: ["items"], message: "Items exceed initial candidate count" });
  }
  if (result.remainingInitialChoices !== 5 - result.initialCandidateCount) {
    context.addIssue({ code: "custom", path: ["remainingInitialChoices"], message: "Remaining choices do not match items" });
  }
  const candidates = new Set<string>();
  result.items.forEach((item, index) => {
    if (candidates.has(item.candidateId)) context.addIssue({ code: "custom", path: ["items", index, "candidateId"], message: "Candidate identities must be unique" });
    candidates.add(item.candidateId);
    if (item.maskedLabel !== `Option ${item.ordinal}`) {
      context.addIssue({ code: "custom", path: ["items", index, "maskedLabel"], message: "Masked label must match the ordinal" });
    }
  });
});

export type EvaluationSelectionResult = z.output<typeof selectionResultSchema>;
export type EvaluationSelectionRead = z.output<typeof selectionReadSchema>;

export class EvaluationSelectionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Evaluation selection request failed");
    this.name = "EvaluationSelectionError";
  }
}

type SelectionInput = z.output<typeof selectInitialEvaluationOptionsSchema>;

async function authorizedContext(
  permission: "evaluation.select" | "portal.customer.access",
  organizationId: string,
  correlationId: string,
  options: AuthorizationOptions,
) {
  const context = await requirePermission(permission, { kind: "organization", organizationId }, {
    ...options,
    correlationId,
  });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId ||
    context.correlationId !== correlationId) throw new AuthorizationError();
  return context;
}

function rejectUnexpected(error: unknown): never {
  if (error instanceof AuthorizationError || error instanceof EvaluationSelectionError) throw error;
  throw new EvaluationSelectionError("UNAVAILABLE");
}

function validateSelectionResult(result: EvaluationSelectionResult, input: SelectionInput): EvaluationSelectionResult {
  if (result.organizationId !== input.organizationId || result.intakeId !== input.intakeId ||
    result.publicationId !== input.publicationId || result.inputDigest !== input.expectedDigest ||
    result.correlationId !== input.correlationId) throw new EvaluationSelectionError("INVALID_RESPONSE");
  const requested = new Set(input.optionIds);
  const returned = new Set(result.items.map((item) => item.optionId));
  if (returned.size !== requested.size || [...requested].some((optionId) => !returned.has(optionId))) {
    throw new EvaluationSelectionError("INVALID_RESPONSE");
  }
  return result;
}

export async function selectInitialEvaluationOptions(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<EvaluationSelectionResult> {
  const parsed = selectInitialEvaluationOptionsSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationSelectionError("INVALID_INPUT");
  const command = parsed.data;
  try {
    const context = await authorizedContext("evaluation.select", command.organizationId, command.correlationId, options);
    const { correlationId, idempotencyKey, ...payload } = command;
    const response = await context.supabase.rpc("mmhr_select_initial_evaluation_options", {
      payload,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new EvaluationSelectionError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = selectionResultSchema.safeParse(response.data);
    if (!result.success || (result.data.outcomeCode !== "created" && result.data.outcomeCode !== "replayed")) {
      throw new EvaluationSelectionError("INVALID_RESPONSE");
    }
    return validateSelectionResult(result.data, command);
  } catch (error) {
    rejectUnexpected(error);
  }
}

export async function getInitialEvaluationSelections(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<EvaluationSelectionRead> {
  const parsed = getInitialEvaluationSelectionsSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationSelectionError("INVALID_INPUT");
  const { correlationId, ...payload } = parsed.data;
  try {
    const context = await authorizedContext("portal.customer.access", parsed.data.organizationId, correlationId, options);
    const response = await context.supabase.rpc("mmhr_get_initial_evaluation_selections", {
      payload,
      correlation_id: correlationId,
    });
    if (!response || response.error !== null) {
      throw new EvaluationSelectionError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = selectionReadSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId ||
      result.data.intakeId !== parsed.data.intakeId || result.data.correlationId !== correlationId ||
      result.data.selectionPublicationId !== parsed.data.selectionPublicationId ||
      (parsed.data.selectionPublicationId !== undefined && result.data.selectedOptionIds === undefined)) {
      throw new EvaluationSelectionError("INVALID_RESPONSE");
    }
    return result.data;
  } catch (error) {
    rejectUnexpected(error);
  }
}

export const initialEvaluationSelectionInputSchema = selectInitialEvaluationOptionsSchema;
export const initialEvaluationSelectionResultSchema = selectionResultSchema;
export const initialEvaluationSelectionReadSchema = selectionReadSchema;
