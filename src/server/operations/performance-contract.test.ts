import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { inpP75BudgetMs, lcpP75BudgetMs, summarizePerformance } from "./performance-contract";

function measurement(route: string, overrides: Record<string, unknown> = {}) {
  return { measurementId: randomUUID(), route, measuredAt: "2026-08-31T12:00:00.000Z", sampleCount: 50, lcpP75Ms: 1_800, inpP75Ms: 120, ...overrides };
}

describe("performance evidence contract", () => {
  test("reports every required route and budget status deterministically", () => {
    const result = summarizePerformance([
      measurement("/"), measurement("/sign-in"), measurement("/customer"), measurement("/vendor"), measurement("/admin", { lcpP75Ms: 3_000 }),
    ], "2026-08-31T23:00:00.000Z");
    expect(result.routes.map((item) => item.route)).toEqual(["/", "/sign-in", "/customer", "/vendor", "/admin"]);
    expect(result.routes.at(-1)?.meetsLcpBudget).toBe(false);
    expect(result.meetsAllBudgets).toBe(false);
    expect(lcpP75BudgetMs).toBe(2_500);
    expect(inpP75BudgetMs).toBe(200);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("accepts a Date as-of and custom required routes", () => {
    const result = summarizePerformance([measurement("/platform")], new Date("2026-08-31T23:00:00.000Z"), ["/platform"]);
    expect(result.meetsAllBudgets).toBe(true);
  });

  test.each([
    ["missing route", [measurement("/")], ["/", "/admin"], "Missing required"],
    ["unexpected route", [measurement("/platform")], ["/"], "Unexpected"],
    ["duplicate route", [measurement("/"), measurement("/")], ["/"], "Duplicate performance route"],
    ["future measurement", [measurement("/", { measuredAt: "2026-09-01T00:00:00.000Z" })], ["/"], "after report as-of"],
  ] as const)("rejects %s", (_label, measurements, routes, message) => {
    expect(() => summarizePerformance(measurements, "2026-08-31T23:00:00.000Z", routes)).toThrow(message);
  });

  test("rejects malformed measurements and route definitions", () => {
    expect(() => summarizePerformance([measurement("/")], "2026-08-31T23:00:00.000Z", ["not-a-route"])).toThrow("Invalid required");
    expect(() => summarizePerformance([{ ...measurement("/"), sampleCount: 0 }], "2026-08-31T23:00:00.000Z", ["/"])).toThrow("Invalid performance measurement");
    const row = measurement("/");
    expect(() => summarizePerformance([row, { ...row, measurementId: randomUUID() }], "2026-08-31T23:00:00.000Z", ["/"])).toThrow("Duplicate performance route");
  });
});
