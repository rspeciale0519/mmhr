import { z } from "zod";
import { proposalQuoteSchema } from "@/lib/proposal-quote";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(9999);
const time = z.iso.datetime({ offset: true });
const text = (maximumBytes: number) => z.string().trim().min(1).refine((value) =>
  new TextEncoder().encode(value).length <= maximumBytes
  && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), "Use bounded plain text.");
const textList = (count: number, maximumBytes: number) => z.array(text(500)).max(count).refine((values) =>
  new TextEncoder().encode(`[${values.map((value) => JSON.stringify(value)).join(", ")}]`).length <= maximumBytes,
  "Use bounded plain text lists.");

export const portalHandoffStatuses = ["introduction_pending", "introduced", "negotiating", "stalled", "signed", "not_signed", "cancelled"] as const;
export type PortalHandoffStatus = (typeof portalHandoffStatuses)[number];
export const portalSelectionStates = ["pending", "approved", "rejected", "withdrawn"] as const;

const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid };
const selection = { ...metadata, selectionId: uuid, expectedRevision: revision };
const handoff = { ...metadata, handoffId: uuid, expectedRevision: revision, reason: text(2000) };

// Parties record a business decision. Auth supplies the actor, approval identity,
// record date, vendor, and deal. The browser cannot assign those values.
export const portalHandoffCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...metadata, action: z.literal("select"), intakeId: uuid, comparisonId: uuid.nullable(),
    proposalVersionId: uuid, expectedQuoteRevision: revision,
    selectionReasons: textList(10, 6000).refine((values) => values.length > 0), remainingRisks: textList(20, 12000) }),
  z.strictObject({ ...selection, action: z.literal("withdraw_selection"), reason: text(2000) }),
  z.strictObject({ ...selection, action: z.literal("approve_selection"), reason: text(2000), approvalReference: text(300) }),
  z.strictObject({ ...selection, action: z.literal("reject_selection"), reason: text(2000) }),
  z.strictObject({ ...handoff, action: z.literal("introduce"), introducedAt: time, introductionReference: text(500) }),
  z.strictObject({ ...handoff, action: z.literal("transition"), fromStatus: z.enum(portalHandoffStatuses),
    toStatus: z.enum(["negotiating", "stalled", "not_signed", "cancelled"]) }),
  z.strictObject({ ...handoff, action: z.literal("record_signed"), signedAt: time, contractReference: text(500) }),
]);
export type PortalHandoffCommand = z.output<typeof portalHandoffCommandSchema>;

export function portalHandoffPermission(actionOrView: string): "portal.customer.access" | "portal.vendor.access" | "rfp.approve" {
  if (actionOrView === "vendor") return "portal.vendor.access";
  return ["select", "withdraw_selection", "customer"].includes(actionOrView) ? "portal.customer.access" : "rfp.approve";
}

export const portalHandoffReadSchema = z.discriminatedUnion("view", [
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("customer"), intakeId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("staff"), intakeId: uuid, afterId: uuid.optional() }),
  z.strictObject({ organizationId: uuid, correlationId: uuid, view: z.literal("vendor"), recipientId: uuid, afterId: uuid.optional() }),
]);
export type PortalHandoffRead = z.output<typeof portalHandoffReadSchema>;

export const portalHandoffResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  selectionId: uuid, selectionState: z.enum(portalSelectionStates), selectionRevision: revision,
  handoffId: uuid.nullable(), status: z.enum(portalHandoffStatuses).nullable(), revision: revision.nullable(),
  outcomeCode: z.enum(["recorded", "replayed"]) }).superRefine((value, context) => {
  if ((value.selectionState === "approved") !== (value.handoffId !== null && value.status !== null && value.revision !== null)) {
    context.addIssue({ code: "custom", message: "Approved selections require one handoff." });
  }
  if (value.selectionState !== "approved" && [value.handoffId, value.status, value.revision].some((field) => field !== null)) {
    context.addIssue({ code: "custom", message: "Pending decisions cannot include handoff values." });
  }
  if (value.selectionRevision !== (value.selectionState === "pending" ? 1 : 2)) {
    context.addIssue({ code: "custom", message: "Selection decision revision is inconsistent." });
  }
});
export type PortalHandoffResult = z.output<typeof portalHandoffResultSchema>;

export const portalHandoffChoiceSchema = z.strictObject({ comparisonId: uuid.nullable(), proposalVersionId: uuid,
  quoteRevision: revision, versionNumber: revision, vendorName: text(200), quote: proposalQuoteSchema });
