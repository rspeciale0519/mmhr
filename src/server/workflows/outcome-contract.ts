import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const customerSuccessOutcomeTypes = ["customer_satisfied", "vendor_satisfied", "renewed", "replaced", "expanded", "failed", "cancelled"] as const;
export type CustomerSuccessOutcomeType = (typeof customerSuccessOutcomeTypes)[number];

/** Immutable customer-success outcome used by journey reports and future evaluations. */
export const customerSuccessOutcomeSchema = z
  .strictObject({
    outcomeId: uuid,
    sourceEventId: uuid,
    customerOrganizationId: uuid,
    vendorOrganizationId: uuid,
    dealId: uuid,
    onboardingId: uuid.nullable(),
    followOnDealId: uuid.nullable(),
    outcomeType: z.enum(customerSuccessOutcomeTypes),
    satisfactionScore: z.number().int().min(1).max(5).nullable(),
    summary: z.string().trim().min(1).max(500),
    recordedByIdentityId: uuid,
    recordedAt: timestamp,
  })
  .superRefine((outcome, context) => {
    if (outcome.customerOrganizationId === outcome.vendorOrganizationId) {
      context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "Customer and vendor organizations must differ" });
    }
    const satisfaction = outcome.outcomeType === "customer_satisfied" || outcome.outcomeType === "vendor_satisfied";
    if (satisfaction !== (outcome.satisfactionScore !== null)) {
      context.addIssue({ code: "custom", path: ["satisfactionScore"], message: "Satisfaction outcomes require a score and other outcomes cannot have one" });
    }
    const linkedDealOutcome = outcome.outcomeType === "renewed" || outcome.outcomeType === "replaced" || outcome.outcomeType === "expanded";
    if (linkedDealOutcome && outcome.followOnDealId === null) {
      context.addIssue({ code: "custom", path: ["followOnDealId"], message: "Deal outcomes require a linked follow-on deal" });
    }
  });

export type CustomerSuccessOutcome = z.infer<typeof customerSuccessOutcomeSchema>;

/** Adds one outcome without rewriting or deleting prior history. */
export function appendCustomerSuccessOutcome(historyInput: readonly unknown[], outcomeInput: unknown): readonly CustomerSuccessOutcome[] {
  const history = historyInput.map((value) => customerSuccessOutcomeSchema.parse(value));
  const outcome = customerSuccessOutcomeSchema.safeParse(outcomeInput);
  if (!outcome.success) throw new Error("Invalid customer-success outcome");
  if (history.some((entry) => entry.outcomeId === outcome.data.outcomeId)) throw new Error("Duplicate customer-success outcome");
  if (history.some((entry) => entry.sourceEventId === outcome.data.sourceEventId)) throw new Error("Duplicate customer-success source event");
  return Object.freeze([...history, outcome.data].sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.outcomeId.localeCompare(right.outcomeId)));
}
