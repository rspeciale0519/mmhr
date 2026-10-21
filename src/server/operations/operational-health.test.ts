import { describe, expect, test } from "vitest";

import { parseOperationalHealthEvent, summarizeOperationalHealth } from "./operational-health";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "33333333-3333-4333-8333-333333333333",
    organizationId,
    occurredAt: "2026-08-31T12:00:00.000Z",
    kind: "job_outcome",
    outcome: "success",
    sourceId: "job:33333333-3333-4333-8333-333333333333",
    providerId: "trigger:local",
    durationMs: 250,
    costMinorUnits: null,
    currency: null,
    ...overrides,
  };
}

describe("operational health contract", () => {
  test("accepts redacted provider-neutral fields and rejects content or unknown fields", () => {
    expect(parseOperationalHealthEvent(event())).toMatchObject({ kind: "job_outcome", outcome: "success" });
    expect(() => parseOperationalHealthEvent(event({ message: "private content" }))).toThrow(
      "Invalid operational health event",
    );
    expect(() => parseOperationalHealthEvent(event({ customerEmail: "person@example.com" }))).toThrow(
      "Invalid operational health event",
    );
  });

  test("requires matching cost fields and required sources", () => {
    expect(() => parseOperationalHealthEvent(event({ costMinorUnits: 4 }))).toThrow(
      "Invalid operational health event",
    );
    expect(() => parseOperationalHealthEvent(event({ kind: "provider_cost", sourceId: null }))).toThrow(
      "Invalid operational health event",
    );
    expect(() => parseOperationalHealthEvent(event({ kind: "communication_delivery", sourceId: null }))).toThrow(
      "Invalid operational health event",
    );
  });

  test("summarizes outcomes and provider costs by organization", () => {
    const report = summarizeOperationalHealth(
      [
        event(),
        event({ eventId: "44444444-4444-4444-8444-444444444444", outcome: "failure", kind: "application_error" }),
        event({
          eventId: "55555555-5555-4555-8555-555555555555",
          kind: "provider_cost",
          outcome: "success",
          sourceId: "provider:firecrawl",
          providerId: "firecrawl",
          costMinorUnits: 125,
          currency: "USD",
        }),
        event({
          eventId: "66666666-6666-4666-8666-666666666666",
          kind: "provider_cost",
          outcome: "success",
          sourceId: "provider:firecrawl",
          providerId: "firecrawl",
          costMinorUnits: 75,
          currency: "USD",
        }),
      ],
      "2026-08-31T12:01:00.000Z",
      organizationId,
    );

    expect(report.totalEvents).toBe(4);
    expect(report.byKind.job_outcome.success).toBe(1);
    expect(report.byKind.application_error.failure).toBe(1);
    expect(report.costByCurrency).toEqual([{ currency: "USD", totalMinorUnits: 200 }]);
  });

  test("fails closed on duplicates, cross organization events, and future events", () => {
    expect(() => summarizeOperationalHealth([event(), event()], "2026-08-31T12:01:00.000Z", organizationId)).toThrow(
      "Duplicate operational health event",
    );
    expect(() => summarizeOperationalHealth([event({ organizationId: otherOrganizationId })], "2026-08-31T12:01:00.000Z", organizationId)).toThrow(
      "belongs to another organization",
    );
    expect(() => summarizeOperationalHealth([event({ occurredAt: "2026-08-31T12:02:00.000Z" })], "2026-08-31T12:01:00.000Z", organizationId)).toThrow(
      "after report as-of",
    );
  });
});
