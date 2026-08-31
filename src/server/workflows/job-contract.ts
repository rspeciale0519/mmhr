import "server-only";

import { z } from "zod";

/**
 * Provider-neutral job lifecycle. A job record is the durable domain record;
 * Trigger.dev or another runner only delivers attempts for that record.
 */
export const jobTypes = [
  "rfp_distribution",
  "inbound_email",
  "document_scan",
  "content_acquisition",
  "communication_delivery",
] as const;

export const jobStates = [
  "queued",
  "scheduled",
  "running",
  "retry_pending",
  "needs_attention",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type JobType = (typeof jobTypes)[number];
export type JobState = (typeof jobStates)[number];

export const DEFAULT_MAXIMUM_ATTEMPTS = 3;
export const MAXIMUM_ATTEMPTS = 10;

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const identifier = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/,
  "Identifier contains unsupported characters",
);

/** Payloads carry references only. They must never carry secrets or content. */
export const jobRequestSchema = z.strictObject({
  jobId: uuid,
  jobType: z.enum(jobTypes),
  organizationId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
  payloadReferences: z.array(identifier).max(100),
  maximumAttempts: z.int().min(1).max(MAXIMUM_ATTEMPTS).default(DEFAULT_MAXIMUM_ATTEMPTS),
  scheduleAt: timestamp.nullable().default(null),
});

export type JobRequest = z.output<typeof jobRequestSchema>;

export const jobFailureCodes = [
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "network_error",
  "invalid_input",
  "not_found",
  "unauthorized",
  "conflict",
  "policy_denied",
  "unknown",
] as const;

export type JobFailureCode = (typeof jobFailureCodes)[number];

const retryableFailureCodes = new Set<JobFailureCode>([
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "network_error",
  "unknown",
]);

export const jobFailureSchema = z.strictObject({
  code: z.enum(jobFailureCodes),
  retryable: z.boolean(),
}).superRefine((failure, context) => {
  if (failure.retryable !== retryableFailureCodes.has(failure.code)) {
    context.addIssue({
      code: "custom",
      path: ["retryable"],
      message: "Failure retryability does not match its code",
    });
  }
});

export type JobFailure = z.output<typeof jobFailureSchema>;

export const jobAttemptSchema = z.strictObject({
  attemptId: uuid,
  jobId: uuid,
  attemptNumber: z.int().min(1),
  correlationId: uuid,
  trigger: z.enum(["automatic", "manual"]),
  requestedBy: identifier.nullable(),
  reason: z.string().trim().max(2_000).nullable(),
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
  outcome: z.enum(["running", "succeeded", "failed"]),
  failure: jobFailureSchema.nullable(),
}).superRefine((attempt, context) => {
  if (attempt.outcome === "running" && (attempt.finishedAt !== null || attempt.failure !== null)) {
    context.addIssue({ code: "custom", path: ["outcome"], message: "Running attempts cannot be finished" });
  }
  if (attempt.outcome !== "running" && attempt.finishedAt === null) {
    context.addIssue({ code: "custom", path: ["finishedAt"], message: "Finished attempts require finishedAt" });
  }
  if (attempt.outcome === "succeeded" && attempt.failure !== null) {
    context.addIssue({ code: "custom", path: ["failure"], message: "Successful attempts cannot have a failure" });
  }
  if (attempt.outcome === "failed" && attempt.failure === null) {
    context.addIssue({ code: "custom", path: ["failure"], message: "Failed attempts require a failure" });
  }
  if (attempt.finishedAt !== null && Date.parse(attempt.finishedAt) < Date.parse(attempt.startedAt)) {
    context.addIssue({ code: "custom", path: ["finishedAt"], message: "finishedAt cannot precede startedAt" });
  }
  if (attempt.trigger === "manual" && attempt.requestedBy === null) {
    context.addIssue({ code: "custom", path: ["requestedBy"], message: "Manual attempts require requestedBy" });
  }
  if (attempt.trigger === "manual" && (attempt.reason === null || attempt.reason.trim().length === 0)) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Manual attempts require a reason" });
  }
  if (attempt.trigger === "automatic" && attempt.requestedBy !== null) {
    context.addIssue({ code: "custom", path: ["requestedBy"], message: "Automatic attempts cannot have requestedBy" });
  }
  if (attempt.trigger === "automatic" && attempt.reason !== null) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Automatic attempts cannot have a reason" });
  }
});

