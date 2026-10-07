import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getPortalClarifications, recordPortalClarification } from "./portal-clarification";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), correlationId = randomUUID(), recipientId = randomUUID(), normalizationId = randomUUID(), clarificationId = randomUUID();
const rpc = vi.fn(), supabase = { rpc } as never;
const ask = { organizationId, correlationId, recipientId, normalizationId, action: "ask", question: "Confirm the service terms.",
  deadlineAt: "2030-01-02T00:00:00Z", idempotencyKey: randomUUID() };
beforeEach(() => {
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ scope, correlationId: options!.correlationId!, identityId: randomUUID(), assurance: "aal2", supabase }));
  rpc.mockReset().mockResolvedValue({ error: null, data: { organizationId, correlationId, recipientId, normalizationId, clarificationId,
    replyNormalizationId: null, status: "pending", decision: "pending", outcomeCode: "recorded" } });
});
test("binds the staff question to the authorized organization and exact source response", async () => {
  await expect(recordPortalClarification(ask, { supabase })).resolves.toMatchObject({ clarificationId });
  expect(requirePermission).toHaveBeenCalledWith("rfp.approve", { kind: "organization", organizationId }, { supabase, correlationId });
  const { correlationId: correlation, idempotencyKey, ...payload } = ask;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_portal_response_clarification", { payload, correlation_id: correlation, idempotency_key: idempotencyKey });
});
test("rejects client actor fields before contacting the database", async () => {
  await expect(recordPortalClarification({ ...ask, actorIdentityId: randomUUID() })).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
test("denies a result with a changed recipient or response association", async () => {
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, recipientId: randomUUID(), normalizationId, clarificationId,
    replyNormalizationId: null, status: "pending", decision: "pending", outcomeCode: "recorded" } });
  await expect(recordPortalClarification(ask)).rejects.toThrow("Invalid clarification result");
});
test("keeps vendor answers under vendor portal permission", async () => {
  await recordPortalClarification({ organizationId, correlationId, idempotencyKey: randomUUID(), action: "reply", clarificationId,
    answer: "The existing terms remain correct.", changeSummary: "No response change.", replyNormalizationId: null });
  expect(requirePermission).toHaveBeenCalledWith("portal.vendor.access", { kind: "organization", organizationId }, { correlationId });
});
test("rejects database access errors and mismatched read metadata", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "42501" } });
  await expect(recordPortalClarification(ask)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({ error: null, data: { organizationId: randomUUID(), correlationId, items: [], nextCursor: null } });
  await expect(getPortalClarifications({ organizationId, correlationId, view: "customer", intakeId: randomUUID() })).rejects.toThrow("Invalid clarification page");
});

test("customer reads expose only the approved response identifier for a revised answer", async () => {
  const replyNormalizationId = randomUUID(), intakeId = randomUUID();
  const row = { clarificationId, recipientId, normalizationId: null, replyNormalizationId,
    latestNormalizationId: replyNormalizationId, latestRevision: 2, revision: 1, replyRevision: 2,
    providerName: "Synthetic provider", question: "Confirm the export frequency.", answer: "Daily export.",
    changeSummary: "The frequency is stated in response 2.", decisionReason: "The reviewed answer resolves the question.",
    deadlineAt: "2030-01-02T00:00:00Z", askedAt: "2030-01-01T00:00:00Z", answeredAt: "2030-01-01T01:00:00Z",
    status: "approved", decision: "accepted", canReply: false, canDecide: false, late: false };
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, items: [row], nextCursor: null } });
  await expect(getPortalClarifications({ organizationId, correlationId, view: "customer", intakeId }))
    .resolves.toMatchObject({ items: [{ normalizationId: null, replyNormalizationId }] });
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId,
    items: [{ ...row, normalizationId }], nextCursor: null } });
  await expect(getPortalClarifications({ organizationId, correlationId, view: "customer", intakeId }))
    .rejects.toThrow("Invalid clarification page");
});
