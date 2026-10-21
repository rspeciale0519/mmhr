import { describe, expect, test } from "vitest";

import {
  evaluateDeletionEligibility,
  parseDeletionDecision,
  parseDeletionRequest,
} from "./retention-contract";

const request = {
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  subjectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  requestedAt: "2026-08-01T00:00:00Z",
  dueAt: "2026-08-15T00:00:00Z",
  legalHold: false,
  retentionUntil: null,
};

describe("retention contract", () => {
  test("parses a strict deletion request", () => {
    expect(parseDeletionRequest(request)).toEqual(request);
  });

  test.each([
    { ...request, email: "private@example.test" },
    { ...request, reason: "private free text" },
    { ...request, dueAt: "2026-09-01T00:00:00Z" },
    { ...request, retentionUntil: "2026-07-31T00:00:00Z" },
  ])("rejects PII, free text, or unsafe windows: %j", (value) => {
    expect(() => parseDeletionRequest(value)).toThrow("Invalid deletion request");
  });

  test("blocks deletion during legal hold and retention period", () => {
    expect(evaluateDeletionEligibility({ ...request, legalHold: true }, "2026-08-31T00:00:00Z")).toEqual({
      eligible: false,
      reason: "legal_hold",
    });
    expect(evaluateDeletionEligibility({ ...request, retentionUntil: "2026-09-30T00:00:00Z" }, "2026-08-31T00:00:00Z")).toEqual({
      eligible: false,
      reason: "retention_period",
    });
  });

  test("keeps a request pending until its due date", () => {
    expect(evaluateDeletionEligibility(request, "2026-08-14T23:59:59Z")).toEqual({
      eligible: false,
      reason: "deadline_pending",
    });
  });

  test("allows a reviewed request after all holds and deadlines clear", () => {
    expect(evaluateDeletionEligibility(request, "2026-08-15T00:00:00Z")).toEqual({
      eligible: true,
      reason: "ready",
    });
  });

  test("requires an opaque audit reference for every decision", () => {
    expect(parseDeletionDecision({
      requestId: request.requestId,
      decidedAt: "2026-08-15T00:00:00Z",
      decision: "approved",
      auditReference: "privacy.deletion.review.1",
    })).toEqual({
      requestId: request.requestId,
      decidedAt: "2026-08-15T00:00:00Z",
      decision: "approved",
      auditReference: "privacy.deletion.review.1",
    });
    expect(() => parseDeletionDecision({ ...request, decision: "approved" })).toThrow("Invalid deletion decision");
  });

  test("rejects malformed evaluation timestamps", () => {
    expect(() => evaluateDeletionEligibility(request, "now")).toThrow("Invalid deletion evaluation timestamp");
  });
});
