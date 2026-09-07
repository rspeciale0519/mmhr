import "server-only";

import { z } from "zod";

import {
  evaluateDeletionEligibility,
  parseDeletionDecision,
  parseDeletionRequest,
  reference,
  uuid,
  type DeletionDecision,
  type DeletionRequest,
} from "./retention-contract";

const correlationIdSchema = uuid;

export const deletionProviderResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("succeeded"), receiptReference: reference }),
  z.strictObject({ outcome: z.literal("rejected"), reason: z.enum(["not_found", "provider_denied", "invalid_subject"]) }),
  z.strictObject({ outcome: z.literal("unknown"), retryable: z.boolean() }),
]);

export type DeletionProviderResult = z.infer<typeof deletionProviderResultSchema>;

export type DeletionProvider = Readonly<{
  deleteSubject: (subjectId: string, correlationId: string) => Promise<unknown>;
}>;

export type DeletionExecutionResult = Readonly<{
  outcome: "completed" | "blocked" | "failed";
  reason: "completed" | "legal_hold" | "retention_period" | "deadline_pending" | "not_approved" | "request_mismatch" | "provider_rejected" | "provider_unknown";
  receiptReference: string | null;
}>;

/** Executes one approved deletion intent without retrying an uncertain provider write. */
export async function executeApprovedDeletion(
  requestInput: unknown,
  decisionInput: unknown,
  asOfInput: string | Date,
  correlationIdInput: string,
  provider: DeletionProvider,
): Promise<DeletionExecutionResult> {
  const request = parseDeletionRequest(requestInput);
  const decision = parseDeletionDecision(decisionInput);
  const correlation = correlationIdSchema.safeParse(correlationIdInput);
  if (!correlation.success) throw new Error("Invalid deletion execution correlation");
  if (request.requestId !== decision.requestId) {
    return { outcome: "blocked", reason: "request_mismatch", receiptReference: null };
  }
  if (decision.decision !== "approved") {
    return { outcome: "blocked", reason: "not_approved", receiptReference: null };
  }
  const eligibility = evaluateDeletionEligibility(request, asOfInput);
  if (!eligibility.eligible) {
    const reason = eligibility.reason === "ready" ? "deadline_pending" : eligibility.reason;
    return { outcome: "blocked", reason, receiptReference: null };
  }

  const providerResult = deletionProviderResultSchema.safeParse(
    await provider.deleteSubject(request.subjectId, correlation.data),
  );
  if (!providerResult.success) {
    return { outcome: "failed", reason: "provider_unknown", receiptReference: null };
  }
  if (providerResult.data.outcome === "succeeded") {
    return { outcome: "completed", reason: "completed", receiptReference: providerResult.data.receiptReference };
  }
  return {
    outcome: "failed",
    reason: providerResult.data.outcome === "unknown" ? "provider_unknown" : "provider_rejected",
    receiptReference: null,
  };
}

export type { DeletionDecision, DeletionRequest };
