import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const route = z.string().regex(/^(?:\/|\/[a-z0-9][a-z0-9/_-]*)$/);
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/?#&=%-]*$/);

export const accessibilityCheckKinds = ["keyboard", "screen_reader", "contrast", "automated"] as const;
export type AccessibilityCheckKind = (typeof accessibilityCheckKinds)[number];
export const criticalAccessibilityRoutes = ["/", "/sign-in", "/customer", "/vendor", "/admin"] as const;

export const accessibilityEvidenceSchema = z.strictObject({
  evidenceId: uuid,
  route,
  kind: z.enum(accessibilityCheckKinds),
  testedAt: timestamp,
  passed: z.boolean(),
  issueCount: z.number().int().nonnegative().max(10_000),
  reference: reference.nullable(),
}).superRefine((evidence, context) => {
  if (evidence.passed && (evidence.issueCount !== 0 || evidence.reference === null)) {
    context.addIssue({ code: "custom", path: ["passed"], message: "Passed accessibility evidence requires zero issues and a reference" });
  }
  if (!evidence.passed && evidence.issueCount === 0) {
    context.addIssue({ code: "custom", path: ["issueCount"], message: "Failed accessibility evidence requires an issue count" });
  }
});

export type AccessibilityEvidence = z.output<typeof accessibilityEvidenceSchema>;

export type AccessibilityReport = Readonly<{
  asOf: string;
  evidence: readonly AccessibilityEvidence[];
  passed: boolean;
}>;

function parseAsOf(input: string | Date): string {
  const value = input instanceof Date ? input.toISOString() : input;
  if (!timestamp.safeParse(value).success) throw new Error("Invalid accessibility report as-of timestamp");
  return value;
}

/** Requires one passing result for every check kind on every critical route. */
export function summarizeAccessibility(
  evidenceInput: readonly unknown[],
  asOfInput: string | Date,
  requiredRoutes: readonly string[] = criticalAccessibilityRoutes,
): AccessibilityReport {
  const asOf = parseAsOf(asOfInput);
  if (requiredRoutes.some((value) => !route.safeParse(value).success) || new Set(requiredRoutes).size !== requiredRoutes.length) throw new Error("Invalid required accessibility routes");
  const requiredKeys = new Set(requiredRoutes.flatMap((routeValue) => accessibilityCheckKinds.map((kind) => `${routeValue}:${kind}`)));
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const asOfMs = Date.parse(asOf);
  const parsed: AccessibilityEvidence[] = [];
  for (const value of evidenceInput) {
    const result = accessibilityEvidenceSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid accessibility evidence");
    const evidence = result.data;
    if (seenIds.has(evidence.evidenceId)) throw new Error(`Duplicate accessibility evidence: ${evidence.evidenceId}`);
    seenIds.add(evidence.evidenceId);
    const key = `${evidence.route}:${evidence.kind}`;
    if (!requiredKeys.has(key)) throw new Error(`Unexpected accessibility evidence: ${key}`);
    if (seenKeys.has(key)) throw new Error(`Duplicate accessibility check: ${key}`);
    seenKeys.add(key);
    if (Date.parse(evidence.testedAt) > asOfMs) throw new Error(`Accessibility evidence is after report as-of timestamp: ${evidence.evidenceId}`);
    parsed.push(evidence);
  }
  if (seenKeys.size !== requiredKeys.size) throw new Error("Missing required accessibility evidence");
  const passed = parsed.every((evidence) => evidence.passed);
  return Object.freeze({ asOf, evidence: Object.freeze(parsed), passed });
}

export { reference, route, timestamp, uuid };
