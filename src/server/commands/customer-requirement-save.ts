import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { requirementResultFields, requirementWriteFields } from "@/server/matching/requirement-input";

const customerRequirementFields = {
  requirementId: requirementWriteFields.requirementId,
  organizationId: requirementWriteFields.organizationId,
  intakeId: requirementWriteFields.intakeId,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  stableKey: requirementWriteFields.stableKey,
  label: requirementWriteFields.label,
  importance: requirementWriteFields.importance,
  weight: requirementWriteFields.weight,
  response: requirementWriteFields.response,
  requirementType: requirementWriteFields.requirementType,
  correlationId: requirementWriteFields.correlationId,
  idempotencyKey: requirementWriteFields.idempotencyKey,
};

export const customerRequirementSaveSchema = z.strictObject(customerRequirementFields);

const resultSchema = z.strictObject({
  ...requirementResultFields,
  outcomeCode: z.enum(["created", "updated", "replayed"]),
});
export type CustomerRequirementSaveResult = z.output<typeof resultSchema>;

export class CustomerRequirementSaveError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Requirement could not be saved");
    this.name = "CustomerRequirementSaveError";
  }
}

export async function saveCustomerIntakeRequirement(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<CustomerRequirementSaveResult> {
  const parsed = customerRequirementSaveSchema.safeParse(input);
  if (!parsed.success) throw new CustomerRequirementSaveError("INVALID_INPUT");
  const { correlationId, idempotencyKey, ...payload } = parsed.data;
  const scope = { kind: "organization" as const, organizationId: payload.organizationId };

  try {
    const context = await requirePermission("intake.requirement.save", scope, { ...options, correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== payload.organizationId) {
      throw new AuthorizationError();
    }
    const portal = await requirePermission("portal.customer.access", scope, {
      supabase: context.supabase,
      correlationId,
    });
    if (portal.scope.kind !== "organization" || portal.scope.organizationId !== payload.organizationId ||
      portal.identityId !== context.identityId) {
      throw new AuthorizationError();
    }

    const response = await context.supabase.rpc("mmhr_save_customer_intake_requirement", {
      payload,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new CustomerRequirementSaveError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.requirementId !== payload.requirementId ||
      result.data.organizationId !== payload.organizationId || result.data.intakeId !== payload.intakeId ||
      result.data.correlationId !== correlationId) {
      throw new CustomerRequirementSaveError("INVALID_RESPONSE");
    }
    const expectedOutcome = payload.expectedRevision === 0 ? "created" : "updated";
    const validOutcome = result.data.outcomeCode === "replayed"
      ? result.data.revision > payload.expectedRevision
      : result.data.outcomeCode === expectedOutcome && result.data.revision === payload.expectedRevision + 1;
    if (!validOutcome) throw new CustomerRequirementSaveError("INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CustomerRequirementSaveError) throw error;
    throw new CustomerRequirementSaveError("UNAVAILABLE");
  }
}
