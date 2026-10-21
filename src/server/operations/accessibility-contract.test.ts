import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { accessibilityCheckKinds, summarizeAccessibility } from "./accessibility-contract";

function evidence(route: string, kind: string, overrides: Record<string, unknown> = {}) {
  return { evidenceId: randomUUID(), route, kind, testedAt: "2026-08-31T12:00:00.000Z", passed: true, issueCount: 0, reference: "axe://run-123", ...overrides };
}

function completeEvidence() {
  return ["/", "/sign-in"].flatMap((route) => accessibilityCheckKinds.map((kind) => evidence(route, kind)));
}

describe("accessibility evidence contract", () => {
  test("requires complete route and check-kind coverage", () => {
    const result = summarizeAccessibility(completeEvidence(), "2026-08-31T23:00:00.000Z", ["/", "/sign-in"]);
    expect(result.evidence).toHaveLength(8);
    expect(result.passed).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("reports failed checks without hiding issue state", () => {
    const result = summarizeAccessibility(completeEvidence().map((row, index) => index === 0 ? { ...row, passed: false, issueCount: 2, reference: null } : row), "2026-08-31T23:00:00.000Z", ["/", "/sign-in"]);
    expect(result.passed).toBe(false);
    expect(result.evidence[0]?.issueCount).toBe(2);
  });

  test("accepts a Date as-of", () => {
    expect(summarizeAccessibility(completeEvidence(), new Date("2026-08-31T23:00:00.000Z"), ["/", "/sign-in"]).passed).toBe(true);
  });

  test.each([
    ["missing coverage", completeEvidence().slice(1), "Missing required"],
    ["duplicate check", [...completeEvidence(), completeEvidence()[0]], "Duplicate accessibility check"],
    ["future evidence", completeEvidence().map((row, index) => index === 0 ? { ...row, testedAt: "2026-09-01T00:00:00.000Z" } : row), "after report as-of"],
    ["unexpected route", [...completeEvidence(), evidence("/platform", "keyboard")], "Unexpected accessibility"],
  ] as const)("rejects %s", (_label, rows, message) => {
    expect(() => summarizeAccessibility(rows, "2026-08-31T23:00:00.000Z", ["/", "/sign-in"])).toThrow(message);
  });

  test("rejects malformed pass and route inputs", () => {
    expect(() => summarizeAccessibility(completeEvidence().map((row, index) => index === 0 ? { ...row, passed: true, issueCount: 1 } : row), "2026-08-31T23:00:00.000Z", ["/", "/sign-in"])).toThrow("Invalid accessibility evidence");
    expect(() => summarizeAccessibility([], "2026-08-31T23:00:00.000Z", ["bad route"])).toThrow("Invalid required accessibility routes");
  });
});
