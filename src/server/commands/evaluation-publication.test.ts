import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";
import {
  getEvaluationPublication, prepareEvaluationPublication, publishEvaluationPublication,
  reviewEvaluationPublication, revokeEvaluationPublication,
} from "./evaluation-publication";

vi.mock("@/server/auth/authorization", async () => ({
  ...await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"),
  requirePermission: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const identityId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const otherId = "77777777-7777-4777-8777-777777777777";
const inputDigest = "a".repeat(64);
const configuration = { version: 1, criteria: [{ requirementKey: "payroll", factKey: "payroll", responsePath: ["value"] }] };
const common = { organizationId, correlationId, idempotencyKey };
const prepare = { ...common, intakeId, expectedRevision: 2, configuration };
const publish = { ...common, publicationId, expectedDigest: inputDigest, approvalReference: "review:1", reason: "Reviewed current options" };
const revoke = { ...common, publicationId, reason: "Review required" };
const read = { organizationId, intakeId, publicationId, correlationId };
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context: AuthorizationContext = {
  identityId, correlationId, supabase, assurance: "aal2", scope: { kind: "organization", organizationId },
};
const summary = (patch: Record<string, unknown> = {}) => ({
  publicationId, organizationId, intakeId, sequence: 2, configurationVersion: 2,
  state: "prepared", inputDigest, optionCount: 8, correlationId, outcomeCode: "prepared", ...patch,
});
function page(patch: Record<string, unknown> = {}) {
  return {
    publicationId, organizationId, intakeId, sequence: 2, configurationVersion: 2,
    state: "published", inputDigest, optionCount: 8, correlationId,
    options: Array.from({ length: 8 }, (_, index) => ({
      optionId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
      ordinal: index + 1, maskedLabel: `Option ${index + 1}`, eligibility: "eligible",
      deterministicScore: 10_000, confidenceBasisPoints: 10_000, fitReasons: ["payroll"], limitations: [],
      evidenceFreshAt: "2026-09-01T00:00:00Z", validUntil: "2026-10-01T00:00:00Z",
    })), nextOrdinal: null, ...patch,
  };
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: summary(), error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope) => ({ ...context, scope }));
});

test.each([
  [prepareEvaluationPublication, prepare, "prepare", "prepared"],
  [publishEvaluationPublication, publish, "publish", "published"],
  [revokeEvaluationPublication, revoke, "revoke", "revoked"],
] as const)("binds command %s to the same actor and authorized client", async (invoke, input, action, state) => {
  rpc.mockResolvedValue({ data: summary({ state, outcomeCode: state }), error: null });
  await expect(invoke(input, { supabase })).resolves.toMatchObject({ state });
  expect(requirePermission).toHaveBeenNthCalledWith(1, "evaluation.publish", context.scope, { correlationId, supabase });
  expect(requirePermission).toHaveBeenNthCalledWith(2, "admin.access", { kind: "platform" }, { correlationId, supabase });
  const { correlationId: correlation, idempotencyKey: key, ...payload } = input;
  expect(rpc).toHaveBeenCalledExactlyOnceWith(`mmhr_${action}_evaluation_publication`, {
    payload, correlation_id: correlation, idempotency_key: key,
  });
});

