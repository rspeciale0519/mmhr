import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { organizationId: uuid, actorIdentityId: uuid, routeId: uuid, dealId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const evaluationRouteCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create") }),
  z.strictObject({ ...base, action: z.literal("finalize"), expectedRevision: z.number().int().positive() }),
]);
const resultSchema = z.strictObject({ routeId: uuid, dealId: uuid, organizationId: uuid, route: z.enum(["mmhr", "direct"]), state: z.enum(["active", "finalized"]), revision: z.number().int().positive(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordEvaluationRoute(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = evaluationRouteCommandSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid evaluation route input");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId || context.identityId !== parsed.data.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_evaluation_route", { payload: parsed.data, correlation_id: parsed.data.correlationId, idempotency_key: parsed.data.idempotencyKey });
    if (response.error) throw new Error("Evaluation route unavailable"); const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.routeId !== parsed.data.routeId || result.data.dealId !== parsed.data.dealId || result.data.correlationId !== parsed.data.correlationId) throw new Error("Invalid evaluation route result"); return result.data;
  } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Evaluation route unavailable" || error.message === "Invalid evaluation route result")) throw error; throw new Error("Evaluation route unavailable"); }
}
