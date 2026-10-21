import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { runRfpNotificationWorker, type NotificationWorkerDependencies } from "./rfp-notification-worker";

const manifest = { notificationId: randomUUID(), organizationId: randomUUID(), rfpId: randomUUID(), version: 1,
  recipientId: randomUUID(), membershipId: randomUUID(), recipientIdentityId: randomUUID(),
  recipientEmail: "vendor@example.invalid", sourceDigest: "a".repeat(64),
  subject: "A new request is available in your MMHR vendor portal", body: "Sign in to your MMHR vendor portal. No private customer content.",
  attemptId: randomUUID(), attemptNumber: 1, token: "b".repeat(64), expiresAt: new Date(Date.now()+60000).toISOString(), correlationId: randomUUID() };
const claim = vi.fn(), canDispatch = vi.fn(), send = vi.fn(), recordResult = vi.fn(), createEmailService = vi.fn();
const deps: Extract<NotificationWorkerDependencies, { enabled: true }> = { enabled: true, claim, canDispatch, createEmailService, recordResult };
const accepted = { communicationId: manifest.notificationId, providerMessageId: "provider-1", state: "sent", failureCode: null, retryable: false };
beforeEach(() => {
  claim.mockReset().mockResolvedValue(manifest); canDispatch.mockReset().mockResolvedValue(true);
  send.mockReset().mockResolvedValue(accepted); recordResult.mockReset().mockResolvedValue(true);
  createEmailService.mockReset().mockReturnValue({ send });
});
test("stays disabled without composing any provider or lease", async () => {
  await expect(runRfpNotificationWorker(manifest.notificationId)).resolves.toEqual({ outcome: "disabled" });
  expect(claim).not.toHaveBeenCalled(); expect(createEmailService).not.toHaveBeenCalled(); expect(recordResult).not.toHaveBeenCalled();
});
test("uses the existing internal email interface with stable identifiers and one verified participant", async () => {
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "accepted" });
  expect(createEmailService).toHaveBeenCalledWith(manifest);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: manifest.notificationId,
    correlationId: manifest.correlationId, recipientIds: [manifest.recipientIdentityId], body: manifest.body,
    associations: [{ organizationId: manifest.organizationId, recordType: "rfp", recordId: manifest.rfpId }], consent: "transactional" }));
  expect(recordResult).toHaveBeenCalledWith(manifest, { outcome: "accepted", providerMessageId: "provider-1" });
});
test("returns idle for a competing claim without sending", async () => {
  claim.mockResolvedValue(null); await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "idle" });
  expect(send).not.toHaveBeenCalled();
});
test.each([{ notificationId: randomUUID() }, { token: "bad" }, { recipientEmail: "bad" }, { attemptNumber: 4 },
  { sourceDigest: "bad" }, { organizationId: "bad" }, { subject: "Altered subject" }, { customerData: "private" }])("rejects a substituted private manifest %#", async change => {
  claim.mockResolvedValue({ ...manifest, ...change });
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
  expect(send).not.toHaveBeenCalled();
});
test("requires fresh source preflight before any send", async () => {
  canDispatch.mockResolvedValue(false); await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
  expect(send).not.toHaveBeenCalled(); expect(recordResult).toHaveBeenCalledWith(manifest, { outcome: "needs_attention", failureCode: "source_changed" });
});
test.each(["rate_limited_pre_dispatch", "provider_unavailable_pre_dispatch", "invalid_recipient_pre_dispatch"])("retains definite failure %s without automatic retry", async failureCode => {
  send.mockResolvedValue({ ...accepted, state: "failed", providerMessageId: null, failureCode, retryable: true });
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "failed" });
  expect(send).toHaveBeenCalledOnce(); expect(claim).toHaveBeenCalledOnce();
});
test("requires operator review after the third definite failure and keeps the original attempt result", async () => {
  const finalAttempt = { ...manifest, attemptNumber: 3 };
  claim.mockResolvedValue(finalAttempt);
  send.mockResolvedValue({ ...accepted, state: "failed", providerMessageId: null, failureCode: "provider_unavailable_pre_dispatch", retryable: true });
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
  expect(recordResult).toHaveBeenCalledWith(finalAttempt, { outcome: "failed", failureCode: "provider_unavailable_pre_dispatch" });
  expect(send).toHaveBeenCalledOnce();
});
test.each([{ communicationId: randomUUID() }, { providerMessageId: null }, { state: "delivered" }, { retryable: true },
  { failureCode: "provider_timeout" }, { secret: "private" }])("does not turn uncertain provider result %# into a resend", async change => {
  send.mockResolvedValue({ ...accepted, ...change });
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
  expect(recordResult).toHaveBeenCalledWith(manifest, { outcome: "needs_attention", failureCode: "outcome_unknown" });
});
test("retains uncertainty after transport or receipt failure", async () => {
  send.mockRejectedValue(new Error("private provider credential"));
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
  expect(send).toHaveBeenCalledOnce();
  send.mockResolvedValue(accepted); recordResult.mockRejectedValue(new Error("private database URL"));
  await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
});
test("does not report acceptance for an expired or rejected result record", async () => {
  recordResult.mockResolvedValue(false); await expect(runRfpNotificationWorker(manifest.notificationId, deps)).resolves.toEqual({ outcome: "needs_attention" });
});
test("never acquires a lease for invalid identifiers", async () => {
  await expect(runRfpNotificationWorker("bad", deps)).resolves.toEqual({ outcome: "failed" }); expect(claim).not.toHaveBeenCalled();
});
