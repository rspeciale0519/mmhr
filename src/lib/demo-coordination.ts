import { z } from "zod";
import { demoAvailabilitySchema, demoOutcomeSchema, demoPlanSchema, demoScheduleSchema } from "./demo-planning";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid };
const existing = { ...metadata, demoId: uuid, expectedRevision: z.number().int().min(1).max(9999) };
const reason = z.string().trim().min(1).refine((value) => new TextEncoder().encode(value).length <= 2000);
const choiceCursor = z.strictObject({ candidateId: uuid, recipientId: uuid });
export const demoCoordinationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...metadata, action: z.literal("create"), candidateId: uuid, recipientId: uuid, plan: demoPlanSchema }),
  z.strictObject({ ...existing, action: z.literal("customer_availability"), availability: demoAvailabilitySchema }),
  z.strictObject({ ...existing, action: z.literal("vendor_availability"), availability: demoAvailabilitySchema }),
  z.strictObject({ ...existing, action: z.literal("confirm"), schedule: demoScheduleSchema, reason }),
  z.strictObject({ ...existing, action: z.literal("reopen"), reason }),
  z.strictObject({ ...existing, action: z.literal("complete"), outcome: demoOutcomeSchema, reason }),
  z.strictObject({ ...existing, action: z.literal("cancel"), reason }),
  z.strictObject({ ...existing, action: z.literal("no_show"), outcome: demoOutcomeSchema, reason }),
]);
const status = z.enum(["requested", "scheduled", "completed", "cancelled", "no_show"]);
const date = z.iso.datetime({ offset: true });
export const demoCoordinationStateSchema = z.strictObject({
  plan: demoPlanSchema, customerAvailability: demoAvailabilitySchema.nullable(),
  vendorAvailability: demoAvailabilitySchema.nullable(), schedule: demoScheduleSchema.nullable(),
  outcome: demoOutcomeSchema.nullable(), reason: reason.nullable(),
});
export const demoCoordinationReadSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  view: z.enum(["staff", "customer", "vendor"]), afterId: uuid.optional(), afterChoice: choiceCursor.optional() });
export const demoHistoryReadSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  view: z.enum(["staff", "customer", "vendor"]), demoId: uuid, afterRevision: z.number().int().min(0).max(9999).default(0) });
export const demoHistoryPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid, demoId: uuid,
  nextRevision: z.number().int().positive().nullable(), items: z.array(z.strictObject({ revision: z.number().int().positive(),
    action: z.enum(["create", "customer_availability", "vendor_availability", "confirm", "reopen", "complete", "cancel", "no_show"]),
    status, coordination: demoCoordinationStateSchema, occurredAt: date })).max(25) });
export const demoCoordinationResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  demoId: uuid, revision: z.number().int().positive(), status, outcomeCode: z.enum(["recorded", "replayed"]) });
export const demoCoordinationPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  choices: z.array(z.strictObject({ candidateId: uuid, recipientId: uuid,
    providerName: z.string().min(1).max(200), productName: z.string().min(1).max(200),
    requestTitle: z.string().min(1).max(200),
  })).max(25),
  nextChoiceCursor: choiceCursor.nullable(), nextCursor: uuid.nullable(), items: z.array(z.strictObject({ demoId: uuid, revision: z.number().int().positive(), status,
    customerName: z.string().min(1).max(200), vendorName: z.string().min(1).max(200),
    coordination: demoCoordinationStateSchema, updatedAt: date,
  })).max(25) });
export type DemoCoordinationCommand = z.infer<typeof demoCoordinationCommandSchema>;
export type DemoCoordinationPage = z.infer<typeof demoCoordinationPageSchema>;
export function demoCoordinationPermission(actionOrView: string) {
  if (actionOrView === "customer" || actionOrView === "customer_availability") return "portal.customer.access" as const;
  if (actionOrView === "vendor" || actionOrView === "vendor_availability") return "portal.vendor.access" as const;
  return "rfp.approve" as const;
}
