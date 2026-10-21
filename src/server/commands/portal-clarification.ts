import "server-only";
import { portalClarificationCommandSchema, portalClarificationPageSchema, portalClarificationReadSchema, portalClarificationResultSchema } from "@/lib/portal-clarification";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function invoke(name: string, organizationId: string, correlationId: string, vendor: boolean,
  payload: unknown, idempotencyKey: string | undefined, options: AuthorizationOptions) {
  const context = await requirePermission(vendor ? "portal.vendor.access" : "rfp.approve",
    { kind: "organization", organizationId }, { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId || context.correlationId !== correlationId) throw new AuthorizationError();
  const result = await context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
  if (result.error?.code === "42501") throw new AuthorizationError();
  if (result.error) throw new Error("Clarification request failed");
  return result.data as unknown;
}

export async function recordPortalClarification(value: unknown, options: AuthorizationOptions = {}) {
  const input = portalClarificationCommandSchema.parse(value);
  const { correlationId, idempotencyKey, ...payload } = input;
  const result = portalClarificationResultSchema.parse(await invoke("mmhr_record_portal_response_clarification",
    input.organizationId, correlationId, input.action === "reply", payload, idempotencyKey, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== correlationId ||
    (input.action === "ask" ? result.recipientId !== input.recipientId || result.normalizationId !== input.normalizationId
      : result.clarificationId !== input.clarificationId) ||
    (input.action === "reply" && result.replyNormalizationId !== input.replyNormalizationId)) throw new Error("Invalid clarification result");
  return result;
}

export async function getPortalClarifications(value: unknown, options: AuthorizationOptions = {}) {
  const input = portalClarificationReadSchema.parse(value);
  const { correlationId, ...payload } = input;
  let data: unknown;
  if (input.view === "customer") {
    const context = await requirePermission("portal.customer.access", { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId || context.correlationId !== correlationId) throw new AuthorizationError();
    const result = await context.supabase.rpc("mmhr_get_portal_response_clarifications", { payload, correlation_id: correlationId });
    if (result.error?.code === "42501") throw new AuthorizationError();
    if (result.error) throw new Error("Clarification request failed");
    data = result.data;
  } else data = await invoke("mmhr_get_portal_response_clarifications", input.organizationId, correlationId, input.view === "vendor", payload, undefined, options);
  const page = portalClarificationPageSchema.parse(data);
  if (page.organizationId !== input.organizationId || page.correlationId !== correlationId) throw new Error("Invalid clarification page");
  let previous = input.afterId;
  for (const row of page.items) {
    if ((previous && row.clarificationId <= previous) ||
      (input.view !== "customer" && row.normalizationId === null) ||
      (input.view === "vendor" && (row.recipientId !== input.recipientId || row.canDecide)) ||
      (input.view === "staff" && row.canReply) ||
      (input.view === "customer" && (row.canReply || row.canDecide || row.status !== "approved" || row.decision !== "accepted"
        || row.answer === null || row.answeredAt === null || row.decisionReason === null
        || (row.replyNormalizationId !== null && row.normalizationId !== null)
        || row.latestNormalizationId !== (row.replyNormalizationId ?? row.normalizationId)
        || row.latestRevision !== (row.replyRevision ?? row.revision)))) throw new Error("Invalid clarification page");
    previous = row.clarificationId;
  }
  if (page.nextCursor && (page.items.length !== 25 || page.nextCursor !== previous)) throw new Error("Invalid clarification cursor");
  return page;
}
