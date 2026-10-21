import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const matchingRuleApprovalSchema = z.strictObject({ ruleSetId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid });
const resultSchema = z.strictObject({ ruleSetId: uuid, organizationId: uuid, version: z.number().int().positive(), status: z.literal("approved"), outcomeCode: z.enum(["approved", "replayed"]), correlationId: uuid });
export type MatchingRuleApprovalCommand = z.infer<typeof matchingRuleApprovalSchema>;
export type MatchingRuleApprovalResult = z.infer<typeof resultSchema>;

export async function approveMatchingRuleSet(input: unknown, options: AuthorizationOptions = {}): Promise<MatchingRuleApprovalResult> {
  const parsed = matchingRuleApprovalSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid rule approval input"); const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_approve_matching_rule_set", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("Rule approval unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.ruleSetId !== command.ruleSetId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid rule approval response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Rule approval unavailable" || error.message === "Invalid rule approval response")) throw error;
    throw new Error("Rule approval unavailable");
  }
}
