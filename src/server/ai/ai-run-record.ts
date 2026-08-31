import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  aiCapabilities,
  aiDataClasses,
  aiRunStatuses,
  type AiRun,
  type AiRunStatus,
} from "./ai-service";

export const aiRunIdentifierSchema = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/,
  "Identifier contains unsupported characters",
);
const identifierSchema = aiRunIdentifierSchema;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hash");
const timestampSchema = z.iso.datetime({ offset: true });

export const aiArtifactSchema = z.strictObject({
  artifactId: identifierSchema,
  sha256: sha256Schema,
});

export type AiArtifact = z.infer<typeof aiArtifactSchema>;

export const aiRunUsageSchema = z.strictObject({
  inputTokens: z.int().min(0).nullable(),
  outputTokens: z.int().min(0).nullable(),
  totalTokens: z.int().min(0).nullable(),
  costCents: z.int().min(0),
  latencyMs: z.int().min(0),
});

export type AiRunUsage = z.infer<typeof aiRunUsageSchema>;

const aiFailureSchema = z.strictObject({
  code: z.enum([
    "provider_timeout",
    "provider_error",
    "validation_failed",
    "policy_denied",
  ]),
  retryable: z.boolean(),
});

export type AiRunFailure = z.infer<typeof aiFailureSchema>;

export const aiApprovalSchema = z.strictObject({
  decision: z.enum(["pending", "approved", "rejected"]),
  reviewerId: identifierSchema.nullable(),
  approvalReference: identifierSchema.nullable(),
  decidedAt: timestampSchema.nullable(),
  reason: z.string().trim().max(2_000).nullable(),
});

export type AiApproval = z.infer<typeof aiApprovalSchema>;

export const aiRunRecordSchema = z.strictObject({
  runId: identifierSchema,
  capability: z.enum(aiCapabilities),
  dataClass: z.enum(aiDataClasses),
  adapterId: identifierSchema,
  modelId: identifierSchema,
  templateVersion: identifierSchema,
  schemaVersion: identifierSchema,
  inputArtifacts: z.array(aiArtifactSchema).max(100),
  outputArtifact: aiArtifactSchema.nullable(),
  outputHash: sha256Schema.nullable(),
  sourceReferences: z.array(identifierSchema).max(100),
  usage: aiRunUsageSchema,
  status: z.enum(aiRunStatuses),
  failure: aiFailureSchema.nullable(),
  review: aiApprovalSchema,
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
});

export type AiRunRecord = z.infer<typeof aiRunRecordSchema>;

export type AiRunRecordMetadata = Readonly<{
  dataClass: AiRunRecord["dataClass"];
  schemaVersion: string;
  inputArtifacts: readonly AiArtifact[];
  outputArtifactId?: string;
  usage?: Readonly<{
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  }>;
}>;

export type AiApprovalInput = Readonly<{
  reviewerId: string;
  decision: "approved" | "rejected";
  approvalReference: string;
  decidedAt: string;
  reason?: string | null;
}>;

export class AiRunRecordError extends Error {
  constructor(
    readonly code: "INVALID_RECORD" | "INVALID_APPROVAL" | "INVALID_TRANSITION" | "UNSAFE_OUTPUT",
  ) {
    super(code === "INVALID_APPROVAL"
      ? "AI approval is invalid"
      : code === "INVALID_TRANSITION"
        ? "AI run is not awaiting review"
        : "AI run record is invalid");
    this.name = "AiRunRecordError";
  }
}

/**
 * Validates and freezes a run record. The freeze protects the in-process value;
 * a durable store must append the same record and never update it in place.
 */
export function createAiRunRecord(input: unknown): AiRunRecord {
  const parsed = aiRunRecordSchema.safeParse(input);
  if (!parsed.success || !hasValidRunState(parsed.data)) {
    throw new AiRunRecordError("INVALID_RECORD");
  }
  return deepFreeze(parsed.data);
}

