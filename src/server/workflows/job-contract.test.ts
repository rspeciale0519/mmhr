import { describe, expect, test } from "vitest";

import {
  JobContractError,
  cancelJob,
  completeJobAttempt,
  createJobRecord,
  manuallyRerunJob,
  prepareJobRequest,
  startJobAttempt,
  validateJobSubmission,
} from "./job-contract";

const ids = {
  job: "11111111-1111-4111-8111-111111111111",
  org: "22222222-2222-4222-8222-222222222222",
  correlation: "33333333-3333-4333-8333-333333333333",
  key: "44444444-4444-4444-8444-444444444444",
  attempt1: "55555555-5555-4555-8555-555555555555",
  attempt2: "66666666-6666-4666-8666-666666666666",
  admin: "77777777-7777-4777-8777-777777777777",
};

const now = "2026-08-31T12:00:00.000Z";
const later = "2026-08-31T12:01:00.000Z";
const retryAt = "2026-08-31T12:05:00.000Z";
const request = {
  jobId: ids.job,
  jobType: "document_scan" as const,
  organizationId: ids.org,
  correlationId: ids.correlation,
  idempotencyKey: ids.key,
  payloadReferences: ["document:abc123"],
};

function queued() {
  return createJobRecord(request, { now });
}

describe("job contract", () => {
  test("requires identifier-only payloads and normalizes UUID keys", () => {
    const parsed = prepareJobRequest({ ...request, idempotencyKey: ids.key.toUpperCase() });
    expect(parsed.idempotencyKey).toBe(ids.key);
    expect(() => prepareJobRequest({ ...request, payloadReferences: ["document body"] })).toThrow(JobContractError);
    expect(() => prepareJobRequest({ ...request, secret: "do not accept" })).toThrow(JobContractError);
  });

  test("creates queued and future scheduled durable records", () => {
    expect(queued()).toMatchObject({ state: "queued", attempts: [], attemptsInCycle: 0, rerunCount: 0 });
    expect(createJobRecord({ ...request, scheduleAt: retryAt }, { now })).toMatchObject({ state: "scheduled", scheduleAt: retryAt });
  });

  test("starts one automatic attempt and rejects duplicate or premature starts", () => {
    const job = startJobAttempt(queued(), { attemptId: ids.attempt1, startedAt: now });
    expect(job).toMatchObject({ state: "running", attemptsInCycle: 1, attempts: [{ attemptNumber: 1, trigger: "automatic" }] });
    expect(() => startJobAttempt(job, { attemptId: ids.attempt2, startedAt: later })).toThrow(JobContractError);
    expect(() => startJobAttempt(queued(), { attemptId: ids.attempt1, startedAt: "not-a-date" })).toThrow(JobContractError);
  });

  test("moves retryable failure to retry_pending with a future retry time", () => {
    const running = startJobAttempt(queued(), { attemptId: ids.attempt1, startedAt: now });
    const retrying = completeJobAttempt(running, ids.attempt1, {
      outcome: "failed",
      finishedAt: later,
      failure: { code: "provider_timeout", retryable: true },
      nextAttemptAt: retryAt,
    });
    expect(retrying).toMatchObject({ state: "retry_pending", nextAttemptAt: retryAt, lastFailure: { retryable: true } });
    expect(() => completeJobAttempt(running, ids.attempt1, {
      outcome: "failed", finishedAt: later, failure: { code: "provider_timeout", retryable: true }, nextAttemptAt: later,
    })).toThrow(JobContractError);
  });

  test("moves final retryable failure to needs_attention", () => {
    let job = createJobRecord({ ...request, maximumAttempts: 1 }, { now });
    job = startJobAttempt(job, { attemptId: ids.attempt1, startedAt: now });
    job = completeJobAttempt(job, ids.attempt1, {
      outcome: "failed", finishedAt: later,
      failure: { code: "provider_unavailable", retryable: true },
    });
    expect(job).toMatchObject({ state: "needs_attention", nextAttemptAt: null, attempts: [{ outcome: "failed" }] });
  });

  test("moves terminal failures to failed without scheduling a retry", () => {
    const running = startJobAttempt(queued(), { attemptId: ids.attempt1, startedAt: now });
    const failed = completeJobAttempt(running, ids.attempt1, {
      outcome: "failed", finishedAt: later,
      failure: { code: "policy_denied", retryable: false },
    });
    expect(failed.state).toBe("failed");
    expect(() => completeJobAttempt(running, ids.attempt1, {
      outcome: "failed", finishedAt: later,
      failure: { code: "policy_denied", retryable: false }, nextAttemptAt: retryAt,
    })).toThrow(JobContractError);
  });

  test("manual rerun preserves the job idempotency key and adds an audited attempt", () => {
    let job = createJobRecord({ ...request, maximumAttempts: 1 }, { now });
    job = startJobAttempt(job, { attemptId: ids.attempt1, startedAt: now });
    job = completeJobAttempt(job, ids.attempt1, {
      outcome: "failed", finishedAt: later,
      failure: { code: "provider_timeout", retryable: true },
    });
    const rerun = manuallyRerunJob(job, {
      attemptId: ids.attempt2, startedAt: retryAt, requestedBy: ids.admin, reason: "Source was corrected",
    });
    expect(rerun).toMatchObject({ jobId: ids.job, idempotencyKey: ids.key, state: "running", rerunCount: 1, attemptsInCycle: 1 });
    expect(rerun.attempts[1]).toMatchObject({ attemptNumber: 2, trigger: "manual", requestedBy: ids.admin, reason: "Source was corrected" });
    expect(() => manuallyRerunJob(rerun, { attemptId: ids.job, startedAt: retryAt, requestedBy: ids.admin, reason: "again" })).toThrow(JobContractError);
  });

  test("allows cancellation only before an attempt starts", () => {
    expect(cancelJob(queued(), later).state).toBe("cancelled");
    const running = startJobAttempt(queued(), { attemptId: ids.attempt1, startedAt: now });
    expect(() => cancelJob(running, later)).toThrow(JobContractError);
  });

  test("validates provider submission receipts", () => {
    expect(validateJobSubmission({ outcome: "created", jobId: ids.job, correlationId: ids.correlation, idempotencyKey: ids.key })).toMatchObject({ outcome: "created" });
    expect(() => validateJobSubmission({ outcome: "created", jobId: ids.job, correlationId: ids.correlation, idempotencyKey: ids.key, extra: true })).toThrow(JobContractError);
  });
});
