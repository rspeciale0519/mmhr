import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { intakeDataSchema, intakeSaveResultSchema, type IntakeSaveResult } from "./intake-save";

const uuid = z.uuid().transform((value) => value.toLowerCase());

export const customerIntakeSaveSchema = z.strictObject({
  intakeId: uuid.nullable(),
  organizationId: uuid,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  status: z.enum(["draft", "in_progress"]),
  data: intakeDataSchema,
  correlationId: uuid,
  idempotencyKey: uuid,
}).superRefine((value, context) => {
  if ((value.intakeId === null && value.expectedRevision !== 0) ||
    (value.intakeId !== null && value.expectedRevision < 1)) {
    context.addIssue({ code: "custom", path: ["expectedRevision"], message: "Invalid intake revision" });
  }
});

export class CustomerIntakeSaveError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Intake could not be saved");
    this.name = "CustomerIntakeSaveError";
  }
}

export async function saveCustomerIntake(
  input: unknown, options: AuthorizationOptions = {},
): Promise<IntakeSaveResult> {
  const parsed = customerIntakeSaveSchema.safeParse(input);
  if (!parsed.success) throw new CustomerIntakeSaveError("INVALID_INPUT");
  const { correlationId, idempotencyKey, ...payload } = parsed.data;
  const scope = { kind: "organization" as const, organizationId: payload.organizationId };

  try {
    const context = await requirePermission("intake.draft.save", scope, { ...options, correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== payload.organizationId) {
      throw new AuthorizationError();
    }
    const portal = await requirePermission("portal.customer.access", scope, { supabase: context.supabase, correlationId });
    if (portal.scope.kind !== "organization" || portal.scope.organizationId !== payload.organizationId ||
      portal.identityId !== context.identityId) {
      throw new AuthorizationError();
    }

    // The fixed RPC derives the actor and repeats current authority checks after
    // taking the security lock. No browser actor or role reaches the writer.
    const response = await context.supabase.rpc("mmhr_save_customer_intake", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new CustomerIntakeSaveError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = intakeSaveResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== payload.organizationId ||
      result.data.correlationId !== correlationId ||
      (payload.intakeId !== null && result.data.intakeId !== payload.intakeId)) {
      throw new CustomerIntakeSaveError("INVALID_RESPONSE");
    }
    // Replays can report a later, now locked state. They never authorize another
    // write or present that later state as the result of a fresh draft save.
    const validOutcome = result.data.outcomeCode === "replayed"
      ? result.data.revision > payload.expectedRevision
      : result.data.outcomeCode === (payload.intakeId === null ? "created" : "updated") &&
        result.data.revision === payload.expectedRevision + 1 && result.data.status === payload.status;
    if (!validOutcome) throw new CustomerIntakeSaveError("INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CustomerIntakeSaveError) throw error;
    throw new CustomerIntakeSaveError("UNAVAILABLE");
  }
}
