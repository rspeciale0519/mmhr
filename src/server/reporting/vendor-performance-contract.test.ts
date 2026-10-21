import { describe, expect, test } from "vitest";

import { summarizeVendorPerformance, vendorPerformanceEventSchema } from "./vendor-performance-contract";

const vendorId = "00000000-0000-4000-8000-000000000701";
const customerId = "00000000-0000-4000-8000-000000000702";
const dealId = "00000000-0000-4000-8000-000000000703";

function event(overrides: Record<string, unknown> = {}) {
  return { eventId: "00000000-0000-4000-8000-000000000704", vendorOrganizationId: vendorId, customerOrganizationId: customerId, dealId, kind: "response_received", occurredAt: "2026-08-01T00:00:00.000Z", ...overrides };
}

describe("R8 vendor-performance report contract", () => {
  test("requires distinct vendor and customer organizations", () => {
    expect(vendorPerformanceEventSchema.safeParse(event()).success).toBe(true);
    expect(vendorPerformanceEventSchema.safeParse(event({ customerOrganizationId: vendorId })).success).toBe(false);
  });

  test("aggregates allowlisted vendor event kinds", () => {
    const result = summarizeVendorPerformance([
      event(), event({ eventId: "00000000-0000-4000-8000-000000000705", kind: "qualified" }), event({ eventId: "00000000-0000-4000-8000-000000000706", kind: "won" }), event({ eventId: "00000000-0000-4000-8000-000000000707", kind: "failed" }),
    ], "2026-12-31T00:00:00.000Z");
    expect(result.vendors).toEqual([{ vendorOrganizationId: vendorId, responseCount: 1, qualifiedCount: 1, demoCount: 0, wonCount: 1, onboardedCount: 0, paymentCount: 0, failureCount: 1 }]);
  });

  test("keeps vendors separate and sorts them deterministically", () => {
    const secondVendor = "00000000-0000-4000-8000-000000000708";
    const result = summarizeVendorPerformance([event(), event({ eventId: "00000000-0000-4000-8000-000000000709", vendorOrganizationId: secondVendor })], "2026-12-31T00:00:00.000Z");
    expect(result.vendors.map((row) => row.vendorOrganizationId)).toEqual([vendorId, secondVendor]);
  });

  test("rejects duplicate and future events", () => {
    expect(() => summarizeVendorPerformance([event(), event()], "2026-12-31T00:00:00.000Z")).toThrow("Duplicate vendor performance");
    expect(() => summarizeVendorPerformance([event({ occurredAt: "2027-01-01T00:00:00.000Z" })], "2026-12-31T00:00:00.000Z")).toThrow("after report as-of");
  });

  test("rejects invalid as-of values", () => {
    expect(() => summarizeVendorPerformance([], "invalid")).toThrow("Invalid vendor performance as-of");
  });
});