export type JobAttempt = z.output<typeof jobAttemptSchema>;

export const jobRecordSchema = z.strictObject({
  jobId: uuid,
  jobType: z.enum(jobTypes),
  organizationId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
  payloadReferences: z.array(identifier).max(100),
  scheduleAt: timestamp.nullable(),
  maximumAttempts: z.int().min(1).max(MAXIMUM_ATTEMPTS),
  attemptsInCycle: z.int().min(0).max(MAXIMUM_ATTEMPTS),
  rerunCount: z.int().min(0),
  state: z.enum(jobStates),
  nextAttemptAt: timestamp.nullable(),
  lastFailure: jobFailureSchema.nullable(),
  attempts: z.array(jobAttemptSchema).max(10_000),
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((job, context) => {
  const running = job.attempts.filter((attempt) => attempt.outcome === "running");
  if (job.state === "running" && running.length !== 1) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "Running jobs require one active attempt" });
  }
  if (job.state !== "running" && running.length > 0) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "Only running jobs may have an active attempt" });
  }
  if (job.state === "retry_pending" && job.nextAttemptAt === null) {
    context.addIssue({ code: "custom", path: ["nextAttemptAt"], message: "Retrying jobs require nextAttemptAt" });
  }
  if (job.state === "scheduled" && job.scheduleAt === null) {
    context.addIssue({ code: "custom", path: ["scheduleAt"], message: "Scheduled jobs require scheduleAt" });
  }
  if (job.state !== "retry_pending" && job.nextAttemptAt !== null) {
    context.addIssue({ code: "custom", path: ["nextAttemptAt"], message: "Only retrying jobs may have nextAttemptAt" });
  }
  if (["needs_attention", "failed"].includes(job.state) && job.lastFailure === null) {
    context.addIssue({ code: "custom", path: ["lastFailure"], message: "Failed jobs require a failure" });
  }
  if (["queued", "scheduled", "running", "succeeded", "cancelled"].includes(job.state) && job.lastFailure !== null) {
    context.addIssue({ code: "custom", path: ["lastFailure"], message: "Active or successful jobs cannot retain a failure" });
  }
  if (job.attemptsInCycle > job.maximumAttempts) {
    context.addIssue({ code: "custom", path: ["attemptsInCycle"], message: "Attempt count exceeds maximumAttempts" });
  }
  const attemptIds = new Set<string>();
  for (const attempt of job.attempts) {
    if (attempt.jobId !== job.jobId) {
      context.addIssue({ code: "custom", path: ["attempts"], message: "Attempt belongs to another job" });
    }
    if (attemptIds.has(attempt.attemptId)) {
      context.addIssue({ code: "custom", path: ["attempts"], message: "Attempt IDs must be unique" });
    }
    attemptIds.add(attempt.attemptId);
  }
});

export type JobRecord = z.output<typeof jobRecordSchema>;

export const jobSubmissionSchema = z.strictObject({
  outcome: z.enum(["created", "replayed", "idempotency_conflict"]),
  jobId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
});

export type JobSubmission = z.output<typeof jobSubmissionSchema>;

export class JobContractError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND") {
    super(code === "INVALID_INPUT" ? "Job input is invalid" : code === "INVALID_TRANSITION" ? "Job transition is not allowed" : code === "IDEMPOTENCY_CONFLICT" ? "Job idempotency key conflicts" : "Job was not found");
    this.name = "JobContractError";
  }
}

export type JobClock = Readonly<{ now: string }>;

function parseTimestamp(value: string): number {
  if (!timestamp.safeParse(value).success) throw new JobContractError("INVALID_INPUT");
  return Date.parse(value);
}

