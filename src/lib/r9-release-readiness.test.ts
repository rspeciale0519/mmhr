import { describe, expect, test } from "vitest";

import {
  evaluateR9ReleaseReadiness,
  R9_RELEASE_CHECKS,
  type R9ReleaseEvidence,
} from "@/lib/r9-release-readiness";

function passingEvidence(): R9ReleaseEvidence {
  return Object.fromEntries(
    R9_RELEASE_CHECKS.map((check) => [check, true]),
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
      restoreDrill: false,
      publicReleaseApproval: false,
    };

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["restoreDrill", "publicReleaseApproval"],
    });
  });

  test("accepts only explicit true values", () => {
    const evidence = {
      ...passingEvidence(),
      securityReview: undefined,
      rollbackRehearsal: "passed",
    } as unknown as R9ReleaseEvidence;

    expect(evaluateR9ReleaseReadiness(evidence)).toEqual({
      ready: false,
      failedChecks: ["securityReview", "rollbackRehearsal"],
    });
  });
});
