import { describe, expect, test } from "vitest";

import { operationalEvidenceSchema } from "./operational-evidence";

const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  actorIdentityId: "22222222-2222-4222-8222-222222222222",
  correlationId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
};

describe("operational evidence command", () => {
  test("accepts bounded availability observations", () => {
    expect(operationalEvidenceSchema.parse({
      ...base,
      kind: "availability",
      observationId: "55555555-5555-4555-8555-555555555555",
      serviceId: "web:primary",
      observedAt: "2026-09-03T16:00:00Z",
      durationSeconds: 60,
      outcome: "available",
      maintenance: false,
      source: "synthetic",
    }).kind).toBe("availability");
  });

  test("accepts bounded performance measurements", () => {
    const parsed = operationalEvidenceSchema.parse({
      ...base,
      kind: "performance",
      measurementId: "66666666-6666-4666-8666-666666666666",
      route: "/sign-in",
      measuredAt: "2026-09-03T16:00:00Z",
      sampleCount: 50,
      lcpP75Ms: 1800,
      inpP75Ms: 120,
    });
    expect(parsed.kind).toBe("performance");
    if (parsed.kind === "performance") expect(parsed.lcpP75Ms).toBe(1800);
  });

  test.each([
    ["unknown field", { extra: true }],
    ["invalid route", { kind: "performance", route: "https://example.invalid" }],
    ["zero sample count", { kind: "performance", sampleCount: 0 }],
    ["oversized availability window", { kind: "availability", durationSeconds: 86_401 }],
  ])("rejects %s", (_name, change) => {
    const input = {
      ...base,
      kind: "performance",
      measurementId: "66666666-6666-4666-8666-666666666666",
      route: "/",
      measuredAt: "2026-09-03T16:00:00Z",
      sampleCount: 50,
      lcpP75Ms: 1800,
      inpP75Ms: 120,
      ...change,
    };
    expect(operationalEvidenceSchema.safeParse(input).success).toBe(false);
  });
});
