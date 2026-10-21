import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { createCrmExportRequest, decideCrmExport } from "./crm-export-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const exportId = "22222222-2222-4222-8222-222222222222";
const decisionId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
const reviewerId = "55555555-5555-4555-8555-555555555555";
const correlationId = "66666666-6666-4666-8666-666666666666";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: actorId,
  scope: { kind: "organization", organizationId },
  assurance: "aal2",
  correlationId,
} as const satisfies AuthorizationContext;

const request = {
  exportId,
  organizationId,
  requestedByIdentityId: actorId,
  resource: "contact" as const,
  fields: ["recordId", "status"],
  purpose: "Approved CRM migration",
  requestedAt: "2026-09-01T18:00:00.000Z",
};
const decision = {
  decisionId,
  exportId,
  organizationId,
  reviewerIdentityId: reviewerId,
  decision: "approved" as const,
  decidedAt: "2026-09-01T18:01:00.000Z",
  reason: null,
};

describe("CRM export database boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test("creates a pending request through the fixed RPC", async () => {
    rpc.mockResolvedValue({
      data: { exportId, organizationId, state: "pending", decisionId: null, outcomeCode: "created", correlationId: exportId },
      error: null,
    });
    await expect(createCrmExportRequest(request, { supabase })).resolves.toMatchObject({ exportId, state: "pending" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_create_crm_export_request", {
      payload: request, correlation_id: exportId, idempotency_key: exportId,
    });
  });

  test("requires the caller to be the requester and preserves denial", async () => {
    await expect(createCrmExportRequest({ ...request, requestedByIdentityId: reviewerId }, { supabase }))
      .rejects.toBeInstanceOf(AuthorizationError);
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(createCrmExportRequest(request, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("records a decision through the explicit export permission", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ...context, identityId: reviewerId });
    rpc.mockResolvedValue({
      data: { exportId, organizationId, state: "approved", decisionId, outcomeCode: "decided", correlationId: decisionId },
      error: null,
    });
    await expect(decideCrmExport(decision, { supabase })).resolves.toMatchObject({ exportId, state: "approved", decisionId });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "audit.export", { kind: "organization", organizationId }, { supabase },
    );
  });

  test("rejects malformed responses and provider errors", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ...context, identityId: reviewerId });
    rpc.mockResolvedValue({ data: { state: "approved" }, error: null });
    await expect(decideCrmExport(decision, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    rpc.mockResolvedValue({ data: null, error: new Error("private detail") });
    await expect(decideCrmExport(decision, { supabase })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
