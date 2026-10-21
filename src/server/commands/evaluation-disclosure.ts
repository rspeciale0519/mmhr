import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });

const pageInputFields = {
  organizationId: uuid,
  intakeId: uuid,
  correlationId: uuid,
  afterId: uuid.optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
};

export const evaluationDisclosureReviewInputSchema = z.strictObject(pageInputFields);
export const evaluationDisclosuresInputSchema = z.strictObject(pageInputFields);

export const recordEvaluationDisclosureInputSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  candidateId: uuid,
  expectedReviewDigest: digest,
  discussionAt: timestamp,
  discussionReference: z.string().trim().min(1).max(300),
  conflictDisclosure: z.string().trim().min(1).max(2_000),
  reason: z.string().trim().min(1).max(500),
  correlationId: uuid,
  idempotencyKey: uuid,
});

const candidateState = z.enum([
  "proposed", "active", "paused", "eliminated", "selected", "archived",
]);

const reviewItemSchema = z.strictObject({
  candidateId: uuid,
  candidateRevision: z.number().int().positive(),
  source: z.enum(["initial", "review_addition"]),
  state: candidateState,
  maskedLabel: z.string().min(1).max(100),
  providerName: z.string().min(1).max(200),
  productName: z.string().min(1).max(200),
  publicationId: uuid.nullable(),
  publicationSequence: z.number().int().positive().nullable(),
  reviewDigest: digest.nullable(),
  canDisclose: z.boolean(),
  lastDisclosureAt: timestamp.nullable(),
}).superRefine((item, context) => {
  if (item.canDisclose && (item.publicationId === null || item.publicationSequence === null || item.reviewDigest === null)) {
    context.addIssue({ code: "custom", path: ["canDisclose"], message: "Disclosure requires a published review" });
  }
});

const disclosureItemSchema = z.strictObject({
  disclosureId: uuid,
  candidateId: uuid,
  maskedLabel: z.string().min(1).max(100),
  providerName: z.string().min(1).max(200),
  productName: z.string().min(1).max(200),
  conflictDisclosure: z.string().min(1).max(2_000),
  disclosedAt: timestamp,
  discussionAt: timestamp,
});

const reviewResultSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  items: z.array(reviewItemSchema),
  nextCursor: uuid.nullable(),
  correlationId: uuid,
});

const disclosuresResultSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  items: z.array(disclosureItemSchema),
  nextCursor: uuid.nullable(),
  correlationId: uuid,
});

const disclosureResultSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  candidateId: uuid,
  disclosureId: uuid,
  correlationId: uuid,
  outcomeCode: z.enum(["recorded", "replayed"]),
});

export type EvaluationDisclosureReview = z.output<typeof reviewResultSchema>;
export type EvaluationDisclosures = z.output<typeof disclosuresResultSchema>;
export type EvaluationDisclosureResult = z.output<typeof disclosureResultSchema>;
export type EvaluationDisclosureReviewInput = z.output<typeof evaluationDisclosureReviewInputSchema>;
export type EvaluationDisclosuresInput = z.output<typeof evaluationDisclosuresInputSchema>;
export type RecordEvaluationDisclosureInput = z.output<typeof recordEvaluationDisclosureInputSchema>;

export class EvaluationDisclosureError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Evaluation disclosure request failed");
    this.name = "EvaluationDisclosureError";
  }
}

function assertOrganizationContext(
  context: Awaited<ReturnType<typeof requirePermission>>,
  organizationId: string,
  correlationId: string,
) {
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId ||
    context.correlationId !== correlationId) throw new AuthorizationError();
}

async function customerContext(
  organizationId: string,
  correlationId: string,
  options: AuthorizationOptions,
) {
  const context = await requirePermission("portal.customer.access", {
    kind: "organization", organizationId,
  }, { ...options, correlationId });
  assertOrganizationContext(context, organizationId, correlationId);
  return context;
}

async function staffContext(
  organizationId: string,
  correlationId: string,
  options: AuthorizationOptions,
) {
  const context = await requirePermission("evaluation.disclose", {
    kind: "organization", organizationId,
  }, { ...options, correlationId });
  assertOrganizationContext(context, organizationId, correlationId);
  const admin = await requirePermission("admin.access", { kind: "platform" }, {
    supabase: context.supabase,
    correlationId,
  });
  if (admin.scope.kind !== "platform" || admin.identityId !== context.identityId ||
    admin.correlationId !== correlationId || admin.supabase !== context.supabase) {
    throw new AuthorizationError();
  }
  return context;
}

