import { describe, expect, test, vi } from "vitest";

import { executeApprovedDeletion } from "./deletion-execution";

const id = "11111111-1111-4111-8111-111111111111";
const request = {
  requestId: id,
  subjectId: "22222222-2222-4222-8222-222222222222",
  requestedAt: "2026-09-01T00:00:00Z",
  dueAt: "2026-09-02T00:00:00Z",
  legalHold: false,
  retentionUntil: null,
};
const decision = {
  requestId: id,
  decidedAt: "2026-09-01T12:00:00Z",
  decision: "approved" as const,
  auditReference: "audit:deletion:1",
};
const correlationId = "33333333-3333-4333-8333-333333333333";

describe("approved deletion execution", () => {
  test("executes once after approval and eligibility checks", async () => {
    const deleteSubject = vi.fn().mockResolvedValue({ outcome: "succeeded", receiptReference: "provider:delete:1" });
    await expect(executeApprovedDeletion(request, decision, "2026-09-03T00:00:00Z", correlationId, { deleteSubject }))
      .resolves.toEqual({ outcome: "completed", reason: "completed", receiptReference: "provider:delete:1" });
    expect(deleteSubject).toHaveBeenCalledOnce();
    expect(deleteSubject).toHaveBeenCalledWith(request.subjectId, correlationId);
  });

  test.each([
    ["legal hold", { ...request, legalHold: true }, "legal_hold"],
    ["retention period", { ...request, retentionUntil: "2026-09-30T00:00:00Z" }, "retention_period"],
    ["deadline", request, "deadline_pending"],
  ] as const)("blocks %s before provider execution", async (_name, input, reason) => {
    const deleteSubject = vi.fn();
    const asOf = reason === "deadline_pending" || reason === "retention_period"
      ? "2026-09-01T12:00:00Z"
      : "2026-10-01T00:00:00Z";
    await expect(executeApprovedDeletion(input, decision, asOf, correlationId, { deleteSubject }))
      .resolves.toMatchObject({ outcome: "blocked", reason });
    expect(deleteSubject).not.toHaveBeenCalled();
  });

  test("blocks unapproved or mismatched requests", async () => {
    const deleteSubject = vi.fn();
    await expect(executeApprovedDeletion(request, { ...decision, decision: "held" }, "2026-09-03T00:00:00Z", correlationId, { deleteSubject }))
      .resolves.toMatchObject({ outcome: "blocked", reason: "not_approved" });
    await expect(executeApprovedDeletion(request, { ...decision, requestId: "44444444-4444-4444-8444-444444444444" }, "2026-09-03T00:00:00Z", correlationId, { deleteSubject }))
      .resolves.toMatchObject({ outcome: "blocked", reason: "request_mismatch" });
    expect(deleteSubject).not.toHaveBeenCalled();
  });

  test.each([
    [{ outcome: "unknown", retryable: true }, "provider_unknown"],
    [{ outcome: "rejected", reason: "provider_denied" }, "provider_rejected"],
    [{ unexpected: true }, "provider_unknown"],
  ] as const)("preserves provider outcome %j", async (providerResult, reason) => {
    await expect(executeApprovedDeletion(request, decision, "2026-09-03T00:00:00Z", correlationId, {
      deleteSubject: async () => providerResult,
    })).resolves.toMatchObject({ outcome: "failed", reason });
  });
});