/** Builds a complete record from the provider-neutral service result. */
export function recordAiRunResult<TOutput>(
  run: AiRun<TOutput>,
  metadata: AiRunRecordMetadata,
): AiRunRecord {
  const outputHash = run.output === undefined ? null : hashJson(run.output);
  if (outputHash !== null && !metadata.outputArtifactId) {
    throw new AiRunRecordError("INVALID_RECORD");
  }

  const createdAtMs = Date.parse(run.startedAt);
  const completedAtMs = Date.parse(run.completedAt);
  const latencyMs = Number.isFinite(createdAtMs) && Number.isFinite(completedAtMs)
    ? Math.max(0, completedAtMs - createdAtMs)
    : 0;
  const failure = run.failureCode === undefined
    ? null
    : { code: run.failureCode, retryable: run.failureCode === "provider_timeout" || run.failureCode === "provider_error" };
  const outputArtifact = outputHash === null || !metadata.outputArtifactId
    ? null
    : { artifactId: metadata.outputArtifactId, sha256: outputHash };

  return createAiRunRecord({
    runId: run.runId,
    capability: run.capability,
    dataClass: metadata.dataClass,
    adapterId: run.adapterId,
    modelId: run.modelId,
    templateVersion: run.templateVersion,
    schemaVersion: metadata.schemaVersion,
    inputArtifacts: metadata.inputArtifacts,
    outputArtifact,
    outputHash,
    sourceReferences: run.sourceReferences,
    usage: {
      inputTokens: metadata.usage?.inputTokens ?? null,
      outputTokens: metadata.usage?.outputTokens ?? null,
      totalTokens: metadata.usage?.totalTokens ?? null,
      costCents: run.costCents,
      latencyMs,
    },
    status: run.status,
    failure,
    review: {
      decision: "pending",
      reviewerId: null,
      approvalReference: null,
      decidedAt: null,
      reason: null,
    },
    createdAt: run.startedAt,
    completedAt: run.status === "queued" || run.status === "running" || run.status === "validating"
      ? null
      : run.completedAt,
  });
}

const aiApprovalInputSchema = z.strictObject({
  reviewerId: identifierSchema,
  decision: z.enum(["approved", "rejected"]),
  approvalReference: identifierSchema,
  decidedAt: timestampSchema,
  reason: z.string().trim().max(2_000).nullable().optional(),
});

/** Applies one human decision and returns a new immutable record. */
export function applyAiRunApproval(
  record: AiRunRecord,
  input: unknown,
): AiRunRecord {
  const parsed = aiApprovalInputSchema.safeParse(input);
  if (!parsed.success) throw new AiRunRecordError("INVALID_APPROVAL");
  if (record.status !== "review_required" || record.review.decision !== "pending") {
    throw new AiRunRecordError("INVALID_TRANSITION");
  }
  if (parsed.data.decision === "approved" && record.outputArtifact === null) {
    throw new AiRunRecordError("INVALID_TRANSITION");
  }

  return createAiRunRecord({
    ...record,
    status: parsed.data.decision,
    review: {
      decision: parsed.data.decision,
      reviewerId: parsed.data.reviewerId,
      approvalReference: parsed.data.approvalReference,
      decidedAt: parsed.data.decidedAt,
      reason: parsed.data.reason ?? null,
    },
  });
}

/** Publication is possible only after an explicit approved decision. */
export function canPublishAiRun(record: AiRunRecord): boolean {
  return record.status === "approved"
    && record.review.decision === "approved"
    && record.review.reviewerId !== null
    && record.review.approvalReference !== null
    && record.outputArtifact !== null
    && record.outputHash !== null;
}

function hasValidRunState(record: AiRunRecord): boolean {
  const active = record.status === "queued" || record.status === "running" || record.status === "validating";
  if (active) {
    return record.completedAt === null
      && record.outputArtifact === null
      && record.outputHash === null
      && record.failure === null
      && record.review.decision === "pending";
  }
  if (record.status === "failed") {
    return record.completedAt !== null
      && record.outputArtifact === null
      && record.outputHash === null
      && record.failure !== null
      && record.review.decision === "pending";
  }
  if (record.status === "review_required") {
    return record.completedAt !== null
      && record.outputArtifact !== null
      && record.outputHash === record.outputArtifact.sha256
      && record.failure === null
      && record.review.decision === "pending";
  }
  const decided = record.review.decision === record.status;
  return record.completedAt !== null
    && record.outputArtifact !== null
    && record.outputHash === record.outputArtifact.sha256
    && record.failure === null
    && decided
    && record.review.reviewerId !== null
    && record.review.approvalReference !== null
    && record.review.decidedAt !== null;
}

function hashJson(value: unknown): string {
  try {
    return createHash("sha256").update(stableSerialize(value)).digest("hex");
  } catch {
    throw new AiRunRecordError("UNSAFE_OUTPUT");
  }
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  throw new Error("unsupported output");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export type AiRunStatusValue = AiRunStatus;
