import { beforeEach, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";

import { EvaluationPublicationError } from "./evaluation-publication";
import { getCurrentEvaluationPublication } from "./current-evaluation-publication";

vi.mock("@/server/auth/authorization", async () => ({
  ...await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"),
  requirePermission: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const otherId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context: AuthorizationContext = {
  identityId: "66666666-6666-4666-8666-666666666666",
  correlationId,
  supabase,
  assurance: "aal1",
  scope: { kind: "organization", organizationId },
};
const input = { organizationId, intakeId, correlationId, limit: 2 };
const option = (ordinal: number) => ({
  optionId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(ordinal).padStart(12, "0")}`,
  ordinal,
  maskedLabel: `Option ${ordinal}`,
  eligibility: "eligible" as const,
  deterministicScore: 10_000,
  confidenceBasisPoints: 10_000,
  fitReasons: ["payroll"],
  limitations: [],
  evidenceFreshAt: "2026-09-01T00:00:00Z",
  validUntil: "2026-10-01T00:00:00Z",
});
const publication = (patch: Record<string, unknown> = {}) => ({
  publicationId, organizationId, intakeId, sequence: 2, configurationVersion: 2,
  state: "published", inputDigest: digest, optionCount: 4,
  options: [option(1), option(2)], nextOrdinal: 2, correlationId, ...patch,
});
const response = (patch: Record<string, unknown> = {}) => ({ organizationId, intakeId, publication: publication(), correlationId, ...patch });

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: response(), error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
});

test("discovers the current publication through customer authority", async () => {
  await expect(getCurrentEvaluationPublication(input, { supabase })).resolves.toMatchObject({ publication: { publicationId } });
  expect(requirePermission).toHaveBeenCalledExactlyOnceWith("portal.customer.access", { kind: "organization", organizationId }, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_current_evaluation_publication", {
    payload: { organizationId, intakeId, limit: 2 }, correlation_id: correlationId,
  });
});

test("supports an empty current publication result", async () => {
  rpc.mockResolvedValue({ data: response({ publication: null }), error: null });
  await expect(getCurrentEvaluationPublication(input, { supabase })).resolves.toMatchObject({ publication: null });
});

test.each([{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { vendorOrganizationId: otherId }])(
  "rejects invalid or identity-bearing input before authority %#", async (patch) => {
  await expect(getCurrentEvaluationPublication({ ...input, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([{ organizationId: otherId }, { correlationId: otherId }])("rejects mismatched input authority %#", async (patch) => {
  await expect(getCurrentEvaluationPublication({ ...input, ...patch }, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([{ scope: { kind: "organization", organizationId: otherId } }, { correlationId: otherId }])(
  "rejects mismatched authorization context %#", async (patch) => {
    vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, ...patch } as AuthorizationContext);
    await expect(getCurrentEvaluationPublication(input, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
  },
);

test.each([
  { organizationId: otherId }, { intakeId: otherId }, { correlationId: otherId },
  { publication: { ...publication(), state: "prepared" } },
  { publication: { ...publication(), organizationId: otherId } },
  { publication: { ...publication(), options: [option(2), option(1)] } },
  { publication: { ...publication(), options: [option(1)], nextOrdinal: null } },
  { publication: { ...publication(), nextOrdinal: 3 } },
  { publication: { ...publication(), optionCount: 1 } },
  { publication: { ...publication(), options: [{ ...option(1), productId: otherId }, option(2)] } },
])("rejects unsafe current publication responses %#", async (patch) => {
  rpc.mockResolvedValue({ data: response(patch), error: null });
  await expect(getCurrentEvaluationPublication(input, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  [{ data: null, error: { code: "42501", message: "private" } }, "REJECTED"],
  [{ data: null, error: { code: "XX000", message: "private" } }, "UNAVAILABLE"],
  [null, "UNAVAILABLE"],
] as const)("returns bounded RPC errors %#", async (rpcResponse, code) => {
  rpc.mockResolvedValue(rpcResponse);
  await expect(getCurrentEvaluationPublication(input, { supabase })).rejects.toMatchObject({
    code, message: "Evaluation publication request failed",
  });
});

test("maps unexpected failures without exposing private details", async () => {
  rpc.mockRejectedValue(new Error("private database detail"));
  await expect(getCurrentEvaluationPublication(input, { supabase })).rejects.toMatchObject({
    code: "UNAVAILABLE", message: "Evaluation publication request failed",
  });
  expect(new EvaluationPublicationError("UNAVAILABLE").message).toBe("Evaluation publication request failed");
});
