import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { summarizeAnalyticsReport } from "./report-contract";

function event(name: string, occurredAt = "2026-08-31T12:00:00.000Z", properties: Record<string, unknown> = {}) {
  return { eventId: randomUUID(), name, occurredAt, consent: "granted", properties };
}

describe("analytics report contract", () => {
  test("summarizes funnels and workflow use deterministically", () => {
    const result = summarizeAnalyticsReport([
      event("page_view"), event("lead_form_submitted"), event("intake_started"),
      event("evaluation_started"), event("activation_completed"), event("workflow_action"),
    ], "2026-08-31T23:00:00.000Z");
    expect(result.totalEvents).toBe(6);
    expect(result.funnel).toEqual({ marketing: 1, leads: 1, intake: 1, evaluation: 1, activation: 1 });
    expect(result.workflowActions).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("accepts a Date as-of and excludes no earlier event", () => {
    const result = summarizeAnalyticsReport([event("page_view", "2026-08-30T12:00:00.000Z")], new Date("2026-08-31T12:00:00.000Z"));
    expect(result.byName.page_view).toBe(1);
  });

  test.each([
    ["missing consent", { consent: "denied" }],
    ["sensitive property", { properties: { customer_id: "private" } }],
    ["unknown event", { name: "private_event" }],
    ["nested property", { properties: { source: { value: true } } }],
  ] as const)("rejects %s", (_label, overrides) => {
    expect(() => summarizeAnalyticsReport([event("page_view", "2026-08-31T12:00:00.000Z", {},), { ...event("page_view"), ...overrides }], "2026-08-31T23:00:00.000Z")).toThrow("Invalid analytics report event");
  });

  test("rejects duplicates and future events", () => {
    const row = event("page_view");
    expect(() => summarizeAnalyticsReport([row, row], "2026-08-31T23:00:00.000Z")).toThrow("Duplicate analytics event");
    expect(() => summarizeAnalyticsReport([event("page_view", "2026-09-01T00:00:00.000Z")], "2026-08-31T23:00:00.000Z")).toThrow("after report as-of");
  });
});
