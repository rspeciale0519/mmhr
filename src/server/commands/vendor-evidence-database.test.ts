import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import { approveVendorEvidence, recordVendorEvidence, getVendorEvidence } from "./vendor-evidence-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error { constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; } }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const vendorProfileId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const factId = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555";
const approvalId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = { supabase, identityId: actorId, scope: { kind: "organization", organizationId }, assurance: "aal2", correlationId: evidenceId } as const satisfies AuthorizationContext;
const source = { sourceId, organizationId, vendorProfileId, uri: "https://vendor.example.invalid/facts", sourceType: "manual", licenseNote: null, capturedAt: "2026-09-01T00:00:00.000Z", active: true };
const fact = { factId, organizationId, vendorProfileId, productId: null, fieldKey: "supports_sso", value: "Yes", observedAt: "2026-09-01T00:00:00.000Z", status: "draft" as const };
const evidence = { evidenceId, organizationId, factId, sourceId, version: 1, contentHash: "a".repeat(64), capturedAt: "2026-09-01T00:00:00.000Z", freshUntil: "2027-09-01T00:00:00.000Z", citation: "Vendor documentation" };

describe("vendor evidence database boundary", () => {
  beforeEach(() => { rpc.mockReset(); vi.mocked(requirePermission).mockReset().mockResolvedValue(context); });
  test("records a draft evidence bundle through the fixed RPC", async () => {
    rpc.mockResolvedValue({ data: { sourceId, factId, evidenceId, approvalId: null, organizationId, outcomeCode: "recorded", correlationId: evidenceId }, error: null });
    await expect(recordVendorEvidence({ source, fact, evidence }, { supabase })).resolves.toMatchObject({ evidenceId, outcomeCode: "recorded" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("mmhr_record_vendor_evidence");
  });
  test("preserves renewal concurrency checks in the command payload", async () => {
    rpc.mockResolvedValue({ data: { sourceId, factId, evidenceId, approvalId: null, organizationId, outcomeCode: "recorded", correlationId: evidenceId }, error: null });
    await recordVendorEvidence({ source, fact, evidence: { ...evidence, version: 2 }, expectedEvidenceVersion: 1 }, { supabase });
    expect(rpc.mock.calls[0][1].payload.expectedEvidenceVersion).toBe(1);
    rpc.mockClear();
    await expect(recordVendorEvidence({ source, fact, evidence, expectedEvidenceVersion: 1 }, { supabase }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });
  test("requires caller identity for approval", async () => {
    const approval = { approvalId, organizationId, evidenceId, reviewerIdentityId: "88888888-8888-4888-8888-888888888888", decision: "approved" as const, decidedAt: "2026-09-01T00:00:00.000Z", reason: null };
    await expect(approveVendorEvidence(approval, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  });
  test.each([
    { evidence: { ...evidence, factId: sourceId } },
    { evidence: { ...evidence, sourceId: factId } },
    { fact: { ...fact, status: "published" } },
    { actorIdentityId: actorId },
  ])("rejects inconsistent evidence bundles before recording %#", async (patch) => {
    await expect(recordVendorEvidence({ source, fact, evidence, ...patch }, { supabase }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  test("maps provider failures without exposing details", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("private detail") });
    await expect(recordVendorEvidence({ source, fact, evidence }, { supabase })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  test("reads a scoped saved evidence page with staff authority", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ ...context, scope: { kind: "platform" } });
    const page = { organizationId, readAt: evidence.capturedAt, items: [{ productName: null, source, fact, evidence, review: null }], nextCursor: null };
    rpc.mockResolvedValue({ data: page, error: null });
    await expect(getVendorEvidence({ organizationId }, { supabase })).resolves.toEqual(page);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_vendor_evidence", { payload: { organizationId, limit: 25 } });
  });
  test.each([
    { organizationId: actorId },
    { items: [{ source, fact, evidence: { ...evidence, sourceId: factId }, review: null }] },
    { nextCursor: evidenceId },
  ])("rejects wrong-scope or incomplete evidence pages %#", async (patch) => {
    vi.mocked(requirePermission).mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ ...context, scope: { kind: "platform" } });
    rpc.mockResolvedValue({ data: { organizationId, readAt: evidence.capturedAt, items: [], nextCursor: null, ...patch }, error: null });
    await expect(getVendorEvidence({ organizationId }, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
