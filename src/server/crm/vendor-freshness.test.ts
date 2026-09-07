import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { assessVendorFreshness } from "./vendor-freshness";

describe("vendor freshness compliance", () => {
  test("meets the 95 percent published-record target", () => {
    const records = Array.from({ length: 20 }, (_, index) => ({ factId: randomUUID(), status: "published" as const, freshUntil: index === 19 ? "2026-08-01T00:00:00.000Z" : "2026-09-30T00:00:00.000Z" }));
    expect(assessVendorFreshness(records, new Date("2026-09-03T00:00:00.000Z"))).toMatchObject({ freshPublished: 19, totalPublished: 20, compliant: true });
  });
  test("does not claim compliance for an empty population", () => expect(assessVendorFreshness([]).compliant).toBe(false));
});
