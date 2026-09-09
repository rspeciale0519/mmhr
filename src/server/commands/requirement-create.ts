import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { requirementResultFields, requirementWriteFields } from "@/server/matching/requirement-input";

export const requirementCreateSchema = z.strictObject({ ...requirementWriteFields, expectedRevision: z.literal(0) });
const resultSchema = z.strictObject({ ...requirementResultFields, outcomeCode: z.enum(["created", "replayed"]) });
export type RequirementCreateResult = z.output<typeof resultSchema>;

export async function createIntakeRequirement(input: unknown, options: AuthorizationOptions = {}): Promise<RequirementCreateResult> {
  const parsed = requirementCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid requirement creation input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) {
      throw new AuthorizationError();
    }
    const response = await context.supabase.rpc("mmhr_create_intake_requirement", {
      payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey,
    });
    if (!response || response.error) throw new Error("Requirement creation unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.requirementId !== command.requirementId ||
      result.data.organizationId !== command.organizationId || result.data.intakeId !== command.intakeId ||
      result.data.correlationId !== command.correlationId ||
      (result.data.outcomeCode === "created" && result.data.revision !== 1)) {
      throw new Error("Invalid requirement creation response");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && ["Requirement creation unavailable", "Invalid requirement creation response"].includes(error.message)) throw error;
    throw new Error("Requirement creation unavailable");
  }
}
