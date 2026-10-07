import "server-only";
import { z } from "zod";
import { communicationDeliveryReceiptSchema, prepareOutboundCommunication, type EmailService } from "./communication-contract";
import { notificationAttemptResultSchema, notificationClaimSchema, type NotificationClaim, type NotificationAttemptResult } from "./rfp-notification-contract";

type DisabledWorker = { enabled: false };
export type NotificationWorkerDependencies = DisabledWorker | {
  enabled: true;
  claim: (notificationId: string) => Promise<unknown | null>;
  canDispatch: (claim: NotificationClaim) => Promise<boolean>;
  // A future adapter binds the immutable recipient address from this private
  // manifest. The business request cannot resolve a browser-supplied address.
  createEmailService: (claim: NotificationClaim) => EmailService;
  recordResult: (claim: NotificationClaim, result: NotificationAttemptResult) => Promise<boolean>;
};
export type NotificationWorkerOutcome = { outcome: "disabled" | "idle" | "accepted" | "failed" | "needs_attention" };

/** No provider, credential, schedule, or database login is composed here. */
export async function runRfpNotificationWorker(notificationId: unknown, dependencies: NotificationWorkerDependencies = { enabled: false }): Promise<NotificationWorkerOutcome> {
  if (!dependencies.enabled) return { outcome: "disabled" };
  const activeWorker = dependencies;
  const id = z.uuid().safeParse(notificationId);
  if (!id.success) return { outcome: "failed" };
  let claim: NotificationClaim;
  try {
    const value = await dependencies.claim(id.data.toLowerCase());
    if (value === null) return { outcome: "idle" };
    const parsed = notificationClaimSchema.safeParse(value);
    if (!parsed.success || parsed.data.notificationId !== id.data.toLowerCase()) return { outcome: "needs_attention" };
    claim = parsed.data;
  } catch {
    return { outcome: "needs_attention" };
  }
  async function finish(result: NotificationAttemptResult): Promise<NotificationWorkerOutcome> {
    try {
      const recorded = await activeWorker.recordResult(claim, notificationAttemptResultSchema.parse(result));
      return { outcome: recorded === true && !(result.outcome === "failed" && claim.attemptNumber === 3) ? result.outcome : "needs_attention" };
    } catch {
      // A failed receipt can mean the provider accepted the message. Never
      // resend the same lease or translate this uncertainty into a safe retry.
      return { outcome: "needs_attention" };
    }
  }
  try {
    if (await dependencies.canDispatch(claim) !== true) return finish({ outcome: "needs_attention", failureCode: "source_changed" });
    const prepared = prepareOutboundCommunication({ channel: "email", idempotencyKey: claim.notificationId,
      correlationId: claim.correlationId, templateKey: "rfp.portal_notification", subject: claim.subject, body: claim.body,
      recipientIds: [claim.recipientIdentityId], associations: [{ organizationId: claim.organizationId, recordType: "rfp", recordId: claim.rfpId }],
      consent: "transactional" });
    if (!prepared.ok) return finish({ outcome: "needs_attention", failureCode: "source_changed" });
    const response = communicationDeliveryReceiptSchema.safeParse(await dependencies.createEmailService(claim).send(prepared.request));
    if (!response.success || response.data.communicationId !== claim.notificationId) {
      return finish({ outcome: "needs_attention", failureCode: "outcome_unknown" });
    }
    const receipt = response.data;
    if (receipt.state === "sent" && receipt.providerMessageId && receipt.failureCode === null && receipt.retryable === false) {
      return finish({ outcome: "accepted", providerMessageId: receipt.providerMessageId });
    }
    const failure = notificationAttemptResultSchema.safeParse({ outcome: "failed", failureCode: receipt.failureCode });
    if (receipt.state === "failed" && receipt.providerMessageId === null && failure.success) return finish(failure.data);
    return finish({ outcome: "needs_attention", failureCode: "outcome_unknown" });
  } catch {
    return finish({ outcome: "needs_attention", failureCode: "outcome_unknown" });
  }
}
