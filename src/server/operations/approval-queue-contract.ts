import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const approvalRequestStatuses = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalRequestStatus = (typeof approvalRequestStatuses)[number];

export const approvalRequestSchema = z
  .strictObject({
    requestId: uuid,
    organizationId: uuid.nullable(),
    category: z.enum(["permission", "workflow", "finance", "content", "document", "configuration"]),
    resourceId: uuid,
    requestedByIdentityId: uuid,
    requestedAt: timestamp,
    status: z.enum(approvalRequestStatuses),
    reviewedByIdentityId: uuid.nullable(),
    reviewedAt: timestamp.nullable(),
    decisionReason: z.string().trim().min(1).max(2_000).nullable(),
    revision: z.number().int().positive(),
  })
  .superRefine((request, context) => {
    const pending = request.status === "pending";
    if (pending && (request.reviewedByIdentityId !== null || request.reviewedAt !== null || request.decisionReason !== null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Pending approvals cannot contain a decision" });
    }
    if (!pending && (request.reviewedByIdentityId === null || request.reviewedAt === null || request.decisionReason === null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Closed approvals require reviewer, time, and reason" });
    }
    if (request.reviewedByIdentityId === request.requestedByIdentityId && request.reviewedByIdentityId !== null) {
      context.addIssue({ code: "custom", path: ["reviewedByIdentityId"], message: "Requesters cannot review their own approval" });
    }
    if (request.reviewedAt !== null && Date.parse(request.reviewedAt) < Date.parse(request.requestedAt)) {
      context.addIssue({ code: "custom", path: ["reviewedAt"], message: "Review cannot precede the request" });
    }
  });

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const approvalTransitionSchema = z.strictObject({
  requestId: uuid,
  fromStatus: z.enum(approvalRequestStatuses),
  toStatus: z.enum(approvalRequestStatuses),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason: z.string().trim().min(1).max(2_000),
  correlationId: uuid,
});

export type ApprovalTransition = z.infer<typeof approvalTransitionSchema>;

const allowedApprovalTransitions: Readonly<Record<ApprovalRequestStatus, readonly ApprovalRequestStatus[]>> = {
  pending: ["approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

/** Applies one audited queue decision and prevents requesters from approving themselves. */
export function transitionApprovalRequest(requestInput: unknown, transitionInput: unknown): ApprovalRequest {
  const request = approvalRequestSchema.safeParse(requestInput);
  const transition = approvalTransitionSchema.safeParse(transitionInput);
  if (!request.success || !transition.success) throw new Error("Invalid approval transition");
  if (transition.data.requestId !== request.data.requestId
    || transition.data.fromStatus !== request.data.status
    || transition.data.expectedRevision !== request.data.revision) throw new Error("Approval transition is stale");
  if (!allowedApprovalTransitions[request.data.status].includes(transition.data.toStatus)) throw new Error("Approval transition is not allowed");
  if ((transition.data.toStatus === "approved" || transition.data.toStatus === "rejected")
    && transition.data.actorIdentityId === request.data.requestedByIdentityId) throw new Error("Requesters cannot decide their own approval");
  return Object.freeze({
    ...request.data,
    status: transition.data.toStatus,
    revision: request.data.revision + 1,
    reviewedByIdentityId: transition.data.actorIdentityId,
    reviewedAt: transition.data.occurredAt,
    decisionReason: transition.data.reason,
  });
}

export function isApprovalClosed(status: ApprovalRequestStatus): boolean {
  return status !== "pending";
}
