import "server-only";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { notificationCommandResultSchema, notificationQueueSchema, notificationReadSchema,
  notificationRecipientsSchema, notificationRetrySchema, notificationStatusSchema } from "@/server/workflows/rfp-notification-contract";

async function rpc(name: string, input: { organizationId: string; correlationId: string; idempotencyKey?: string }, options: AuthorizationOptions) {
  const permissionOptions = { ...options, correlationId: input.correlationId };
  const context = await requirePermission("rfp.distribute", { kind: "organization", organizationId: input.organizationId }, permissionOptions);
  const staff = await requirePermission("admin.access", { kind: "platform" }, { supabase: context.supabase, correlationId: input.correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId
    || staff.scope.kind !== "platform" || context.identityId !== staff.identityId
    || context.assurance !== "aal2" || staff.assurance !== "aal2"
    || context.correlationId !== input.correlationId || staff.correlationId !== input.correlationId) throw new AuthorizationError();
  const { correlationId, idempotencyKey, ...payload } = input;
  const response = await context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Notification request failed");
  return response.data as unknown;
}

function bound<T extends { organizationId: string; correlationId: string; rfpId: string; version: number }>(
  result: T, input: { organizationId: string; correlationId: string; rfpId: string; version: number }): T {
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.rfpId !== input.rfpId || result.version !== input.version) throw new Error("Invalid notification result");
  return result;
}
export async function getRfpNotificationRecipients(value: unknown, options: AuthorizationOptions = {}) {
  const input = notificationReadSchema.parse(value);
  const result = bound(notificationRecipientsSchema.parse(await rpc("mmhr_get_rfp_notification_recipients", input, options)), input);
  const keys = result.items.map(item => `${item.recipientId}:${item.membershipId}`);
  if (new Set(keys).size !== keys.length) throw new Error("Invalid notification recipients");
  return result;
}
export async function getRfpNotificationStatus(value: unknown, options: AuthorizationOptions = {}) {
  const input = notificationReadSchema.parse(value);
  const result = bound(notificationStatusSchema.parse(await rpc("mmhr_get_rfp_notification_status", input, options)), input);
  if (new Set(result.items.map(item => item.notificationId)).size !== result.items.length
    || result.items.some(item => item.canRetry && (item.state !== "failed" || item.attemptCount >= 3))) throw new Error("Invalid notification status");
  return result;
}
export async function queueRfpNotification(value: unknown, options: AuthorizationOptions = {}) {
  const input = notificationQueueSchema.parse(value);
  const result = bound(notificationCommandResultSchema.parse(await rpc("mmhr_queue_rfp_notification", input, options)), input);
  if (result.notificationId !== input.notificationId || result.recipientId !== input.recipientId
    || result.membershipId !== input.membershipId || result.action !== "queue" || result.revision !== 1) throw new Error("Invalid notification receipt");
  return result;
}
export async function retryRfpNotification(value: unknown, options: AuthorizationOptions = {}) {
  const input = notificationRetrySchema.parse(value);
  const result = bound(notificationCommandResultSchema.parse(await rpc("mmhr_retry_rfp_notification", input, options)), input);
  if (result.notificationId !== input.notificationId || result.action !== "retry"
    || result.revision !== input.expectedRevision + 1) throw new Error("Invalid notification receipt");
  return result;
}