function parseRequest(value: unknown): JobRequest {
  const parsed = jobRequestSchema.safeParse(value);
  if (!parsed.success) throw new JobContractError("INVALID_INPUT");
  return parsed.data;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function validateRecord(value: unknown): JobRecord {
  const parsed = jobRecordSchema.safeParse(value);
  if (!parsed.success) throw new JobContractError("INVALID_INPUT");
  return freeze(parsed.data);
}

function buildAttempt(
  job: JobRecord,
  input: {
    attemptId: string;
    startedAt: string;
    trigger: "automatic" | "manual";
    requestedBy: string | null;
    reason?: string | null;
  },
): JobAttempt {
  const attemptId = uuid.safeParse(input.attemptId).success ? input.attemptId.toLowerCase() : null;
  if (attemptId === null || !timestamp.safeParse(input.startedAt).success) throw new JobContractError("INVALID_INPUT");
  return {
    attemptId,
    jobId: job.jobId,
    attemptNumber: job.attempts.length + 1,
    correlationId: job.correlationId,
    trigger: input.trigger,
    requestedBy: input.requestedBy,
    reason: input.reason ?? null,
    startedAt: input.startedAt,
    finishedAt: null,
    outcome: "running",
    failure: null,
  };
}

function appendAttempt(job: JobRecord, attempt: JobAttempt): JobRecord {
  return validateRecord(freeze({
    ...job,
    state: "running",
    attemptsInCycle: job.attemptsInCycle + 1,
    nextAttemptAt: null,
    lastFailure: null,
    attempts: [...job.attempts, attempt],
    updatedAt: attempt.startedAt,
  }));
}

/** Parses an enqueue request before a provider or durable store is called. */
export function prepareJobRequest(input: unknown): JobRequest {
  return parseRequest(input);
}

/** Creates the durable record that must exist before enqueueing a provider job. */
export function createJobRecord(input: unknown, clock: JobClock): JobRecord {
  const request = parseRequest(input);
  parseTimestamp(clock.now);
  const state: JobState = request.scheduleAt !== null && Date.parse(request.scheduleAt) > Date.parse(clock.now)
    ? "scheduled"
    : "queued";
  return validateRecord(freeze({
    ...request,
    state,
    attemptsInCycle: 0,
    rerunCount: 0,
    nextAttemptAt: null,
    lastFailure: null,
    attempts: [],
    createdAt: clock.now,
    updatedAt: clock.now,
  }));
}

/** Starts one automatic attempt from a queued, scheduled, or retryable job. */
export function startJobAttempt(
  input: JobRecord,
  details: { attemptId: string; startedAt: string },
): JobRecord {
  const job = validateRecord(input);
  parseTimestamp(details.startedAt);
  if (!["queued", "scheduled", "retry_pending"].includes(job.state)) throw new JobContractError("INVALID_TRANSITION");
  if (job.state === "scheduled" && job.scheduleAt !== null && Date.parse(job.scheduleAt) > Date.parse(details.startedAt)) {
    throw new JobContractError("INVALID_TRANSITION");
  }
  if (job.attemptsInCycle >= job.maximumAttempts) throw new JobContractError("INVALID_TRANSITION");
  return freeze(appendAttempt(job, buildAttempt(job, { ...details, trigger: "automatic", requestedBy: null, reason: null })));
}

export const jobCompletionSchema = z.strictObject({
  outcome: z.enum(["succeeded", "failed"]),
  finishedAt: timestamp,
  failure: jobFailureSchema.nullable().default(null),
  nextAttemptAt: timestamp.nullable().default(null),
});

export type JobCompletion = z.output<typeof jobCompletionSchema>;

/** Completes one attempt and classifies retryable, terminal, and attention states. */
export function completeJobAttempt(
  input: JobRecord,
  attemptIdInput: string,
  completionInput: unknown,
): JobRecord {
  const job = validateRecord(input);
  const attemptIdResult = uuid.safeParse(attemptIdInput);
  const completion = jobCompletionSchema.safeParse(completionInput);
  if (!attemptIdResult.success || !completion.success) throw new JobContractError("INVALID_INPUT");
  const attemptId = attemptIdResult.data;
  const active = job.attempts.find((attempt) => attempt.attemptId === attemptId && attempt.outcome === "running");
  if (!active || job.state !== "running") throw new JobContractError("INVALID_TRANSITION");
  if (Date.parse(completion.data.finishedAt) < Date.parse(active.startedAt)) throw new JobContractError("INVALID_INPUT");

  const failure = completion.data.failure;
  if (completion.data.outcome === "succeeded" && failure !== null) throw new JobContractError("INVALID_INPUT");
  if (completion.data.outcome === "failed" && failure === null) throw new JobContractError("INVALID_INPUT");
  if (failure?.retryable && completion.data.nextAttemptAt === null && job.attemptsInCycle < job.maximumAttempts) {
    throw new JobContractError("INVALID_INPUT");
  }
  if (failure?.retryable && completion.data.nextAttemptAt !== null
    && Date.parse(completion.data.nextAttemptAt) <= Date.parse(completion.data.finishedAt)
    && job.attemptsInCycle < job.maximumAttempts) {
    throw new JobContractError("INVALID_INPUT");
  }
  if (!failure?.retryable && completion.data.nextAttemptAt !== null) throw new JobContractError("INVALID_INPUT");

  const updatedAttempt: JobAttempt = {
    ...active,
    finishedAt: completion.data.finishedAt,
    outcome: completion.data.outcome,
    failure,
  };
  const attempts = job.attempts.map((attempt) => attempt.attemptId === active.attemptId ? updatedAttempt : attempt);
  const state: JobState = completion.data.outcome === "succeeded"
    ? "succeeded"
    : failure!.retryable
      ? job.attemptsInCycle >= job.maximumAttempts ? "needs_attention" : "retry_pending"
      : "failed";
  const nextAttemptAt = state === "retry_pending" ? completion.data.nextAttemptAt : null;
  return validateRecord(freeze({
    ...job,
    state,
    nextAttemptAt,
    lastFailure: completion.data.outcome === "failed" ? failure : null,
    attempts,
    updatedAt: completion.data.finishedAt,
  }));
}

/**
 * Reuses the same domain record for an operator rerun and appends a new attempt.
 * The original job idempotency key stays unchanged; the attempt ID is new.
 */
export function manuallyRerunJob(
  input: JobRecord,
  details: { attemptId: string; startedAt: string; requestedBy: string; reason: string },
): JobRecord {
  const job = validateRecord(input);
  const requestedBy = identifier.safeParse(details.requestedBy);
  if (!requestedBy.success || details.reason.trim().length < 1 || details.reason.trim().length > 2_000) {
    throw new JobContractError("INVALID_INPUT");
  }
  if (job.state !== "needs_attention" && job.state !== "failed") throw new JobContractError("INVALID_TRANSITION");
  const next = appendAttempt(
    { ...job, attemptsInCycle: 0, rerunCount: job.rerunCount + 1 },
    buildAttempt({ ...job, attemptsInCycle: 0 }, {
      attemptId: details.attemptId,
      startedAt: details.startedAt,
      trigger: "manual",
      requestedBy: requestedBy.data,
      reason: details.reason,
    }),
  );
  return freeze(next);
}

/** Cancels only queued, scheduled, or retry-pending work. */
export function cancelJob(input: JobRecord, updatedAt: string): JobRecord {
  const job = validateRecord(input);
  parseTimestamp(updatedAt);
  if (!["queued", "scheduled", "retry_pending"].includes(job.state)) throw new JobContractError("INVALID_TRANSITION");
  return validateRecord(freeze({ ...job, state: "cancelled", nextAttemptAt: null, updatedAt }));
}

export interface JobService {
  enqueue(request: JobRequest): Promise<JobSubmission>;
  schedule(request: JobRequest): Promise<JobSubmission>;
  inspect(jobId: string): Promise<JobRecord | null>;
  cancel(jobId: string, correlationId: string, idempotencyKey: string): Promise<JobRecord>;
  manualRerun(jobId: string, details: { attemptId: string; requestedBy: string; reason: string }): Promise<JobRecord>;
}

export function validateJobSubmission(input: unknown): JobSubmission {
  const parsed = jobSubmissionSchema.safeParse(input);
  if (!parsed.success) throw new JobContractError("INVALID_INPUT");
  return parsed.data;
}
