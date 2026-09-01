import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const eventKinds = ["response_received", "qualified", "demo_completed", "won", "onboarded", "payment_received", "failed"] as const;
type VendorPerformanceEventKind = (typeof eventKinds)[number];

const vendorPerformanceEventSchema = z
  .strictObject({
    eventId: uuid,
    vendorOrganizationId: uuid,
    customerOrganizationId: uuid,
    dealId: uuid,
    kind: z.enum(eventKinds),
    occurredAt: timestamp,
  })
  .refine((event) => event.vendorOrganizationId !== event.customerOrganizationId, {
    path: ["customerOrganizationId"],
    message: "Vendor and customer organizations must differ",
  });

export type VendorPerformanceEvent = z.infer<typeof vendorPerformanceEventSchema>;

export type VendorPerformanceReportRow = Readonly<{
  vendorOrganizationId: string;
  responseCount: number;
  qualifiedCount: number;
  demoCount: number;
  wonCount: number;
  onboardedCount: number;
  paymentCount: number;
  failureCount: number;
}>;

export type VendorPerformanceReport = Readonly<{
  asOf: string;
  vendors: readonly VendorPerformanceReportRow[];
}>;

function parseAsOf(value: string | Date): string {
  const asOf = value instanceof Date ? value.toISOString() : value;
  if (!timestamp.safeParse(asOf).success) throw new Error("Invalid vendor performance as-of timestamp");
  return asOf;
}

function countKind(events: readonly VendorPerformanceEvent[], kind: VendorPerformanceEventKind): number {
  return events.filter((event) => event.kind === kind).length;
}

/** Builds vendor-performance totals only from immutable, organization-scoped events. */
export function summarizeVendorPerformance(eventsInput: readonly unknown[], asOfInput: string | Date): VendorPerformanceReport {
  const asOf = parseAsOf(asOfInput);
  const events = eventsInput.map((value) => vendorPerformanceEventSchema.parse(value));
  const eventIds = new Set<string>();
  for (const event of events) {
    if (eventIds.has(event.eventId)) throw new Error("Duplicate vendor performance event");
    eventIds.add(event.eventId);
    if (Date.parse(event.occurredAt) > Date.parse(asOf)) throw new Error("Vendor performance source is after report as-of");
  }
  const vendors = [...new Set(events.map((event) => event.vendorOrganizationId))].sort().map((vendorOrganizationId) => {
    const vendorEvents = events.filter((event) => event.vendorOrganizationId === vendorOrganizationId);
    return Object.freeze({
      vendorOrganizationId,
      responseCount: countKind(vendorEvents, "response_received"),
      qualifiedCount: countKind(vendorEvents, "qualified"),
      demoCount: countKind(vendorEvents, "demo_completed"),
      wonCount: countKind(vendorEvents, "won"),
      onboardedCount: countKind(vendorEvents, "onboarded"),
      paymentCount: countKind(vendorEvents, "payment_received"),
      failureCount: countKind(vendorEvents, "failed"),
    });
  });
  return Object.freeze({ asOf, vendors: Object.freeze(vendors) });
}

export { vendorPerformanceEventSchema };
