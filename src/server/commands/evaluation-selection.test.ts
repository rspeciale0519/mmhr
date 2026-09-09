import { beforeEach, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission, type AuthorizationContext, type RequestSupabaseClient } from "@/server/auth/authorization";

import {
  EvaluationSelectionError,
  getInitialEvaluationSelections,
  selectInitialEvaluationOptions,
} from "./evaluation-selection";

vi.mock("@/server/auth/authorization", async () => ({
  ...await vi.importActual<typeof import("@/server/auth/authorization")>("@/server/auth/authorization"),
  requirePermission: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const selectionId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const optionOne = "77777777-7777-4777-8777-777777777777";
const optionTwo = "88888888-8888-4888-8888-888888888888";
const candidateOne = "99999999-9999-4999-8999-999999999999";
const candidateTwo = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const digest = "a".repeat(64);
const rpc = vi.fn();
const supabase = { rpc } as unknown as RequestSupabaseClient;
const context: AuthorizationContext = {
  identityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  correlationId,
  supabase,
  assurance: "aal1",
  scope: { kind: "organization", organizationId },
};
const input = {
  organizationId,
  intakeId,
  publicationId,
  expectedDigest: digest,
  optionIds: [optionOne, optionTwo],
  correlationId,
  idempotencyKey,
};
const result = (patch: Record<string, unknown> = {}) => ({
  selectionId,
  organizationId,
  intakeId,
  publicationId,
  inputDigest: digest,
  selectedCount: 2,
  initialCandidateCount: 2,
  items: [
    { optionId: optionOne, candidateId: candidateOne, ordinal: 1, maskedLabel: "Option 1" },
    { optionId: optionTwo, candidateId: candidateTwo, ordinal: 2, maskedLabel: "Option 2" },
  ],
  correlationId,
  outcomeCode: "created",
  ...patch,
});
const readInput = { organizationId, intakeId, correlationId };
const readResult = (patch: Record<string, unknown> = {}) => ({
  organizationId,
  intakeId,
  initialCandidateCount: 2,
  remainingInitialChoices: 3,
  items: [
    {
      selectionId,
      publicationId,
      publicationSequence: 1,
      optionId: optionOne,
      candidateId: candidateOne,
      ordinal: 1,
      maskedLabel: "Option 1",
      state: "proposed",
      selectedAt: "2026-09-09T00:00:00Z",
    },
    {
      selectionId,
      publicationId,
      publicationSequence: 1,
      optionId: optionTwo,
      candidateId: candidateTwo,
      ordinal: 2,
      maskedLabel: "Option 2",
      state: "active",
      selectedAt: "2026-09-09T00:01:00Z",
    },
  ],
  correlationId,
  ...patch,
});

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: result(), error: null });
  vi.mocked(requirePermission).mockReset().mockResolvedValue(context);
});

test("creates a bounded initial selection with customer input only", async () => {
  await expect(selectInitialEvaluationOptions(input, { supabase })).resolves.toMatchObject({ outcomeCode: "created" });
  expect(requirePermission).toHaveBeenCalledExactlyOnceWith("evaluation.select", { kind: "organization", organizationId }, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_select_initial_evaluation_options", {
    payload: { organizationId, intakeId, publicationId, expectedDigest: digest, optionIds: [optionOne, optionTwo] },
    correlation_id: correlationId,
    idempotency_key: idempotencyKey,
  });
});

test("accepts an exact replay without changing the requested scope or option set", async () => {
  rpc.mockResolvedValue({ data: result({ outcomeCode: "replayed" }), error: null });
  await expect(selectInitialEvaluationOptions(input, { supabase })).resolves.toMatchObject({ outcomeCode: "replayed" });
});

test("accepts selected options that retain noncontiguous publication ordinals", async () => {
  rpc.mockResolvedValue({ data: result({
    initialCandidateCount: 5,
    items: [
      { optionId: optionOne, candidateId: candidateOne, ordinal: 3, maskedLabel: "Option 3" },
      { optionId: optionTwo, candidateId: candidateTwo, ordinal: 6, maskedLabel: "Option 6" },
    ],
  }), error: null });
  await expect(selectInitialEvaluationOptions(input, { supabase })).resolves.toMatchObject({ initialCandidateCount: 5 });
});