test.each([
  { actorIdentityId: identityId }, { organizationId: "bad" }, { expectedRevision: 0 },
  { expectedRevision: 1.5 }, { configuration: { ...configuration, criteria: [] } },
  { configuration: { version: 1, criteria: [{ requirementKey: "payroll", factKey: "commission_rate", responsePath: [] }] } },
])("rejects invalid prepare input before authority checks %#", async (patch) => {
  await expect(prepareEvaluationPublication({ ...prepare, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([1, 2, 3])("rejects commercial criteria in new format %i preparations", async (version) => {
  for (const factKey of ["commercial_relationship", "sponsorship", "advertising", "paid_placement", "partner_status"]) {
    await expect(prepareEvaluationPublication({
      ...prepare,
      configuration: { version, criteria: [{ requirementKey: "payroll", factKey, responsePath: [] }] },
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("passes reviewed delivery settings to the publication command", async () => {
  const reviewed = { version: 3, criteria: [{ requirementKey: "payroll", factKey: "payroll",
    responsePath: ["required"], capabilityMeaning: "presence", partnerAcceptance: {
      requirementKey: "payroll", responsePath: ["allowPayrollPartner"] } }] };
  await expect(prepareEvaluationPublication({ ...prepare, configuration: reviewed }, { supabase }))
    .resolves.toMatchObject({ state: "prepared" });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_prepare_evaluation_publication", {
    payload: { organizationId, intakeId, expectedRevision: 2, configuration: reviewed },
    correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
});
test.each([
  { scope: { kind: "organization", organizationId: otherId } }, { correlationId: otherId },
])("rejects mismatched primary authority %#", async (patch) => {
  vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, ...patch } as AuthorizationContext);
  await expect(prepareEvaluationPublication(prepare)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { identityId: otherId }, { scope: context.scope }, { correlationId: otherId },
])("rejects mismatched platform authority %#", async (patch) => {
  vi.mocked(requirePermission).mockResolvedValueOnce(context)
    .mockResolvedValueOnce({ ...context, scope: { kind: "platform" }, ...patch } as AuthorizationContext);
  await expect(publishEvaluationPublication(publish)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { organizationId: otherId }, { intakeId: otherId }, { correlationId: otherId },
  { configurationVersion: 3 }, { outcomeCode: "published", state: "published" }, { productId: otherId },
])("rejects wrong or identity-bearing write responses %#", async (patch) => {
  rpc.mockResolvedValue({ data: summary(patch), error: null });
  await expect(prepareEvaluationPublication(prepare)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("accepts exact replay even if a later decision revoked the publication", async () => {
  rpc.mockResolvedValue({ data: summary({ state: "revoked", outcomeCode: "replayed" }), error: null });
  await expect(publishEvaluationPublication(publish)).resolves.toMatchObject({ state: "revoked", outcomeCode: "replayed" });
});

test.each([{ publicationId: otherId }, { inputDigest: "b".repeat(64) }])("binds publication decisions to the requested record %#", async (patch) => {
  rpc.mockResolvedValue({ data: summary({ state: "published", outcomeCode: "published", ...patch }), error: null });
  await expect(publishEvaluationPublication(publish)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  [{ data: null, error: { code: "42501", message: "private information" } }, "REJECTED"],
  [{ data: null, error: { code: "XX000", message: "private information" } }, "UNAVAILABLE"],
  [null, "UNAVAILABLE"],
] as const)("returns bounded errors %#", async (response, code) => {
  rpc.mockResolvedValue(response);
  await expect(prepareEvaluationPublication(prepare)).rejects.toMatchObject({ code, message: "Evaluation publication request failed" });
});

test("maps unexpected exceptions without exposing their content", async () => {
  rpc.mockRejectedValue(new Error("private information"));
  await expect(prepareEvaluationPublication(prepare)).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Evaluation publication request failed" });
});

test("reads more than five options using only current customer portal authority", async () => {
  rpc.mockResolvedValue({ data: page(), error: null });
  await expect(getEvaluationPublication(read)).resolves.toMatchObject({ optionCount: 8 });
  expect(requirePermission).toHaveBeenCalledExactlyOnceWith("portal.customer.access", context.scope, { correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_evaluation_publication", {
    payload: { organizationId, intakeId, publicationId, afterOrdinal: 0, limit: 25, detailsVersion: 2 }, correlation_id: correlationId,
  });
});

test("requires internal authority to review a prepared version", async () => {
  rpc.mockResolvedValue({ data: page({ state: "prepared" }), error: null });
  await expect(reviewEvaluationPublication(read)).resolves.toMatchObject({ state: "prepared" });
  expect(requirePermission).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledWith("mmhr_review_evaluation_publication", {
    payload: { organizationId, intakeId, publicationId, afterOrdinal: 0, limit: 25, detailsVersion: 1 }, correlation_id: correlationId,
  });
});

test("keeps page boundaries exact across a partial final page", async () => {
  rpc.mockResolvedValue({ data: page({ options: page().options.slice(5) }), error: null });
  await expect(getEvaluationPublication({ ...read, afterOrdinal: 5, limit: 5 })).resolves.toMatchObject({ nextOrdinal: null });
  rpc.mockResolvedValue({ data: page({ options: page().options.slice(0, 5), nextOrdinal: 5 }), error: null });
  await expect(getEvaluationPublication({ ...read, limit: 5 })).resolves.toMatchObject({ nextOrdinal: 5 });
  rpc.mockResolvedValue({ data: page({ options: [] }), error: null });
  await expect(getEvaluationPublication({ ...read, afterOrdinal: 8 })).resolves.toMatchObject({ options: [] });
});

test.each([
  { state: "prepared" }, { organizationId: otherId }, { intakeId: otherId }, { publicationId: otherId },
  { correlationId: otherId }, { nextOrdinal: 8 }, { optionCount: 9 },
  { options: page().options.slice(1) }, { options: page().options.toReversed() },
  { options: [{ ...page().options[0], productId: otherId }] }, { inputSnapshot: {} },
])("rejects unsafe or incomplete customer pages %#", async (patch) => {
  rpc.mockResolvedValue({ data: page(patch), error: null });
  await expect(getEvaluationPublication(read)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([{ limit: 0 }, { limit: 51 }, { afterOrdinal: -1 }, { afterOrdinal: 0.5 }, { productId: otherId }])(
  "rejects invalid read parameters %#", async (patch) => {
    await expect(getEvaluationPublication({ ...read, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
  },
);