function rejectUnexpected(error: unknown): never {
  if (error instanceof AuthorizationError || error instanceof EvaluationDisclosureError) throw error;
  throw new EvaluationDisclosureError("UNAVAILABLE");
}

type CandidatePage = {
  items: Array<{ candidateId: string }>;
  nextCursor: string | null;
};

function validatePage<T extends CandidatePage>(
  result: T,
  input: EvaluationDisclosureReviewInput | EvaluationDisclosuresInput,
): T & { nextCursor: string | null } {
  for (let index = 1; index < result.items.length; index += 1) {
    if (result.items[index - 1]!.candidateId >= result.items[index]!.candidateId) {
      throw new EvaluationDisclosureError("INVALID_RESPONSE");
    }
  }
  if (input.afterId !== undefined && result.items[0]?.candidateId !== undefined && result.items[0].candidateId <= input.afterId) {
    throw new EvaluationDisclosureError("INVALID_RESPONSE");
  }
  if (result.nextCursor === null) {
    if (result.items.length > input.pageSize) throw new EvaluationDisclosureError("INVALID_RESPONSE");
  } else if (result.items.length !== input.pageSize ||
    result.nextCursor !== result.items[result.items.length - 1]?.candidateId) {
    throw new EvaluationDisclosureError("INVALID_RESPONSE");
  }
  return result;
}

export async function getEvaluationDisclosureReview(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<EvaluationDisclosureReview> {
  const parsed = evaluationDisclosureReviewInputSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationDisclosureError("INVALID_INPUT");
  const { correlationId, ...payload } = parsed.data;
  try {
    const context = await staffContext(parsed.data.organizationId, correlationId, options);
    const response = await context.supabase.rpc("mmhr_get_evaluation_disclosure_review", {
      payload, correlation_id: correlationId,
    });
    if (!response || response.error !== null) {
      throw new EvaluationDisclosureError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = reviewResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId ||
      result.data.intakeId !== parsed.data.intakeId || result.data.correlationId !== correlationId) {
      throw new EvaluationDisclosureError("INVALID_RESPONSE");
    }
    return validatePage(result.data, parsed.data);
  } catch (error) { rejectUnexpected(error); }
}

export async function getEvaluationDisclosures(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<EvaluationDisclosures> {
  const parsed = evaluationDisclosuresInputSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationDisclosureError("INVALID_INPUT");
  const { correlationId, ...payload } = parsed.data;
  try {
    const context = await customerContext(parsed.data.organizationId, correlationId, options);
    const response = await context.supabase.rpc("mmhr_get_evaluation_disclosures", {
      payload, correlation_id: correlationId,
    });
    if (!response || response.error !== null) {
      throw new EvaluationDisclosureError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = disclosuresResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId ||
      result.data.intakeId !== parsed.data.intakeId || result.data.correlationId !== correlationId) {
      throw new EvaluationDisclosureError("INVALID_RESPONSE");
    }
    return validatePage(result.data, parsed.data);
  } catch (error) { rejectUnexpected(error); }
}

export async function recordEvaluationDisclosure(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<EvaluationDisclosureResult> {
  const parsed = recordEvaluationDisclosureInputSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationDisclosureError("INVALID_INPUT");
  const { correlationId, idempotencyKey, ...payload } = parsed.data;
  try {
    const context = await staffContext(parsed.data.organizationId, correlationId, options);
    const response = await context.supabase.rpc("mmhr_record_evaluation_disclosure", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new EvaluationDisclosureError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = disclosureResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId ||
      result.data.intakeId !== parsed.data.intakeId || result.data.candidateId !== parsed.data.candidateId ||
      result.data.correlationId !== correlationId) {
      throw new EvaluationDisclosureError("INVALID_RESPONSE");
    }
    return result.data;
  } catch (error) { rejectUnexpected(error); }
}

export const evaluationDisclosureReviewResultSchema = reviewResultSchema;
export const evaluationDisclosuresResultSchema = disclosuresResultSchema;
export const recordEvaluationDisclosureResultSchema = disclosureResultSchema;
