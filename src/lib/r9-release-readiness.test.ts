import { describe, expect, test } from "vitest";

import {
  evaluateR9ReleaseReadiness,
  R9_RELEASE_CHECKS,
  type R9ReleaseEvidence,
} from "@/lib/r9-release-readiness";

function passingEvidence(): R9ReleaseEvidence {
  return Object.fromEntries(
    R9_RELEASE_CHECKS.map((check) => [
      check,
      { passed: true, reference: `evidence://${check}` },
    ]),
  ) as R9ReleaseEvidence;
}

describe("R9 release readiness", () => {
  test("opens only when every release check has evidence", () => {
    expect(evaluateR9ReleaseReadiness(passingEvidence())).toEqual({
      ready: true,
      failedChecks: [],
    });
  });

  test("fails closed when evidence is missing", () => {
    expect(evaluateR9ReleaseReadiness({})).toEqual({
      ready: false,
      failedChecks: [...R9_RELEASE_CHECKS],
    });
  });

  test("reports failed checks in the roadmap order", () => {
    const evidence = {
      ...passingEvidence(),
      restoreDrill: { passed: false, reference: "restore-review" },
      publicReleaseApproval: { passed: false, reference: "release-review" },
    };

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["restoreDrill", "publicReleaseApproval"],
    });
  });

  test("accepts only explicit true values", () => {
    const evidence = {
      ...passingEvidence(),
      securityReview: { passed: false, reference: "review-123" },
      rollbackRehearsal: { passed: true, reference: "   " },
    } as unknown as R9ReleaseEvidence;

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["securityReview", "rollbackRehearsal"],
    });
  });

  test("requires a non-empty evidence reference for passed checks", () => {
    const evidence = {
      ...passingEvidence(),
      performanceEvidence: { passed: true, reference: "" },
      availabilityMonitoring: { passed: true, reference: "  " },
    };

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["performanceEvidence", "availabilityMonitoring"],
    });
  });

  test("rejects pending references for passed checks", () => {
    const evidence = {
      ...passingEvidence(),
      restoreDrill: { passed: true, reference: "PENDING://restore-drill" },
    };

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["restoreDrill"],
    });
  });

  test("fails closed for malformed evidence records", () => {
    const evidence = {
      ...passingEvidence(),
      integrationTests: { passed: true },
      securityReview: { passed: "yes", reference: "review-123" },
    } as unknown as R9ReleaseEvidence;

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["integrationTests", "securityReview"],
    });
  });

  test("fails closed for a null evidence payload", () => {
    expect(evaluateR9ReleaseReadiness(null as unknown as R9ReleaseEvidence)).toEqual({
      ready: false,
      failedChecks: [...R9_RELEASE_CHECKS],
    });
  });
});
