import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { summarizeRevenue } from "./revenue-contract";

const organizationId = randomUUID();
const dealId = randomUUID();

function event(kind: string, overrides: Record<string, unknown> = {}) {
  return { eventId: randomUUID(), organizationId, dealId, occurredAt: "2026-08-31T12:00:00.000Z", kind, amountMinorUnits: 1000, currency: "USD", ...overrides };
}

describe("revenue report contract", () => {
  test("summarizes signed and commission lifecycle totals by currency", () => {
    const result = summarizeRevenue([
      event("signed_deal"), event("commission_earned", { amountMinorUnits: 2000 }),
      event("commission_collected", { amountMinorUnits: 1500 }), event("commission_collected", { currency: "EUR", amountMinorUnits: 700 }),
    ], organizationId, "2026-08-31T23:00:00.000Z");
    expect(result.signedDealCount).toBe(1);
    expect(result.totals.commission_collected).toEqual([
      { currency: "EUR", amountMinorUnits: 700, eventCount: 1 },
      { currency: "USD", amountMinorUnits: 1500, eventCount: 1 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("accepts a Date as-of", () => {
    expect(summarizeRevenue([event("signed_deal")], organizationId, new Date("2026-08-31T23:00:00.000Z")).signedDealCount).toBe(1);
  });

  test.each([
    ["another organization", [event("signed_deal", { organizationId: randomUUID() })], "another organization"],
    ["future event", [event("signed_deal", { occurredAt: "2026-09-01T00:00:00.000Z" })], "after report as-of"],
    ["malformed event", [{ ...event("signed_deal"), amountMinorUnits: -1 }], "Invalid revenue event"],
  ] as const)("rejects %s", (_label, events, message) => {
    expect(() => summarizeRevenue(events, organizationId, "2026-08-31T23:00:00.000Z")).toThrow(message);
  });

  test("rejects duplicates and malformed organization input", () => {
    const row = event("signed_deal");
    expect(() => summarizeRevenue([row, row], organizationId, "2026-08-31T23:00:00.000Z")).toThrow("Duplicate revenue event");
    expect(() => summarizeRevenue([row], "not-a-uuid", "2026-08-31T23:00:00.000Z")).toThrow("Invalid revenue report organization");
  });

  test("rejects totals that exceed safe integer precision", () => {
    expect(() => summarizeRevenue([
      event("commission_earned", { amountMinorUnits: Number.MAX_SAFE_INTEGER }),
      event("commission_earned", { amountMinorUnits: 1 }),
    ], organizationId, "2026-08-31T23:00:00.000Z")).toThrow("safe integer");
  });
});
