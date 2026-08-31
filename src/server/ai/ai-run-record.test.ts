import { describe, expect, test } from "vitest";

import type { AiRun } from "./ai-service";
import {
  AiRunRecordError,
  aiRunRecordSchema,
  applyAiRunApproval,
  canPublishAiRun,
  createAiRunRecord,
  recordAiRunResult,
} from "./ai-run-record";

const successRun: AiRun<{ answer: string }> = {
  runId: "run:0001",
  status: "review_required",
  capability: "normalize_response",
  adapterId: "fixture",
  modelId: "fixture-v1",
  templateVersion: "response-v1",
  sourceReferences: ["document:0001"],
  output: { answer: "draft" },
  costCents: 3,
  startedAt: "2026-08-31T12:00:00.000Z",
  completedAt: "2026-08-31T12:00:00.125Z",
  reviewRequired: true,
};

const metadata = {
  dataClass: "internal" as const,
  schemaVersion: "response-schema-v1",
  inputArtifacts: [{
    artifactId: "document:0001",
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }],
  outputArtifactId: "ai-output:run:0001",
  usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
};

function record() {
  return recordAiRunResult(successRun, metadata);
}

describe("AI run records", () => {
  test("records provenance, hashes, usage, latency, and pending review", () => {
    const result = record();

    expect(result).toMatchObject({
      runId: "run:0001",
      capability: "normalize_response",
      dataClass: "internal",
      adapterId: "fixture",
      modelId: "fixture-v1",
      templateVersion: "response-v1",
      schemaVersion: "response-schema-v1",
      status: "review_required",
      outputArtifact: { artifactId: "ai-output:run:0001" },
      review: { decision: "pending", reviewerId: null },
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, costCents: 3, latencyMs: 125 },
    });
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.inputArtifacts)).toBe(true);
  });

  test("rejects a successful result without a persisted output artifact", () => {
    expect(() => recordAiRunResult(successRun, { ...metadata, outputArtifactId: undefined }))
      .toThrowError(new AiRunRecordError("INVALID_RECORD"));
  });

  test("keeps failed provider runs pending and without publishable output", () => {
    const failed: AiRun<never> = {
      ...successRun,
      status: "failed",
      output: undefined,
      failureCode: "provider_timeout",
      completedAt: "2026-08-31T12:00:01.000Z",
    };
    const result = recordAiRunResult(failed, metadata);
    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "provider_timeout", retryable: true },
      outputArtifact: null,
      outputHash: null,
      review: { decision: "pending" },
    });
    expect(canPublishAiRun(result)).toBe(false);
  });

  test("requires a human decision before publication", () => {
    const approved = applyAiRunApproval(record(), {
      reviewerId: "identity:reviewer-1",
      decision: "approved",
      approvalReference: "approval:0001",
      decidedAt: "2026-08-31T12:01:00.000Z",
      reason: "Reviewed against source document",
    });

    expect(approved.status).toBe("approved");
    expect(approved.review.decision).toBe("approved");
    expect(canPublishAiRun(approved)).toBe(true);
    expect(canPublishAiRun(record())).toBe(false);
  });

  test("rejects invalid approval input and replayed decisions", () => {
    expect(() => applyAiRunApproval(record(), {
      reviewerId: "not valid",
      decision: "approved",
      approvalReference: "approval:0001",
      decidedAt: "2026-08-31T12:01:00.000Z",
    })).toThrowError(new AiRunRecordError("INVALID_APPROVAL"));

    const approved = applyAiRunApproval(record(), {
      reviewerId: "identity:reviewer-1",
      decision: "approved",
      approvalReference: "approval:0001",
      decidedAt: "2026-08-31T12:01:00.000Z",
    });
    expect(() => applyAiRunApproval(approved, {
      reviewerId: "identity:reviewer-2",
      decision: "rejected",
      approvalReference: "approval:0002",
      decidedAt: "2026-08-31T12:02:00.000Z",
    })).toThrowError(new AiRunRecordError("INVALID_TRANSITION"));
  });

  test("rejects malformed records with unknown fields", () => {
    const parsed = aiRunRecordSchema.safeParse({ ...record(), unexpected: true });
    expect(parsed.success).toBe(false);
    expect(() => createAiRunRecord({ ...record(), unexpected: true })).toThrowError(
      new AiRunRecordError("INVALID_RECORD"),
    );
  });

  test("rejects unsupported output values without exposing them", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => recordAiRunResult({ ...successRun, output: circular }, metadata))
      .toThrowError(new AiRunRecordError("UNSAFE_OUTPUT"));
  });
});
