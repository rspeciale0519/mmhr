import { beforeEach, expect, test, vi } from "vitest";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";

import {
  EvaluationDisclosureError,
  getEvaluationDisclosureReview,
  getEvaluationDisclosures,
  recordEvaluationDisclosure,
} from "./evaluation-disclosure";

vi.mock("@/server/auth/authorization", async () => ({
  ...await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"),
  requirePermission: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const candidateId2 = "44444444-4444-4444-8444-444444444444";
const disclosureId = "55555555-5555-4555-8555-555555555555";
const correlationId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";
const otherId = "88888888-8888-4888-8888-888888888888";
const digest = "a".repeat(64);
const discussionAt = "2026-09-09T12:00:00-04:00";
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;

const context: AuthorizationContext = {
  identityId: "99999999-9999-4999-8999-999999999999",
  correlationId,
  supabase,
  assurance: "aal1",
  scope: { kind: "organization", organizationId },
};
const adminContext: AuthorizationContext = {
  ...context,
  assurance: "aal2",
  scope: { kind: "platform" },
};

const reviewInput = { organizationId, intakeId, correlationId, pageSize: 25 };
const disclosureInput = {
  organizationId,
  intakeId,
  candidateId,
  expectedReviewDigest: digest,
  discussionAt,
  discussionReference: "Call with customer",
  conflictDisclosure: "No conflict to disclose",
  reason: "Customer requested the discussion",
  correlationId,
  idempotencyKey,
};

function reviewItem(id: string, patch: Record<string, unknown> = {}) {
  return {
    candidateId: id,
    candidateRevision: 3,
    source: "initial" as const,
    state: "active" as const,
    maskedLabel: "Option 1",
    providerName: "Provider One",
    productName: "Product One",
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    publicationSequence: 2,
    reviewDigest: digest,
    canDisclose: true,
    lastDisclosureAt: null,
    ...patch,
  };
}

function reviewResponse(patch: Record<string, unknown> = {}) {
  return {
    organizationId,
    intakeId,
    items: [reviewItem(candidateId)],
    nextCursor: null,
    correlationId,
    ...patch,
  };
}

function disclosuresResponse(patch: Record<string, unknown> = {}) {
  return {
    organizationId,
    intakeId,
    items: [{
      disclosureId,
      candidateId,
      maskedLabel: "Option 1",
      providerName: "Provider One",
      productName: "Product One",
      conflictDisclosure: "No conflict to disclose",
      disclosedAt: discussionAt,
      discussionAt,
    }],
    nextCursor: null,
    correlationId,
    ...patch,
  };
}

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope) =>
    scope.kind === "platform" ? adminContext : context);
});

test("requires staff disclosure and administration authority before reading provider names", async () => {
  rpc.mockResolvedValue({ data: reviewResponse(), error: null });

  await expect(getEvaluationDisclosureReview(reviewInput, { supabase })).resolves.toMatchObject({
    organizationId,
    intakeId,
    items: [{ candidateId, canDisclose: true }],
  });
  expect(requirePermission).toHaveBeenNthCalledWith(1,
    "evaluation.disclose",
    { kind: "organization", organizationId },
    { supabase, correlationId },
  );
  expect(requirePermission).toHaveBeenNthCalledWith(2, "admin.access", { kind: "platform" }, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_evaluation_disclosure_review", {
    payload: { organizationId, intakeId, pageSize: 25 },
    correlation_id: correlationId,
  });
});

test("reads disclosure history without accepting actor input", async () => {
  rpc.mockResolvedValue({ data: disclosuresResponse(), error: null });

  await expect(getEvaluationDisclosures(reviewInput, { supabase })).resolves.toMatchObject({
    items: [{ disclosureId, candidateId }],
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_evaluation_disclosures", {
    payload: { organizationId, intakeId, pageSize: 25 },
    correlation_id: correlationId,
  });
});

test("records a disclosure through both organization and platform authority", async () => {
  rpc.mockResolvedValue({
    data: { organizationId, intakeId, candidateId, disclosureId, correlationId, outcomeCode: "recorded" },
    error: null,
  });
  vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce(adminContext);

  await expect(recordEvaluationDisclosure(disclosureInput, { supabase })).resolves.toMatchObject({
    organizationId, intakeId, candidateId, outcomeCode: "recorded",
  });
  expect(requirePermission).toHaveBeenNthCalledWith(
    1,
    "evaluation.disclose",
    { kind: "organization", organizationId },
    { supabase, correlationId },
  );
  expect(requirePermission).toHaveBeenNthCalledWith(
    2,
    "admin.access",
    { kind: "platform" },
    { supabase, correlationId },
  );
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_record_evaluation_disclosure", {
    payload: {
      organizationId, intakeId, candidateId, expectedReviewDigest: digest, discussionAt,
      discussionReference: "Call with customer", conflictDisclosure: "No conflict to disclose",
      reason: "Customer requested the discussion",
    },
    correlation_id: correlationId,
    idempotency_key: idempotencyKey,
  });
});

