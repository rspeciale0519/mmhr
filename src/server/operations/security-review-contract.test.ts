import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { parseSecurityReview, securityReviewDomains } from "./security-review-contract";

const reviewer = randomUUID();

function review(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: randomUUID(), performedAt: "2026-08-31T12:00:00.000Z", reviewerIdentityIds: [reviewer],
    domains: [...securityReviewDomains], findings: [], reference: "review://r9-1", passed: true, ...overrides,
  };
}

describe("security review evidence contract", () => {
  test("accepts a passed review with complete evidence", () => {
    const result = parseSecurityReview(review(), "2026-08-31T23:00:00.000Z");
    expect(result.passed).toBe(true);
    expect(result.domains).toEqual(securityReviewDomains);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("preserves mitigated and accepted findings", () => {
    const result = parseSecurityReview(review({
      passed: false,
      findings: [
        { findingId: randomUUID(), domain: "authorization", severity: "high", status: "mitigated", reference: "issue://1" },
        { findingId: randomUUID(), domain: "rls", severity: "moderate", status: "accepted", reference: "issue://2" },
      ],
    }));
    expect(result.findings).toHaveLength(2);
  });

  test("accepts a Date as-of", () => {
    expect(parseSecurityReview(review(), new Date("2026-08-31T23:00:00.000Z")).passed).toBe(true);
  });

  test.each([
    ["open high-risk finding", { findings: [{ findingId: randomUUID(), domain: "authorization", severity: "critical", status: "open", reference: "issue://1" }] }],
    ["open low-risk finding on passed review", { findings: [{ findingId: randomUUID(), domain: "authorization", severity: "low", status: "open", reference: "issue://1" }] }],
    ["duplicate reviewers", { reviewerIdentityIds: [reviewer, reviewer] }],
    ["duplicate domains", { domains: ["authorization", "authorization"] }],
    ["finding outside review", { passed: false, domains: ["authorization", "rls"], findings: [{ findingId: randomUUID(), domain: "worker", severity: "low", status: "mitigated", reference: "issue://1" }] }],
    ["incomplete passed review", { domains: ["authorization", "rls"] }],
  ] as const)("rejects %s", (_label, overrides) => {
    expect(() => parseSecurityReview(review(overrides))).toThrow("Invalid security review");
  });

  test("rejects future reviews and malformed inputs", () => {
    expect(() => parseSecurityReview(review({ performedAt: "2026-09-01T00:00:00.000Z" }), "2026-08-31T23:00:00.000Z")).toThrow("after as-of");
    expect(() => parseSecurityReview(review({ domains: ["unknown"] }))).toThrow("Invalid security review");
    expect(securityReviewDomains).toContain("secrets");
  });
});