const event = z.strictObject({ eventId: uuid, revision, fromStatus: z.enum(portalHandoffStatuses), toStatus: z.enum(portalHandoffStatuses),
  reason: text(2000), occurredAt: time });
export const portalHandoffItemSchema = z.strictObject({ selectionId: uuid, intakeId: uuid, recipientId: uuid,
  proposalVersionId: uuid, comparisonId: uuid.nullable(), vendorName: text(200), quoteReference: text(200),
  selectionReasons: textList(10, 6000), remainingRisks: textList(20, 12000),
  state: z.enum(portalSelectionStates), revision, selectedAt: time, decidedAt: time.nullable(),
  decisionReason: text(2000).nullable(), current: z.boolean(), canApprove: z.boolean(), canReject: z.boolean(), canWithdraw: z.boolean(),
  handoffId: uuid.nullable(), status: z.enum(portalHandoffStatuses).nullable(), handoffRevision: revision.nullable(),
  introducedAt: time.nullable(), introductionReference: text(500).nullable(),
  signedAt: time.nullable(), contractReference: text(500).nullable(),
  canIntroduce: z.boolean(), canUpdate: z.boolean(), events: z.array(event).max(3), hasMoreHistory: z.boolean(),
}).superRefine((value, context) => {
  const handoffValues = [value.handoffId, value.status, value.handoffRevision];
  if (value.state === "approved" ? handoffValues.some((field) => field === null) : handoffValues.some((field) => field !== null)) {
    context.addIssue({ code: "custom", message: "Selection and handoff states disagree." });
  }
  if (value.state === "pending" ? value.revision !== 1 || value.decidedAt !== null : value.revision !== 2 || value.decidedAt === null) {
    context.addIssue({ code: "custom", message: "Selection decision is inconsistent." });
  }
  if ((value.introducedAt === null) !== (value.introductionReference === null)
    || (value.signedAt === null) !== (value.contractReference === null)
    || (value.status === "signed") !== (value.signedAt !== null)
    || (value.status !== null && ["introduced", "negotiating", "signed", "not_signed"].includes(value.status) && value.introducedAt === null)) {
    context.addIssue({ code: "custom", message: "Handoff dates and references are inconsistent." });
  }
  if (value.state !== "approved" && (value.introducedAt !== null || value.events.length !== 0 || value.hasMoreHistory)) {
    context.addIssue({ code: "custom", message: "Handoff history requires an approved selection." });
  }
  if ((value.canApprove && (value.state !== "pending" || !value.current))
    || ((value.canReject || value.canWithdraw) && value.state !== "pending")
    || (value.canIntroduce && (!value.current || value.state !== "approved" || value.introducedAt !== null
      || (value.status !== "introduction_pending" && value.status !== "stalled")))
    || (value.canUpdate && (value.state !== "approved" || value.status === null || ["signed", "not_signed", "cancelled"].includes(value.status)))) {
    context.addIssue({ code: "custom", message: "Handoff action availability is inconsistent." });
  }
});
export type PortalHandoffItem = z.output<typeof portalHandoffItemSchema>;
export const portalHandoffPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  items: z.array(portalHandoffItemSchema).max(10), choices: z.array(portalHandoffChoiceSchema).max(25),
  canSelect: z.boolean(), nextCursor: uuid.nullable() });
export type PortalHandoffPage = z.output<typeof portalHandoffPageSchema>;

const historyMetadata = { handoffId: uuid, beforeRevision: revision.optional() };
export const portalHandoffHistoryReadSchema = z.discriminatedUnion("view", [
  portalHandoffReadSchema.options[0].omit({ afterId: true }).extend(historyMetadata),
  portalHandoffReadSchema.options[1].omit({ afterId: true }).extend(historyMetadata),
  portalHandoffReadSchema.options[2].omit({ afterId: true }).extend(historyMetadata),
]);
export const portalHandoffHistoryPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  handoffId: uuid, events: z.array(event).max(25), nextRevision: revision.nullable() });

const transitions: Readonly<Record<PortalHandoffStatus, readonly PortalHandoffStatus[]>> = {
  introduction_pending: ["stalled", "cancelled"],
  introduced: ["negotiating", "stalled", "cancelled"],
  negotiating: ["stalled", "signed", "not_signed", "cancelled"],
  stalled: ["negotiating", "cancelled"],
  signed: [], not_signed: [], cancelled: [],
};
export function canTransitionPortalHandoff(from: PortalHandoffStatus, to: PortalHandoffStatus, introduced: boolean): boolean {
  return transitions[from]?.includes(to) === true && (to !== "negotiating" || introduced);
}
