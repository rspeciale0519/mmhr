import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { intakeSaveResultSchema, type IntakeSaveResult } from "./intake-save";

const uuid = z.uuid().transform((value) => value.toLowerCase());

export const customerIntakeSubmitSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  expectedRevision: z.number().int().min(1).max(2_147_483_646),
  correlationId: uuid,
  idempotencyKey: uuid,
});

export class CustomerIntakeSubmitError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Intake could not be submitted");
    this.name = "CustomerIntakeSubmitError";
  }
}

export async function submitCustomerIntake(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<IntakeSaveResult> {
  const parsed = customerIntakeSubmitSchema.safeParse(input);
  if (!parsed.success) throw new CustomerIntakeSubmitError("INVALID_INPUT");
  const { correlationId, idempotencyKey, ...payload } = parsed.data;
  const scope = { kind: "organization" as const, organizationId: payload.organizationId };

  try {
    const context = await requirePermission("intake.submit", scope, { ...options, correlationId });
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

    const response = await context.supabase.rpc("mmhr_submit_customer_intake", {
      payload,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new CustomerIntakeSubmitError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = intakeSaveResultSchema.safeParse(response.data);
    if (!result.success || result.data.intakeId !== payload.intakeId ||
      result.data.organizationId !== payload.organizationId || result.data.correlationId !== correlationId) {
      throw new CustomerIntakeSubmitError("INVALID_RESPONSE");
    }

    const validOutcome = result.data.outcomeCode === "replayed"
      ? result.data.revision > payload.expectedRevision
      : result.data.outcomeCode === "updated" && result.data.status === "submitted" &&
        result.data.revision === payload.expectedRevision + 1;
    if (!validOutcome) throw new CustomerIntakeSubmitError("INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CustomerIntakeSubmitError) throw error;
    throw new CustomerIntakeSubmitError("UNAVAILABLE");
  }
}
