import { describe, expect, test } from "vitest";

import type { AiRun } from "./ai-service";
import { applyAiRunApproval, recordAiRunResult } from "./ai-run-record";
import {
  InMemoryAiRunRecordRepository,
} from "./ai-run-record-repository";

const successRun: AiRun<{ answer: string }> = {
  runId: "run:repository-0001",
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
  outputArtifactId: "ai-output:repository-0001",
};

function record() {
  return recordAiRunResult(successRun, metadata);
}

function approval(decision: "approved" | "rejected" = "approved") {
  return {
    reviewerId: "identity:reviewer-1",
    decision,
    approvalReference: "approval:repository-0001",
    decidedAt: "2026-08-31T12:01:00.000Z",
    reason: "Reviewed against source document",
  };
}

describe("AI run record repository", () => {
  test("validates and appends only an undecided initial record", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const stored = await repository.append(record());

    expect(stored).toEqual(record());
    expect(Object.isFrozen(stored)).toBe(true);
    await expect(repository.append(record())).rejects.toMatchObject({ code: "DUPLICATE_RUN" });
    await expect(repository.append({ ...record(), unexpected: true })).rejects.toMatchObject({ code: "INVALID_RECORD" });
  });

  test("does not allow an approved snapshot to bypass the decision append", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const approved = applyAiRunApproval(record(), approval());

    await expect(repository.append(approved)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  test("appends approval revisions and keeps the full immutable history", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const initial = await repository.append(record());
    const decided = await repository.decide(initial.runId, approval());
    const history = await repository.history(initial.runId);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ status: "review_required", review: { decision: "pending" } });
    expect(history[1]).toBe(decided);
    expect((await repository.get(initial.runId))?.status).toBe("approved");
    expect(Object.isFrozen(history)).toBe(true);
    expect(() => {
      (decided as { status: string }).status = "rejected";
    }).toThrow();
  });

  test("keeps failed runs durable and out of the publication path", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const failed: AiRun<never> = {
      ...successRun,
      runId: "run:repository-failed",
      status: "failed",
      output: undefined,
      failureCode: "provider_timeout",
      completedAt: "2026-08-31T12:00:01.000Z",
    };
    const stored = await repository.append(recordAiRunResult(failed, { ...metadata, outputArtifactId: undefined }));

    expect(stored.failure?.code).toBe("provider_timeout");
    expect(await repository.get(stored.runId)).toBe(stored);
    expect(await repository.publishable(stored.runId)).toBeNull();
    expect(await repository.pendingReview()).toEqual([]);
  });

  test("shows only pending review records and publishes only approved records", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const initial = await repository.append(record());

    expect((await repository.pendingReview()).map((entry) => entry.runId)).toEqual([initial.runId]);
    expect(await repository.publishable(initial.runId)).toBeNull();

    await repository.decide(initial.runId, approval());
    expect(await repository.pendingReview()).toEqual([]);
    expect((await repository.publishable(initial.runId))?.status).toBe("approved");
  });

  test("allows only one concurrent decision and rejects replay", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const initial = await repository.append(record());
    const results = await Promise.allSettled([
      repository.decide(initial.runId, approval()),
      repository.decide(initial.runId, { ...approval(), approvalReference: "approval:repository-0002" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: { code: "INVALID_TRANSITION" },
    });
    expect(await repository.history(initial.runId)).toHaveLength(2);
  });

  test("fails closed for malformed identifiers and missing runs", async () => {
    const repository = new InMemoryAiRunRecordRepository();

    await expect(repository.get("not valid")).rejects.toMatchObject({ code: "INVALID_RUN_ID" });
    await expect(repository.history("run:missing")).resolves.toEqual([]);
    await expect(repository.decide("run:missing", approval())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("does not mutate history after malformed approvals", async () => {
    const repository = new InMemoryAiRunRecordRepository();
    const initial = await repository.append(record());

    await expect(repository.decide(initial.runId, { reviewerId: "bad value" })).rejects.toMatchObject({
      code: "INVALID_APPROVAL",
    });
    expect(await repository.history(initial.runId)).toHaveLength(1);
  });
});
