import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/?#&=%-]*$/);

export const securityReviewDomains = ["authorization", "rls", "audit", "worker", "privacy", "dependencies", "secrets", "deployment"] as const;
export type SecurityReviewDomain = (typeof securityReviewDomains)[number];

export const securityFindingSchema = z.strictObject({
  findingId: uuid,
  domain: z.enum(securityReviewDomains),
  severity: z.enum(["low", "moderate", "high", "critical"]),
  status: z.enum(["open", "accepted", "mitigated"]),
  reference,
});

export type SecurityFinding = z.output<typeof securityFindingSchema>;

export const securityReviewSchema = z.strictObject({
  reviewId: uuid,
  performedAt: timestamp,
  reviewerIdentityIds: z.array(uuid).min(1).max(10),
  domains: z.array(z.enum(securityReviewDomains)).min(1),
  findings: z.array(securityFindingSchema).max(500),
  reference,
  passed: z.boolean(),
}).superRefine((review, context) => {
  if (new Set(review.reviewerIdentityIds).size !== review.reviewerIdentityIds.length) context.addIssue({ code: "custom", path: ["reviewerIdentityIds"], message: "Reviewers must be unique" });
  if (new Set(review.domains).size !== review.domains.length) context.addIssue({ code: "custom", path: ["domains"], message: "Review domains must be unique" });
  if (review.passed && securityReviewDomains.some((domain) => !review.domains.includes(domain))) context.addIssue({ code: "custom", path: ["domains"], message: "A passed review must cover every security domain" });
  const findingIds = new Set<string>();
  for (const finding of review.findings) {
    if (findingIds.has(finding.findingId)) context.addIssue({ code: "custom", path: ["findings"], message: "Finding IDs must be unique" });
    findingIds.add(finding.findingId);
    if (!review.domains.includes(finding.domain)) context.addIssue({ code: "custom", path: ["findings"], message: "Finding domain is outside the review" });
  }
  const unresolvedHighRisk = review.findings.some((finding) => ["high", "critical"].includes(finding.severity) && finding.status === "open");
  if (review.passed && unresolvedHighRisk) context.addIssue({ code: "custom", path: ["passed"], message: "A passed review cannot contain open high-risk findings" });
  if (review.passed && review.findings.some((finding) => finding.status === "open")) context.addIssue({ code: "custom", path: ["passed"], message: "A passed review cannot contain open findings" });
});

export type SecurityReview = Readonly<Omit<z.output<typeof securityReviewSchema>, "reviewerIdentityIds" | "domains" | "findings"> & {
  reviewerIdentityIds: readonly string[];
  domains: readonly SecurityReviewDomain[];
  findings: readonly SecurityFinding[];
}>;

/** Validates one time-bounded security review and never hides unresolved findings. */
export function parseSecurityReview(value: unknown, asOfInput?: string | Date): Readonly<SecurityReview> {
  const result = securityReviewSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid security review");
  if (asOfInput !== undefined) {
    const asOf = asOfInput instanceof Date ? asOfInput.toISOString() : asOfInput;
    if (!timestamp.safeParse(asOf).success || Date.parse(result.data.performedAt) > Date.parse(asOf)) throw new Error("Security review is after as-of timestamp");
  }
  return Object.freeze({ ...result.data, reviewerIdentityIds: Object.freeze([...result.data.reviewerIdentityIds]), domains: Object.freeze([...result.data.domains]), findings: Object.freeze(result.data.findings.map((finding) => Object.freeze({ ...finding }))) });
}

export { reference, timestamp, uuid };
