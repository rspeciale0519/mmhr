import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { recordCrmDuplicateCandidates } from "./crm-duplicate-database";

vi.mock("@/server/auth/authorization", () => {
  class MockAuthorizationError extends Error {
    constructor() { super("Request is not authorized"); this.name = "AuthorizationError"; }
  }
  return { AuthorizationError: MockAuthorizationError, requirePermission: vi.fn() };
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const otherRecordId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context = {
  supabase,
  identityId: actorId,
  scope: { kind: "organization", organizationId },
  assurance: "aal1",
  correlationId,
} as const satisfies AuthorizationContext;

describe("CRM duplicate database boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
  });

  test("detects normalized pairs and records them through the fixed RPC", async () => {
    rpc.mockResolvedValue({
      data: { batchId: "66666666-6666-4666-8666-666666666666", organizationId, insertedCount: 1, outcomeCode: "recorded", correlationId: "66666666-6666-4666-8666-666666666666" },
      error: null,
    });
    const result = await recordCrmDuplicateCandidates({ organizationId, rows: [
      { organizationId, resource: "contact", recordId, dedupeKey: "email:alex@example.invalid" },
      { organizationId, resource: "contact", recordId: otherRecordId, dedupeKey: "email:alex@example.invalid" },
    ] }, { supabase });
    expect(result.insertedCount).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("mmhr_record_crm_duplicate_candidates");
    expect(rpc.mock.calls[0]![1].payload.candidates[0]).toMatchObject({ resource: "contact", state: "open", signal: "normalized_key" });
  });

  test("rejects mixed organization rows before authorization", async () => {
    await expect(recordCrmDuplicateCandidates({ organizationId, rows: [
      { organizationId, resource: "contact", recordId, dedupeKey: "one" },
      { organizationId: "77777777-7777-4777-8777-777777777777", resource: "contact", recordId: otherRecordId, dedupeKey: "one" },
    ] }, { supabase })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  test("preserves authorization denials and RPC failures", async () => {
    const input = { organizationId, rows: [{ organizationId, resource: "contact", recordId, dedupeKey: "one" }] };
    vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
    await expect(recordCrmDuplicateCandidates(input, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    vi.mocked(requirePermission).mockResolvedValue(context);
    rpc.mockResolvedValue({ data: null, error: new Error("private detail") });
    await expect(recordCrmDuplicateCandidates(input, { supabase })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
