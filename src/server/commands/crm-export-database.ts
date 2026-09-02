import "server-only";

import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";
import {
  parseCrmExportDecision,
  parseCrmExportRequest,
} from "@/server/crm/export-contract";

const resultSchema = z.strictObject({
  exportId: z.string().uuid(),
  organizationId: z.string().uuid(),
  state: z.enum(["pending", "approved", "denied"]),
  decisionId: z.string().uuid().nullable(),
  outcomeCode: z.enum(["created", "decided", "replayed"]),
  correlationId: z.string().uuid(),
});

export type CrmExportCommandResult = z.infer<typeof resultSchema>;
export type CrmExportCommandOptions = AuthorizationOptions;

export class CrmExportCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("CRM export command could not be completed");
    this.name = "CrmExportCommandError";
  }
}

function exactScope(context: Awaited<ReturnType<typeof requirePermission>>, organizationId: string) {
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId) {
    throw new AuthorizationError();
  }
}

export async function createCrmExportRequest(
  input: unknown,
  options: CrmExportCommandOptions = {},
): Promise<CrmExportCommandResult> {
  let request;
  try { request = parseCrmExportRequest(input); } catch { throw new CrmExportCommandError("INVALID_INPUT"); }
  let context;
  try {
    context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId: request.organizationId },
      options,
    );
    exactScope(context, request.organizationId);
    if (context.identityId !== request.requestedByIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_create_crm_export_request", {
      payload: request,
      correlation_id: request.exportId,
      idempotency_key: request.exportId,
    });
    if (response.error) throw new CrmExportCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.exportId !== request.exportId
      || result.data.organizationId !== request.organizationId
      || result.data.state !== "pending") throw new CrmExportCommandError("INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CrmExportCommandError) throw error;
    throw new CrmExportCommandError("UNAVAILABLE");
  }
}

export async function decideCrmExport(
  input: unknown,
  options: CrmExportCommandOptions = {},
): Promise<CrmExportCommandResult> {
  let decision;
  try { decision = parseCrmExportDecision(input); } catch { throw new CrmExportCommandError("INVALID_INPUT"); }
  let context;
  try {
    context = await requirePermission(
      "audit.export",
      { kind: "organization", organizationId: decision.organizationId },
      options,
    );
    exactScope(context, decision.organizationId);
    if (context.identityId !== decision.reviewerIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_decide_crm_export", {
      payload: decision,
      correlation_id: decision.decisionId,
      idempotency_key: decision.decisionId,
    });
    if (response.error) throw new CrmExportCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.exportId !== decision.exportId
      || result.data.organizationId !== decision.organizationId
      || result.data.decisionId !== decision.decisionId
      || result.data.state !== decision.decision) throw new CrmExportCommandError("INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CrmExportCommandError) throw error;
    throw new CrmExportCommandError("UNAVAILABLE");
  }
}
