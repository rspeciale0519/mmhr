import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

const renewalStatuses = [
  "upcoming",
  "in_review",
  "at_risk",
  "renewed",
  "replaced",
  "expanded",
  "cancelled",
] as const;

export type RenewalStatus = (typeof renewalStatuses)[number];

/** Immutable customer-success renewal snapshot. Linked deals stay in the same organization. */
export const renewalSchema = z
  .object({
    renewalId: uuid,
    organizationId: uuid,
    contractId: uuid,
    ownerIdentityId: uuid,
    contractStartAt: timestamp,
    contractEndAt: timestamp,
    renewalWindowStartAt: timestamp,
    renewalWindowEndAt: timestamp,
    linkedFollowOnDealId: uuid.nullable(),
    nextActionAt: timestamp.nullable(),
    status: z.enum(renewalStatuses),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((renewal, context) => {
    const contractStart = Date.parse(renewal.contractStartAt);
    const contractEnd = Date.parse(renewal.contractEndAt);
    const windowStart = Date.parse(renewal.renewalWindowStartAt);
    const windowEnd = Date.parse(renewal.renewalWindowEndAt);
    if (contractEnd < contractStart) {
      context.addIssue({ code: "custom", path: ["contractEndAt"], message: "Contract end cannot precede contract start" });
    }
    if (windowEnd < windowStart) {
      context.addIssue({ code: "custom", path: ["renewalWindowEndAt"], message: "Renewal window end cannot precede its start" });
    }
    if (windowStart < contractStart || windowEnd > contractEnd) {
      context.addIssue({ code: "custom", path: ["renewalWindowStartAt"], message: "Renewal window must be within the contract period" });
    }
    const terminal = renewal.status === "renewed" || renewal.status === "replaced" || renewal.status === "expanded" || renewal.status === "cancelled";
    if (terminal && renewal.nextActionAt !== null) {
      context.addIssue({ code: "custom", path: ["nextActionAt"], message: "Terminal renewals cannot have a next action" });
    }
    if ((renewal.status === "renewed" || renewal.status === "replaced" || renewal.status === "expanded") && renewal.linkedFollowOnDealId === null) {
      context.addIssue({ code: "custom", path: ["linkedFollowOnDealId"], message: "A completed renewal outcome requires a linked follow-on deal" });
    }
  });

export type Renewal = z.infer<typeof renewalSchema>;

export const renewalTransitionSchema = z
  .object({
    renewalId: uuid,
    fromStatus: z.enum(renewalStatuses),
    toStatus: z.enum(renewalStatuses),
    expectedRevision: z.number().int().positive(),
    actorIdentityId: uuid,
    occurredAt: timestamp,
    reason: z.string().trim().min(1).max(2_000),
    approvalReference: uuid.nullable(),
    correlationId: uuid,
  })
  .strict();

export type RenewalTransition = z.infer<typeof renewalTransitionSchema>;

const allowedRenewalTransitions: Readonly<Record<RenewalStatus, readonly RenewalStatus[]>> = {
  upcoming: ["in_review", "at_risk", "cancelled"],
  in_review: ["at_risk", "renewed", "replaced", "expanded", "cancelled"],
  at_risk: ["in_review", "renewed", "replaced", "expanded", "cancelled"],
  renewed: [],
  replaced: [],
  expanded: [],
  cancelled: [],
};

const completedStatuses = new Set<RenewalStatus>(["renewed", "replaced", "expanded", "cancelled"]);

/** Applies one audited, forward-only transition without mutating the source snapshot. */
export function transitionRenewal(renewalInput: unknown, transitionInput: unknown): Renewal {
  const renewal = renewalSchema.safeParse(renewalInput);
  const transition = renewalTransitionSchema.safeParse(transitionInput);
  if (!renewal.success || !transition.success) throw new Error("Invalid renewal transition");
  if (transition.data.renewalId !== renewal.data.renewalId
    || transition.data.fromStatus !== renewal.data.status
    || transition.data.expectedRevision !== renewal.data.revision) {
    throw new Error("Renewal transition is stale");
  }
  if (!allowedRenewalTransitions[renewal.data.status].includes(transition.data.toStatus)) {
    throw new Error("Renewal transition is not allowed");
  }
  if (completedStatuses.has(transition.data.toStatus) && transition.data.approvalReference === null) {
    throw new Error("Completed renewal outcomes require approval");
  }
  if ((transition.data.toStatus === "renewed" || transition.data.toStatus === "replaced" || transition.data.toStatus === "expanded")
    && renewal.data.linkedFollowOnDealId === null) {
    throw new Error("Completed renewal outcomes require a linked follow-on deal");
  }
  return Object.freeze({
    ...renewal.data,
    status: transition.data.toStatus,
    revision: renewal.data.revision + 1,
    nextActionAt: completedStatuses.has(transition.data.toStatus) ? null : renewal.data.nextActionAt,
  });
}

export function isRenewalTerminal(status: RenewalStatus): boolean {
  return completedStatuses.has(status);
}
