import "server-only";
import { z } from "zod";

import type { IdentityDispatchResult } from "./intent-dispatcher";
import {
  identityIntentOutcomeSchema, identityIntentRequestSchema,
  type IdentityIntentRequest,
} from "./intent-worker-contract";

export const MAX_IDENTITY_INTENT_BATCH = 5;

export interface IdentityIntentSweepSource {
  listCandidateIds(): Promise<readonly string[]>;
}

export type IdentityIntentSweepDependencies = Readonly<{
  source: IdentityIntentSweepSource;
  dispatch(input: IdentityIntentRequest): Promise<IdentityDispatchResult>;
}>;

export type IdentityIntentSweepStatus =
  | "succeeded" | "not_claimed" | "retry_pending" | "reconcile" | "needs_attention";

type DispatchCode = Extract<IdentityDispatchResult, { code: string }>["code"];
type DispatchSuccessCode = Extract<IdentityDispatchResult, { resultCode: string }>["resultCode"];

export type IdentityIntentSweepItem = Readonly<{
  intentId: string;
  status: IdentityIntentSweepStatus;
  outcome: IdentityDispatchResult["outcome"];
  code?: DispatchCode | DispatchSuccessCode | "dispatch_threw" | "invalid_dispatch_result";
}>;

export type IdentityIntentSweepCounts = Readonly<Record<IdentityIntentSweepStatus, number>>;

export type IdentityIntentSweepResult =
  | Readonly<{
    outcome: "completed";
    items: readonly IdentityIntentSweepItem[];
    counts: IdentityIntentSweepCounts;
  }>
  | Readonly<{
    outcome: "failed";
    code: "source_unavailable" | "invalid_candidates";
    items: readonly [];
    counts: IdentityIntentSweepCounts;
  }>;

const dispatchResultSchema = z.union([
  identityIntentOutcomeSchema,
  z.strictObject({ outcome: z.enum(["invalid_input", "not_claimed"]) }),
  z.strictObject({
    outcome: z.literal("outcome_unknown"),
    code: z.enum([
      "repository_unavailable", "invalid_claim", "lease_expired",
      "lease_superseded", "result_recording_failed", "service_contract_invalid",
    ] as const satisfies readonly DispatchCode[]),
    nextAction: z.enum(["reconcile", "manual_review"]),
  }),
]);

function emptyCounts(): Record<IdentityIntentSweepStatus, number> {
  return { succeeded: 0, not_claimed: 0, retry_pending: 0, reconcile: 0, needs_attention: 0 };
}

function sourceFailure(code: "source_unavailable" | "invalid_candidates"): IdentityIntentSweepResult {
  return { outcome: "failed", code, items: [], counts: emptyCounts() };
}

function candidateIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const count = value.length;
  if (!Number.isInteger(count) || count < 0 || count > MAX_IDENTITY_INTENT_BATCH) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const parsed = identityIntentRequestSchema.safeParse({ intentId: value[index] });
    if (!parsed.success || seen.has(parsed.data.intentId)) return null;
    seen.add(parsed.data.intentId);
    ids.push(parsed.data.intentId);
  }
  return ids;
}

function dispatchFailure(
  intentId: string, code: "dispatch_threw" | "invalid_dispatch_result",
): IdentityIntentSweepItem {
  return { intentId, status: "needs_attention", outcome: "outcome_unknown", code };
}

function redactResult(intentId: string, value: unknown): IdentityIntentSweepItem {
  const parsed = dispatchResultSchema.safeParse(value);
  if (!parsed.success) return dispatchFailure(intentId, "invalid_dispatch_result");
  const result = parsed.data;
  switch (result.outcome) {
    case "succeeded":
      return { intentId, status: "succeeded", outcome: result.outcome, code: result.resultCode };
    case "not_claimed":
      return { intentId, status: "not_claimed", outcome: result.outcome };
    case "invalid_input":
      return { intentId, status: "needs_attention", outcome: result.outcome };
    case "failed":
      // Only the dispatcher can prove a recorded, retryable invitation rejection.
      // This status leaves work pending; this sweep never repeats the operation.
      return {
        intentId,
        status: result.code === "provider_rejected" && result.retry === "safe" ? "retry_pending" : "needs_attention",
        outcome: result.outcome, code: result.code,
      };
    case "outcome_unknown":
      return {
        intentId, status: result.nextAction === "reconcile" ? "reconcile" : "needs_attention",
        outcome: result.outcome, code: result.code,
      };
  }
}

/** Completion describes the sweep, not the success of every business operation. */
export async function sweepIdentityIntents(
  { source, dispatch }: IdentityIntentSweepDependencies,
): Promise<IdentityIntentSweepResult> {
  let rawCandidates: unknown;
  try {
    rawCandidates = await source.listCandidateIds();
  } catch {
    return sourceFailure("source_unavailable");
  }
  let ids: string[] | null;
  try {
    // Copy and validate the complete bounded list before any dispatch can start.
    ids = candidateIds(rawCandidates);
  } catch {
    return sourceFailure("invalid_candidates");
  }
  if (ids === null) return sourceFailure("invalid_candidates");

  const items: IdentityIntentSweepItem[] = [];
  const counts = emptyCounts();
  for (const intentId of ids) {
    let rawResult: unknown;
    let item: IdentityIntentSweepItem;
    try {
      rawResult = await dispatch({ intentId });
    } catch {
      item = dispatchFailure(intentId, "dispatch_threw");
      items.push(item);
      counts[item.status] += 1;
      continue;
    }
    try {
      item = redactResult(intentId, rawResult);
    } catch {
      item = dispatchFailure(intentId, "invalid_dispatch_result");
    }
    items.push(item);
    counts[item.status] += 1;
  }
  return { outcome: "completed", items, counts };
}