test.each([
  { organizationId, intakeId, correlationId, pageSize: 0 },
  { organizationId, intakeId, correlationId, pageSize: 51 },
  { organizationId, intakeId, correlationId, pageSize: 1.5 },
  { organizationId, intakeId, correlationId, actorIdentityId: otherId },
  { organizationId, intakeId, correlationId, afterId: "not-a-uuid" },
])("rejects malformed read input before authorization %#", async (input) => {
  await expect(getEvaluationDisclosureReview(input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { ...disclosureInput, actorIdentityId: otherId },
  { ...disclosureInput, expectedReviewDigest: "A".repeat(64) },
  { ...disclosureInput, discussionReference: "   " },
  { ...disclosureInput, conflictDisclosure: "x".repeat(2_001) },
  { ...disclosureInput, reason: "" },
])("rejects malformed disclosure input before authorization %#", async (input) => {
  await expect(recordEvaluationDisclosure(input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { organizationId: otherId },
  { correlationId: otherId },
])("rejects a mismatched read scope or correlation before RPC %#", async (patch) => {
  await expect(getEvaluationDisclosureReview({ ...reviewInput, ...patch }, { supabase }))
    .rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test("fails closed when the customer authorization context is scoped or correlated incorrectly", async () => {
  vi.mocked(requirePermission).mockResolvedValueOnce({
    ...context,
    scope: { kind: "organization", organizationId: otherId },
  });
  await expect(getEvaluationDisclosureReview(reviewInput, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { ...adminContext, identityId: otherId },
  { ...adminContext, correlationId: otherId },
  { ...adminContext, scope: { kind: "organization", organizationId } },
  { ...adminContext, supabase: { rpc } as unknown as RequestSupabaseClient },
].map((value) => value as AuthorizationContext))("rejects a disclosure when platform authority is not the same verified request identity %#", async (invalidAdmin) => {
  vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce(invalidAdmin);
  await expect(recordEvaluationDisclosure(disclosureInput, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { data: null, error: { code: "42501", message: "private denial" } },
  { data: null, error: { code: "XX000", message: "private database detail" } },
  null,
] as const)("maps RPC errors to bounded disclosure errors %#", async (response) => {
  rpc.mockResolvedValue(response);
  const expected = response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE";
  await expect(getEvaluationDisclosureReview(reviewInput, { supabase })).rejects.toMatchObject({
    code: expected,
    message: "Evaluation disclosure request failed",
  });
});

test("does not expose unexpected RPC details", async () => {
  rpc.mockRejectedValue(new Error("private database detail"));
  await expect(getEvaluationDisclosures(reviewInput, { supabase })).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Evaluation disclosure request failed",
  });
  expect(new EvaluationDisclosureError("UNAVAILABLE").message).toBe("Evaluation disclosure request failed");
});

test.each([
  { items: [reviewItem(candidateId2), reviewItem(candidateId)] },
  { items: [reviewItem(candidateId), reviewItem(candidateId)] },
  { items: [reviewItem(candidateId, { canDisclose: true, publicationId: null })] },
  { items: [reviewItem(candidateId, { maskedLabel: "" })] },
  { items: [reviewItem(candidateId, { privateProviderId: otherId })] },
])("rejects unsafe review responses %#", async (patch) => {
  rpc.mockResolvedValue({ data: reviewResponse(patch), error: null });
  await expect(getEvaluationDisclosureReview(reviewInput, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  { nextCursor: otherId },
  { items: [reviewItem(candidateId), reviewItem(candidateId2)], nextCursor: null },
  { items: [reviewItem(candidateId2)], nextCursor: candidateId },
])("rejects incoherent review pagination %#", async (patch) => {
  rpc.mockResolvedValue({ data: reviewResponse(patch), error: null });
  await expect(getEvaluationDisclosureReview({ ...reviewInput, pageSize: 1 }, { supabase }))
    .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("requires a full page when a review cursor is returned and enforces afterId", async () => {
  const page = reviewResponse({
    items: [reviewItem(candidateId), reviewItem(candidateId2)],
    nextCursor: candidateId2,
  });
  rpc.mockResolvedValue({ data: page, error: null });
  await expect(getEvaluationDisclosureReview({ ...reviewInput, pageSize: 2 }, { supabase })).resolves.toMatchObject({ nextCursor: candidateId2 });

  rpc.mockResolvedValue({ data: page, error: null });
  await expect(getEvaluationDisclosureReview({ ...reviewInput, afterId: candidateId2, pageSize: 2 }, { supabase }))
    .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("validates disclosure output scope, correlation, and replay outcome", async () => {
  rpc.mockResolvedValue({
    data: { organizationId, intakeId, candidateId, disclosureId, correlationId, outcomeCode: "replayed" },
    error: null,
  });
  vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce(adminContext);
  await expect(recordEvaluationDisclosure(disclosureInput, { supabase })).resolves.toMatchObject({ outcomeCode: "replayed" });

  rpc.mockResolvedValue({
    data: { organizationId: otherId, intakeId, candidateId, disclosureId, correlationId, outcomeCode: "recorded" },
    error: null,
  });
  vi.mocked(requirePermission).mockResolvedValueOnce(context).mockResolvedValueOnce(adminContext);
  await expect(recordEvaluationDisclosure(disclosureInput, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
