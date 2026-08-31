/**
 * R9 release evidence required before production can open.
 *
 * This contract is deliberately pure. CI, deployment tooling, and an
 * operator can provide evidence without this module reading environment
 * variables or changing release state.
 */
export const R9_RELEASE_CHECKS = [
  "standardCi",
  "integrationTests",
  "criticalBrowserJourneys",
  "accessibilityEvidence",
  "performanceEvidence",
  "availabilityMonitoring",
  "deletionDrill",
  "restoreDrill",
  "securityReview",
  "deploymentSmokeTest",
  "rollbackRehearsal",
  "publicReleaseApproval",
] as const;

export type R9ReleaseCheck = (typeof R9_RELEASE_CHECKS)[number];

export type R9ReleaseEvidence = Partial<
  Readonly<Record<R9ReleaseCheck, boolean>>
>;

export type R9ReleaseReadiness = {
  ready: boolean;
  failedChecks: R9ReleaseCheck[];
};

/**
 * Returns whether every required R9 check has passed.
 *
 * Missing evidence fails closed. The function does not perform checks or
 * activate a release.
 */
export function evaluateR9ReleaseReadiness(
  evidence: R9ReleaseEvidence,
): R9ReleaseReadiness {
  const failedChecks = R9_RELEASE_CHECKS.filter(
    (check) => evidence[check] !== true,
  );

  return {
    ready: failedChecks.length === 0,
    failedChecks: [...failedChecks],
  };
}
