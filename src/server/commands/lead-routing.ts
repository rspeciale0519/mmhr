import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const inputSchema = z.strictObject({
  leadId: z.uuid(),
  organizationId: z.uuid(),
  ownerIdentityId: z.uuid(),
  status: z.enum(["contacted", "qualified", "disqualified", "converted", "archived"]),
});
const resultSchema = z.strictObject({
  leadId: z.uuid(), organizationId: z.uuid(), ownerIdentityId: z.uuid(),
  status: z.enum(["contacted", "qualified", "disqualified", "converted", "archived"]),
  outcomeCode: z.enum(["routed", "replayed"]), correlationId: z.uuid(),
});
export type LeadRoutingInput = z.infer<typeof inputSchema>;
export type LeadRoutingResult = z.infer<typeof resultSchema>;
export class LeadRoutingError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Lead routing could not be completed"); this.name = "LeadRoutingError";
  }
}

export async function routeLead(input: unknown, options: AuthorizationOptions = {}): Promise<LeadRoutingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new LeadRoutingError("INVALID_INPUT");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_route_lead", {
      payload: parsed.data, correlation_id: parsed.data.leadId, idempotency_key: parsed.data.leadId,
    });
    if (response.error) throw new LeadRoutingError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.leadId !== parsed.data.leadId || result.data.organizationId !== parsed.data.organizationId || result.data.ownerIdentityId !== parsed.data.ownerIdentityId) throw new LeadRoutingError("INVALID_RESPONSE");
    return result.data;
  } catch (error) { if (error instanceof AuthorizationError || error instanceof LeadRoutingError) throw error; throw new LeadRoutingError("UNAVAILABLE"); }
}
