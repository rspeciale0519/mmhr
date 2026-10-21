import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { requirementResultFields, requirementWriteFields } from "@/server/matching/requirement-input";

export const requirementUpdateSchema = z.strictObject({ ...requirementWriteFields,
  expectedRevision: z.number().int().min(1).max(2_147_483_646),
});
const resultSchema = z.strictObject({ ...requirementResultFields, outcomeCode: z.enum(["updated", "replayed"]) });
export type RequirementUpdateResult = z.infer<typeof resultSchema>;
export async function updateIntakeRequirement(input: unknown, options: AuthorizationOptions = {}): Promise<RequirementUpdateResult> {
  const parsed = requirementUpdateSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid requirement metadata input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const admin = await requirePermission("admin.access", { kind: "platform" }, {
      supabase: context.supabase, correlationId: command.correlationId,
    });
    if (admin.identityId !== context.identityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_update_intake_requirement", {
      payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey,
    });
    if (!response || response.error) throw new Error("Requirement update unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.requirementId !== command.requirementId ||
      result.data.organizationId !== command.organizationId || result.data.intakeId !== command.intakeId ||
      result.data.correlationId !== command.correlationId ||
      (result.data.outcomeCode === "updated" ? result.data.revision !== command.expectedRevision + 1 : result.data.revision <= command.expectedRevision)) {
      throw new Error("Invalid requirement update response");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && ["Requirement update unavailable", "Invalid requirement update response"].includes(error.message)) throw error;
    throw new Error("Requirement update unavailable");
  }
}
