import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getPortalResponses, submitPortalResponse } from "./rfp-portal-response";
vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), recipientId = randomUUID(), correlationId = randomUUID(), normalizationId = randomUUID();
const response = { supportedRequirements: ["Supported with limits"], unsupportedRequirements: [], caveats: [],
  dependencies: [], commitments: [], implementationDetails: [], missingAnswers: [], proposedFollowUps: [] };
const input = { organizationId, recipientId, correlationId, response, expectedRevision: 0, idempotencyKey: randomUUID() };
const rpc = vi.fn(), supabase = { rpc } as never;
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null, data: { organizationId, recipientId, correlationId, normalizationId, revision: 1, outcomeCode: "submitted" } });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ identityId: randomUUID(), scope, supabase, assurance: "aal1", correlationId: options!.correlationId! }));
});
test("binds submissions to the vendor organization and exact request metadata", async () => {
  await expect(submitPortalResponse(input, { supabase })).resolves.toMatchObject({ revision: 1 });
  const { correlationId: correlation, idempotencyKey, ...payload } = input;
  expect(requirePermission).toHaveBeenCalledWith("portal.vendor.access", { kind: "organization", organizationId }, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_submit_portal_response", { payload, correlation_id: correlation, idempotency_key: idempotencyKey });
});
test.each([{ organizationId: randomUUID() }, { recipientId: randomUUID() }, { correlationId: randomUUID() }, { revision: 2 }])("rejects an unrelated submission result %#", async (patch) => {
  rpc.mockResolvedValue({ error: null, data: { organizationId, recipientId, correlationId, normalizationId, revision: 1, outcomeCode: "submitted", ...patch } });
  await expect(submitPortalResponse(input)).rejects.toThrow("Invalid response result");
});
test.each([{ actorIdentityId: randomUUID() }, { expectedRevision: -1 }, { response: { ...response, caveats: [123] } },
  { response: { ...response, commitments: [" "] } }])("rejects invalid or privileged input before authorization %#", async (patch) => {
  await expect(submitPortalResponse({ ...input, ...patch })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled();
});
test("maps database access denial without exposing details", async () => {
  rpc.mockResolvedValue({ error: { code: "42501", message: "Private database details" }, data: null });
  await expect(submitPortalResponse(input)).rejects.toBeInstanceOf(AuthorizationError);
});
test("does not accept pending data from a customer response query", async () => {
  const intakeId = randomUUID();
  rpc.mockResolvedValue({ error: null, data: { organizationId, correlationId, request: null, currentRevision: null, nextCursor: null,
    items: [{ submissionId: randomUUID(), recipientId, normalizationId, rfpId: randomUUID(), version: 1, revision: 1,
      providerName: "Synthetic provider", response, state: "pending", submittedAt: "2026-09-30T12:00:00Z",
      approvedAt: null, reviewedByIdentityId: null, canReview: false, canApprove: false, isLatest: true, late: false }] } });
  await expect(getPortalResponses({ organizationId, intakeId, correlationId, view: "customer" })).rejects.toThrow("Invalid response page");
});
