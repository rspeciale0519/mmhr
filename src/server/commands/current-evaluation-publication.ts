import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { publicationReadSchema, type PublicationRead } from "@/server/matching/option-publication-contract";
import { EvaluationPublicationError } from "./evaluation-publication";

const uuid = z.uuid().transform((value) => value.toLowerCase());

export const currentEvaluationPublicationSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  correlationId: uuid,
  limit: z.number().int().min(1).max(50).default(25),
});

const currentPublicationResultSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  publication: publicationReadSchema.nullable(),
  correlationId: uuid,
});

export type CurrentEvaluationPublication = z.output<typeof currentPublicationResultSchema>;

function rejectUnexpected(error: unknown): never {
  if (error instanceof AuthorizationError || error instanceof EvaluationPublicationError) throw error;
  throw new EvaluationPublicationError("UNAVAILABLE");
}

function validatePublicationPage(publication: PublicationRead, limit: number): PublicationRead {
  if (publication.state !== "published") throw new EvaluationPublicationError("INVALID_RESPONSE");
  const expectedLength = Math.min(limit, publication.optionCount);
  if (publication.options.length !== expectedLength ||
    publication.options.some((option, index) => option.ordinal !== index + 1) ||
    publication.nextOrdinal !== (expectedLength < publication.optionCount ? expectedLength : null)) {
    throw new EvaluationPublicationError("INVALID_RESPONSE");
  }
  return publication;
}

export async function getCurrentEvaluationPublication(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<CurrentEvaluationPublication> {
  const parsed = currentEvaluationPublicationSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationPublicationError("INVALID_INPUT");
  const { correlationId, ...payload } = parsed.data;
  try {
    const context = await requirePermission("portal.customer.access", {
      kind: "organization", organizationId: parsed.data.organizationId,
    }, { ...options, correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId ||
      context.correlationId !== correlationId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_get_current_evaluation_publication", {
      payload: { ...payload, detailsVersion: 2 },
      correlation_id: correlationId,
    });
    if (!response || response.error !== null) {
      throw new EvaluationPublicationError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = currentPublicationResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId ||
      result.data.intakeId !== parsed.data.intakeId || result.data.correlationId !== correlationId ||
      (result.data.publication !== null && (
        result.data.publication.organizationId !== parsed.data.organizationId ||
        result.data.publication.intakeId !== parsed.data.intakeId ||
        result.data.publication.correlationId !== correlationId
      ))) {
      throw new EvaluationPublicationError("INVALID_RESPONSE");
    }
    if (result.data.publication) validatePublicationPage(result.data.publication, parsed.data.limit);
    return result.data;
  } catch (error) {
    rejectUnexpected(error);
  }
}

export const currentEvaluationPublicationInputSchema = currentEvaluationPublicationSchema;
export const currentEvaluationPublicationResultSchema = currentPublicationResultSchema;
