import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(2_000);

export const dealStages = ["lead", "discovery", "evaluation", "proposal", "selection", "contracting", "won", "lost", "archived"] as const;
export type DealStage = (typeof dealStages)[number];
export const dealStatuses = ["open", "won", "lost", "archived"] as const;
export type DealStatus = (typeof dealStatuses)[number];

export const dealInputSchema = z.strictObject({
  dealId: uuid,
  customerOrganizationId: uuid,
  vendorOrganizationId: uuid.nullable(),
  productId: uuid.nullable(),
  ownerIdentityId: uuid,
  stage: z.enum(dealStages),
  status: z.enum(dealStatuses),
  candidateId: uuid.nullable(),
  contractId: uuid.nullable(),
  expectedCloseAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: z.number().int().positive(),
  correlationId: uuid,
}).superRefine((deal, context) => {
  if (deal.vendorOrganizationId !== null && deal.customerOrganizationId === deal.vendorOrganizationId) {
    context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "Customer and vendor must be different organizations" });
  }
  if (deal.productId !== null && deal.vendorOrganizationId === null) {
    context.addIssue({ code: "custom", path: ["productId"], message: "A product requires a vendor organization" });
  }
  if (Date.parse(deal.updatedAt) < Date.parse(deal.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Deal update cannot precede creation" });
  }
  const expectedStatus = deal.stage === "won" ? "won" : deal.stage === "lost" ? "lost" : deal.stage === "archived" ? "archived" : "open";
  if (deal.status !== expectedStatus) {
    context.addIssue({ code: "custom", path: ["status"], message: "Deal status must match its stage" });
  }
});

export type DealInput = z.output<typeof dealInputSchema>;
export type DealRecord = Readonly<DealInput & { history: readonly DealTransition[] }>;

export const dealTransitionSchema = z.strictObject({
  dealId: uuid,
  fromStage: z.enum(dealStages),
  toStage: z.enum(dealStages),
  fromStatus: z.enum(dealStatuses),
  toStatus: z.enum(dealStatuses),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason,
  correlationId: uuid,
});

export type DealTransition = z.output<typeof dealTransitionSchema>;

const allowedTransitions: Readonly<Record<DealStage, readonly DealStage[]>> = {
  lead: ["discovery", "archived"],
  discovery: ["evaluation", "archived"],
  evaluation: ["proposal", "archived"],
  proposal: ["selection", "archived"],
  selection: ["contracting", "archived"],
  contracting: ["won", "lost", "archived"],
  won: [],
  lost: [],
  archived: [],
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function parseDeal(value: unknown): DealInput {
  const result = dealInputSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid deal");
  return result.data;
}

/** Creates the first immutable open deal snapshot at the lead stage. */
export function createDeal(value: unknown): DealRecord {
  const deal = parseDeal(value);
  if (deal.stage !== "lead" || deal.status !== "open") throw new Error("New deals must start at the lead stage");
  return deepFreeze({ ...deal, history: [] });
}

/** Applies one allowed stage transition and appends the immutable audit history. */
export function transitionDeal(record: DealRecord, value: unknown): DealRecord {
  const result = dealTransitionSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid deal transition");
  const transition = result.data;
  if (transition.dealId !== record.dealId) throw new Error("Deal transition ID does not match");
  if (transition.fromStage !== record.stage || transition.fromStatus !== record.status || transition.expectedRevision !== record.revision) {
    throw new Error("Deal transition is stale");
  }
  if (!allowedTransitions[record.stage].includes(transition.toStage)) throw new Error("Deal transition is not allowed");
  const expectedStatus = transition.toStage === "won" ? "won" : transition.toStage === "lost" ? "lost" : transition.toStage === "archived" ? "archived" : "open";
  if (transition.toStatus !== expectedStatus) throw new Error("Deal transition status does not match stage");
  return deepFreeze({
    ...record,
    stage: transition.toStage,
    status: transition.toStatus,
    revision: record.revision + 1,
    updatedAt: transition.occurredAt,
    history: [...record.history, transition],
  });
}

export function canTransitionDeal(from: DealStage, to: DealStage): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export { allowedTransitions, reason, timestamp, uuid };