test.each([
  { optionIds: [] }, { optionIds: [optionOne, optionOne] }, { optionIds: Array.from({ length: 6 }, () => optionOne) },
  { expectedDigest: "A".repeat(64) }, { actorIdentityId: otherId }, { vendorOrganizationId: otherId },
])("rejects invalid or identity-bearing mutation input before authority %#", async (patch) => {
  await expect(selectInitialEvaluationOptions({ ...input, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { scope: { kind: "organization", organizationId: otherId } },
  { correlationId: otherId },
])("rejects a mismatched selection authority %#", async (patch) => {
  vi.mocked(requirePermission).mockResolvedValueOnce({ ...context, ...patch } as AuthorizationContext);
  await expect(selectInitialEvaluationOptions(input, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { organizationId: otherId }, { intakeId: otherId }, { publicationId: otherId },
  { inputDigest: "b".repeat(64) }, { correlationId: otherId },
  { items: [{ ...result().items[0], optionId: otherId }, result().items[1]] },
  { items: result().items.map((item) => ({ ...item, maskedLabel: "Option 9" })) },
  { selectedCount: 1 }, { candidateId: otherId },
])("rejects unsafe selection responses %#", async (patch) => {
  rpc.mockResolvedValue({ data: result(patch), error: null });
  await expect(selectInitialEvaluationOptions(input, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test.each([
  [{ data: null, error: { code: "42501", message: "private" } }, "REJECTED"],
  [{ data: null, error: { code: "XX000", message: "private" } }, "UNAVAILABLE"],
  [null, "UNAVAILABLE"],
] as const)("returns bounded mutation errors %#", async (response, code) => {
  rpc.mockResolvedValue(response);
  await expect(selectInitialEvaluationOptions(input, { supabase })).rejects.toMatchObject({ code, message: "Evaluation selection request failed" });
});

test("reads selections through customer portal authority and keeps the correlation bound", async () => {
  rpc.mockResolvedValue({ data: readResult(), error: null });
  await expect(getInitialEvaluationSelections(readInput, { supabase })).resolves.toMatchObject({ remainingInitialChoices: 3 });
  expect(requirePermission).toHaveBeenCalledExactlyOnceWith("portal.customer.access", { kind: "organization", organizationId }, { supabase, correlationId });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_get_initial_evaluation_selections", {
    payload: { organizationId, intakeId }, correlation_id: correlationId,
  });
});

test("calculates remaining choices from the full initial candidate count", async () => {
  rpc.mockResolvedValue({ data: readResult({
    initialCandidateCount: 5,
    remainingInitialChoices: 0,
    items: [readResult().items[0]],
  }), error: null });
  await expect(getInitialEvaluationSelections(readInput, { supabase })).resolves.toMatchObject({
    initialCandidateCount: 5,
    remainingInitialChoices: 0,
    items: [expect.any(Object)],
  });
});

test("rejects identity-bearing read input before authority", async () => {
  const patch = { actorIdentityId: otherId };
  await expect(getInitialEvaluationSelections({ ...readInput, ...patch })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { organizationId: otherId }, { correlationId: otherId },
])("rejects mismatched read authority %#", async (patch) => {
  await expect(getInitialEvaluationSelections({ ...readInput, ...patch }, { supabase })).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  { organizationId: otherId }, { intakeId: otherId }, { correlationId: otherId },
  { initialCandidateCount: 1 }, { remainingInitialChoices: 2 },
  { items: readResult().items.map((item) => ({ ...item, candidateId: candidateOne })) },
  { items: [{ ...readResult().items[0], maskedLabel: "Option 3" }, readResult().items[1]] },
  { items: Array.from({ length: 6 }, (_, index) => ({ ...readResult().items[0], candidateId: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, ordinal: index + 1, maskedLabel: `Option ${index + 1}` })) },
])("rejects unsafe selection read responses %#", async (patch) => {
  rpc.mockResolvedValue({ data: readResult(patch), error: null });
  await expect(getInitialEvaluationSelections(readInput, { supabase })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

test("maps unexpected read failures without exposing their content", async () => {
  rpc.mockRejectedValue(new Error("private database detail"));
  await expect(getInitialEvaluationSelections(readInput, { supabase })).rejects.toMatchObject({
    code: "UNAVAILABLE", message: "Evaluation selection request failed",
  });
  expect(await Promise.resolve(new EvaluationSelectionError("UNAVAILABLE")).then((error) => error.message)).toBe("Evaluation selection request failed");
});
