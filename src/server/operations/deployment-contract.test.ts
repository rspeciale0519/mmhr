import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { parseDeploymentSmokeEvidence } from "./deployment-contract";

const canonicalOrigin = "https://mmhr.example";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: randomUUID(), deploymentId: randomUUID(), environment: "staging", canonicalOrigin,
    commitSha: "0123456789abcdef0123456789abcdef01234567", checkedAt: "2026-08-31T12:00:00.000Z",
    health: "ok", protectedRoutesClosed: true, migrationBackwardCompatible: true, passed: true,
    reference: "deploy://smoke-1", ...overrides,
  };
}

describe("deployment smoke evidence contract", () => {
  test("accepts a healthy rollback-compatible smoke result", () => {
    const result = parseDeploymentSmokeEvidence(evidence(), canonicalOrigin, "2026-08-31T23:00:00.000Z");
    expect(result.environment).toBe("staging");
    expect(result.passed).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("accepts a Date as-of", () => {
    expect(parseDeploymentSmokeEvidence(evidence(), canonicalOrigin, new Date("2026-08-31T23:00:00.000Z")).passed).toBe(true);
  });

  test("preserves failed smoke state for remediation", () => {
    const result = parseDeploymentSmokeEvidence(evidence({ passed: false, health: "degraded", reference: "deploy://smoke-2" }), canonicalOrigin);
    expect(result.health).toBe("degraded");
    expect(result.passed).toBe(false);
  });

  test.each([
    ["origin mismatch", { canonicalOrigin: "https://other.example" }, "canonical origin"],
    ["path origin", { canonicalOrigin: "https://mmhr.example/app" }, "Invalid deployment"],
    ["failed health on passed evidence", { health: "failed" }, "Invalid deployment"],
    ["open protected route on passed evidence", { protectedRoutesClosed: false }, "Invalid deployment"],
    ["incompatible migration on passed evidence", { migrationBackwardCompatible: false }, "Invalid deployment"],
  ] as const)("rejects %s", (_label, overrides, message) => {
    expect(() => parseDeploymentSmokeEvidence(evidence(overrides), canonicalOrigin)).toThrow(message);
  });

  test("rejects future, malformed, and missing release evidence", () => {
    expect(() => parseDeploymentSmokeEvidence(evidence({ checkedAt: "2026-09-01T00:00:00.000Z" }), canonicalOrigin, "2026-08-31T23:00:00.000Z")).toThrow("after as-of");
    expect(() => parseDeploymentSmokeEvidence(evidence({ commitSha: "bad" }), canonicalOrigin)).toThrow("Invalid deployment");
    expect(() => parseDeploymentSmokeEvidence(evidence({ canonicalOrigin: "http://mmhr.example" }), canonicalOrigin)).toThrow("Invalid deployment");
  });
});
