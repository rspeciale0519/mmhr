import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const onboardingStatuses = ["planned", "active", "at_risk", "failed", "reactivated", "completed", "cancelled"] as const;
export type OnboardingStatus = (typeof onboardingStatuses)[number];

const milestoneSchema = z.strictObject({
  milestoneId: uuid,
  title: z.string().trim().min(1).max(300),
  ownerIdentityId: uuid,
  dueAt: timestamp,
  status: z.enum(["pending", "in_progress", "completed", "blocked", "skipped"]),
  completedAt: timestamp.nullable(),
});

const checkInSchema = z.strictObject({
  checkInId: uuid,
  ownerIdentityId: uuid,
  occurredAt: timestamp,
  summary: z.string().trim().min(1).max(2_000),
  nextActionAt: timestamp.nullable(),
});

const riskSchema = z
  .strictObject({
    riskId: uuid,
    severity: z.enum(["low", "medium", "high", "critical"]),
    description: z.string().trim().min(1).max(2_000),
    status: z.enum(["open", "mitigated", "accepted"]),
    raisedAt: timestamp,
    resolvedAt: timestamp.nullable(),
  })
  .superRefine((risk, context) => {
    if (risk.status === "open" && risk.resolvedAt !== null) {
      context.addIssue({ code: "custom", path: ["resolvedAt"], message: "Open risks cannot have a resolution time" });
    }
    if (risk.status !== "open" && risk.resolvedAt === null) {
      context.addIssue({ code: "custom", path: ["resolvedAt"], message: "Resolved risks require a resolution time" });
    }
    if (risk.resolvedAt !== null && Date.parse(risk.resolvedAt) < Date.parse(risk.raisedAt)) {
      context.addIssue({ code: "custom", path: ["resolvedAt"], message: "Risk resolution cannot precede risk creation" });
    }
  });

/** Immutable onboarding snapshot. Failed records remain retained for reactivation and audit. */
export const onboardingSchema = z
  .strictObject({
    onboardingId: uuid,
    organizationId: uuid,
    dealId: uuid,
    ownerIdentityId: uuid,
    targetGoLiveAt: timestamp,
    status: z.enum(onboardingStatuses),
    revision: z.number().int().positive(),
    milestones: z.array(milestoneSchema).min(1).max(200),
    checkIns: z.array(checkInSchema).max(500),
    risks: z.array(riskSchema).max(200),
    failureReason: z.string().trim().min(1).max(2_000).nullable(),
    reactivatedFromRevision: z.number().int().positive().nullable(),
  })
  .superRefine((onboarding, context) => {
    for (const [label, values] of [["milestone", onboarding.milestones], ["check-in", onboarding.checkIns], ["risk", onboarding.risks]] as const) {
      if (new Set(values.map((value) => value[`${label === "milestone" ? "milestone" : label === "check-in" ? "checkIn" : "risk"}Id` as keyof typeof value])).size !== values.length) {
        context.addIssue({ code: "custom", path: [label === "milestone" ? "milestones" : label === "check-in" ? "checkIns" : "risks"], message: `Duplicate ${label} identifier` });
      }
    }
    if ((onboarding.status === "failed" || onboarding.status === "reactivated") && onboarding.failureReason === null) {
      context.addIssue({ code: "custom", path: ["failureReason"], message: "Failed onboarding requires a failure reason" });
    }
    if (onboarding.status === "reactivated" && onboarding.reactivatedFromRevision === null) {
      context.addIssue({ code: "custom", path: ["reactivatedFromRevision"], message: "Reactivated onboarding requires its failed revision" });
    }
    if (onboarding.status !== "reactivated" && onboarding.reactivatedFromRevision !== null) {
      context.addIssue({ code: "custom", path: ["reactivatedFromRevision"], message: "Only reactivated onboarding can reference a failed revision" });
    }
    if ((onboarding.status === "completed" || onboarding.status === "cancelled") && onboarding.failureReason !== null && onboarding.status === "completed") {
      context.addIssue({ code: "custom", path: ["failureReason"], message: "Completed onboarding cannot retain a failure reason" });
    }
  });

export type Onboarding = z.infer<typeof onboardingSchema>;
export type OnboardingMilestone = z.infer<typeof milestoneSchema>;
export type OnboardingCheckIn = z.infer<typeof checkInSchema>;
export type OnboardingRisk = z.infer<typeof riskSchema>;

export const onboardingTransitionSchema = z.strictObject({
  onboardingId: uuid,
  fromStatus: z.enum(onboardingStatuses),
  toStatus: z.enum(onboardingStatuses),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason: z.string().trim().min(1).max(2_000),
  failureReason: z.string().trim().min(1).max(2_000).nullable(),
  approvalReference: uuid.nullable(),
  correlationId: uuid,
});

export type OnboardingTransition = z.infer<typeof onboardingTransitionSchema>;

const allowedOnboardingTransitions: Readonly<Record<OnboardingStatus, readonly OnboardingStatus[]>> = {
  planned: ["active", "cancelled"],
  active: ["at_risk", "failed", "completed", "cancelled"],
  at_risk: ["active", "failed", "completed", "cancelled"],
  failed: ["reactivated", "cancelled"],
  reactivated: ["active", "at_risk", "failed", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const terminalOnboardingStatuses = new Set<OnboardingStatus>(["completed", "cancelled"]);

/** Applies one audited transition and preserves every prior onboarding snapshot. */
export function transitionOnboarding(onboardingInput: unknown, transitionInput: unknown): Onboarding {
  const onboarding = onboardingSchema.safeParse(onboardingInput);
  const transition = onboardingTransitionSchema.safeParse(transitionInput);
  if (!onboarding.success || !transition.success) throw new Error("Invalid onboarding transition");
  if (transition.data.onboardingId !== onboarding.data.onboardingId
    || transition.data.fromStatus !== onboarding.data.status
    || transition.data.expectedRevision !== onboarding.data.revision) {
    throw new Error("Onboarding transition is stale");
  }
  if (!allowedOnboardingTransitions[onboarding.data.status].includes(transition.data.toStatus)) {
    throw new Error("Onboarding transition is not allowed");
  }
  if (transition.data.toStatus === "failed" && transition.data.failureReason === null) {
    throw new Error("Failed onboarding requires a failure reason");
  }
  if (transition.data.toStatus === "reactivated" && transition.data.approvalReference === null) {
    throw new Error("Reactivation requires approval");
  }
  if (transition.data.toStatus === "completed" && onboarding.data.milestones.some((milestone) => milestone.status === "pending" || milestone.status === "in_progress" || milestone.status === "blocked")) {
    throw new Error("Onboarding milestones are incomplete");
  }
  return Object.freeze({
    ...onboarding.data,
    status: transition.data.toStatus,
    revision: onboarding.data.revision + 1,
    failureReason: transition.data.toStatus === "failed" || transition.data.toStatus === "reactivated"
      ? transition.data.toStatus === "failed" ? transition.data.failureReason : onboarding.data.failureReason
      : null,
    reactivatedFromRevision: transition.data.toStatus === "reactivated" ? onboarding.data.revision : null,
  });
}

export function isOnboardingTerminal(status: OnboardingStatus): boolean {
  return terminalOnboardingStatuses.has(status);
}

export { milestoneSchema, checkInSchema, riskSchema };
