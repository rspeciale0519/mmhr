import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getRfpNotificationRecipients, getRfpNotificationStatus, queueRfpNotification, retryRfpNotification } from "./rfp-notifications";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const base = { organizationId: randomUUID(), rfpId: randomUUID(), version: 1, correlationId: randomUUID() };
const actor = randomUUID(), notificationId = randomUUID(), recipientId = randomUUID(), membershipId = randomUUID(), rpc = vi.fn();
const input = { ...base, notificationId, recipientId, membershipId, expectedSourceDigest: "a".repeat(64), idempotencyKey: randomUUID() };
const receipt = { ...base, notificationId, recipientId, membershipId, revision: 1, state: "queued", action: "queue", outcomeCode: "recorded" };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: receipt, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_key, scope, options) => ({
    identityId: actor, scope, assurance: "aal2", correlationId: options!.correlationId!, supabase: { rpc } as never,
  }));
});
test("requires matching current AAL2 scope and passes identifiers only", async () => {
  await expect(queueRfpNotification(input)).resolves.toEqual(receipt);
  expect(vi.mocked(requirePermission).mock.calls.map(([key]) => key)).toEqual(["rfp.distribute", "admin.access"]);
  const { correlationId, idempotencyKey, ...payload } = input;
  expect(rpc).toHaveBeenCalledWith("mmhr_queue_rfp_notification", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
});
test.each(["recipientEmail", "body", "providerMessageId", "actorIdentityId", "deliveryState", "attemptToken"])("rejects client-supplied %s", async field => {
  await expect(queueRfpNotification({ ...input, [field]: "private" })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled();
});
test.each([{ version: 0 }, { version: 10001 }, { notificationId: "bad" }, { expectedSourceDigest: "a" },
  { membershipId: "bad" }, { correlationId: "bad" }, { idempotencyKey: "bad" }])("rejects invalid queue boundary %#", async change => {
  await expect(queueRfpNotification({ ...input, ...change })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});
test.each(["actor", "scope", "correlation", "assurance"])("denies mismatched staff authorization %s", async change => {
  vi.mocked(requirePermission).mockImplementation(async (key, scope, options) => ({
    identityId: key === "admin.access" && change === "actor" ? randomUUID() : actor,
    scope: key === "rfp.distribute" && change === "scope" ? { kind: "organization", organizationId: randomUUID() } : scope,
    assurance: key === "admin.access" && change === "assurance" ? "aal1" : "aal2",
    correlationId: key === "admin.access" && change === "correlation" ? randomUUID() : options!.correlationId!, supabase: { rpc } as never,
  }));
  await expect(queueRfpNotification(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test.each(["notificationId", "recipientId", "membershipId", "organizationId", "rfpId", "correlationId"])("rejects substituted receipt %s", async field => {
  rpc.mockResolvedValue({ data: { ...receipt, [field]: randomUUID() }, error: null });
  await expect(queueRfpNotification(input)).rejects.toThrow("Invalid notification");
});
test.each([{ revision: 2 }, { version: 2 }, { action: "retry" }, { state: "accepted" }, { providerMessageId: "private" }])("rejects changed queue result %#", async change => {
  rpc.mockResolvedValue({ data: { ...receipt, ...change }, error: null }); await expect(queueRfpNotification(input)).rejects.toThrow();
});
test("binds a retry to its original action revision", async () => {
  const retry = { ...base, notificationId, expectedRevision: 3, idempotencyKey: randomUUID() };
  rpc.mockResolvedValue({ data: { ...receipt, action: "retry", revision: 4 }, error: null });
  await expect(retryRfpNotification(retry)).resolves.toMatchObject({ revision: 4, action: "retry" });
  rpc.mockResolvedValue({ data: { ...receipt, action: "retry", revision: 3 }, error: null });
  await expect(retryRfpNotification(retry)).rejects.toThrow("Invalid notification receipt");
});
test("binds recipient discovery and rejects duplicates", async () => {
  const item = { recipientId, membershipId, recipientIdentityId: randomUUID(), vendorOrganizationId: randomUUID(),
    recipientEmail: "vendor@example.invalid", sourceDigest: "a".repeat(64), deadlineAt: new Date().toISOString() };
  rpc.mockResolvedValue({ data: { ...base, items: [item] }, error: null });
  await expect(getRfpNotificationRecipients(base)).resolves.toMatchObject({ items: [item] });
  rpc.mockResolvedValue({ data: { ...base, items: [item, item] }, error: null });
  await expect(getRfpNotificationRecipients(base)).rejects.toThrow("Invalid notification recipients");
});
test("rejects false retry permission and duplicate status rows", async () => {
  const item = { notificationId, recipientId, membershipId, state: "accepted", revision: 3, attemptCount: 1,
    canRetry: true, failureCode: null, providerMessageId: "provider-1", createdAt: new Date().toISOString() };
  rpc.mockResolvedValue({ data: { ...base, items: [item] }, error: null });
  await expect(getRfpNotificationStatus(base)).rejects.toThrow("Invalid notification status");
  rpc.mockResolvedValue({ data: { ...base, items: [{ ...item, canRetry: false }, { ...item, canRetry: false }] }, error: null });
  await expect(getRfpNotificationStatus(base)).rejects.toThrow("Invalid notification status");
});
test("preserves denial types and hides provider details", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private" } });
  await expect(queueRfpNotification(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "private address" } });
  await expect(queueRfpNotification(input)).rejects.toThrow("Notification request failed");
});
