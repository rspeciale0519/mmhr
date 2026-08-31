import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/, "Reference contains unsupported characters");

export const deletionRequestSchema = z
  .strictObject({
    requestId: uuid,
    subjectId: uuid,
    requestedAt: timestamp,
    dueAt: timestamp,
    legalHold: z.boolean(),
    retentionUntil: timestamp.nullable(),
  })
  .superRefine((request, context) => {
    const requestedMs = Date.parse(request.requestedAt);
    const dueMs = Date.parse(request.dueAt);
    const maximumDueMs = requestedMs + 30 * 24 * 60 * 60 * 1000;
    if (dueMs < requestedMs || dueMs > maximumDueMs) {
      context.addIssue({ code: "custom", path: ["dueAt"], message: "Deletion due date must be within 30 days" });
    }
    if (request.retentionUntil !== null && Date.parse(request.retentionUntil) < requestedMs) {
      context.addIssue({ code: "custom", path: ["retentionUntil"], message: "Retention cannot end before the request" });
    }
  });

export type DeletionRequest = z.output<typeof deletionRequestSchema>;

export const deletionDecisionSchema = z.strictObject({
  requestId: uuid,
  decidedAt: timestamp,
  decision: z.enum(["approved", "held", "rejected"]),
  auditReference: reference,
});

export type DeletionDecision = z.output<typeof deletionDecisionSchema>;

export type DeletionEligibility = Readonly<{
  eligible: boolean;
  reason: "ready" | "legal_hold" | "retention_period" | "deadline_pending";
}>;

function parseRequest(value: unknown): DeletionRequest {
  const parsed = deletionRequestSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid deletion request");
  return parsed.data;
}

/** Parses a request without accepting names, contact data, or free text. */
export function parseDeletionRequest(value: unknown): DeletionRequest {
  return parseRequest(value);
}

/** Determines whether a request may enter a reviewed deletion workflow. */
export function evaluateDeletionEligibility(
  value: unknown,
  asOfInput: string | Date,
): DeletionEligibility {
  const request = parseRequest(value);
  const asOf = asOfInput instanceof Date ? asOfInput.toISOString() : asOfInput;
  if (!timestamp.safeParse(asOf).success) throw new Error("Invalid deletion evaluation timestamp");
  const asOfMs = Date.parse(asOf);
  if (request.legalHold) return { eligible: false, reason: "legal_hold" };
  if (request.retentionUntil !== null && asOfMs < Date.parse(request.retentionUntil)) {
    return { eligible: false, reason: "retention_period" };
  }
  if (asOfMs < Date.parse(request.dueAt)) return { eligible: false, reason: "deadline_pending" };
  return { eligible: true, reason: "ready" };
}

/** Parses a decision and requires an opaque audit reference for every outcome. */
export function parseDeletionDecision(value: unknown): DeletionDecision {
  const parsed = deletionDecisionSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid deletion decision");
  return parsed.data;
}

export { reference, timestamp, uuid };
