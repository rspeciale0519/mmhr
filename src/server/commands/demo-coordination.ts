import "server-only";
import { demoCoordinationCommandSchema, demoCoordinationPageSchema, demoCoordinationPermission, demoCoordinationReadSchema, demoCoordinationResultSchema, demoHistoryPageSchema, demoHistoryReadSchema } from "@/lib/demo-coordination";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function invoke(name: string, organizationId: string, correlationId: string, actionOrView: string,
  payload: unknown, idempotencyKey: string | undefined, options: AuthorizationOptions) {
  const context = await requirePermission(demoCoordinationPermission(actionOrView),
    { kind: "organization", organizationId }, { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId
    || context.correlationId !== correlationId) throw new AuthorizationError();
  const response = await context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Demo request failed");
  return response.data as unknown;
}
export async function recordDemoCoordination(value: unknown, options: AuthorizationOptions = {}) {
  const input = demoCoordinationCommandSchema.parse(value);
  const { correlationId, idempotencyKey, ...payload } = input;
  const result = demoCoordinationResultSchema.parse(await invoke("mmhr_record_demo_coordination",
    input.organizationId, correlationId, input.action, payload, idempotencyKey, options));
  const expectedStatus = input.action === "confirm" ? "scheduled" : input.action === "complete" ? "completed"
    : input.action === "cancel" ? "cancelled" : input.action === "no_show" ? "no_show" : "requested";
  if (result.organizationId !== input.organizationId || result.correlationId !== correlationId
    || (input.action !== "create" && result.demoId !== input.demoId)
    || (result.outcomeCode === "recorded" && (result.status !== expectedStatus
      || result.revision !== (input.action === "create" ? 1 : input.expectedRevision + 1)))) {
    throw new Error("Invalid demo result");
  }
  return result;
}
export async function getDemoCoordination(value: unknown, options: AuthorizationOptions = {}) {
  const input = demoCoordinationReadSchema.parse(value);
  const { correlationId, ...payload } = input;
  const page = demoCoordinationPageSchema.parse(await invoke("mmhr_get_demo_coordination",
    input.organizationId, correlationId, input.view, payload, undefined, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== correlationId
    || (input.view !== "staff" && (page.choices.length !== 0 || page.nextChoiceCursor !== null))) throw new Error("Invalid demo page");
  let previous = input.afterId;
  for (const row of page.items) {
    if ((previous && row.demoId <= previous) || (row.status === "scheduled" && row.coordination.schedule === null)
      || (["completed", "no_show"].includes(row.status) && row.coordination.outcome === null)) throw new Error("Invalid demo page");
    previous = row.demoId;
  }
  if (page.nextCursor && (page.items.length !== 25 || page.nextCursor !== previous)) throw new Error("Invalid demo cursor");
  let previousChoice = input.afterChoice;
  for (const choice of page.choices) {
    if (previousChoice && (choice.candidateId < previousChoice.candidateId
      || (choice.candidateId === previousChoice.candidateId && choice.recipientId <= previousChoice.recipientId))) throw new Error("Invalid demo choices");
    previousChoice = choice;
  }
  if (page.nextChoiceCursor && (page.choices.length !== 25 || page.nextChoiceCursor.candidateId !== previousChoice?.candidateId
    || page.nextChoiceCursor.recipientId !== previousChoice?.recipientId)) throw new Error("Invalid demo choice cursor");
  return { ...page, checkedAt: new Date().toISOString() };
}
export async function getDemoCoordinationHistory(value: unknown, options: AuthorizationOptions = {}) {
  const input = demoHistoryReadSchema.parse(value);
  const { correlationId, ...payload } = input;
  const page = demoHistoryPageSchema.parse(await invoke("mmhr_get_demo_coordination_history", input.organizationId,
    correlationId, input.view, payload, undefined, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== correlationId || page.demoId !== input.demoId) throw new Error("Invalid demo history");
  let previous = input.afterRevision;
  for (const row of page.items) {
    if (row.revision !== previous + 1) throw new Error("Invalid demo history");
    previous = row.revision;
  }
  if (page.nextRevision && (page.items.length !== 25 || page.nextRevision !== previous)) throw new Error("Invalid demo history cursor");
  return page;
}
