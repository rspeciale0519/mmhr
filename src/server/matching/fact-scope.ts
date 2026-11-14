import { z } from "zod";
import { estimateEmployeeCountKey, isEstimateEmployeeCount } from "@/lib/intake-estimate";

const scalar = z.union([z.string().min(1).max(2_000), z.number().finite(), z.boolean()]);
const condition = z.strictObject({
  kind: z.enum(["plan", "module", "country", "state", "worker", "delivery", "restriction"]),
  requirementKey: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/).refine(
    (key) => !/^(commission|payout|referral|payment_status|commercial|sponsorship|advertising|paid_placement|partner_status)/.test(key),
    "Commercial fields cannot define capability scope",
  ),
  responsePath: z.array(z.string().min(1).max(100)).max(5),
  allowedValues: z.array(scalar).min(1).max(50),
});

// This belongs to reviewed fact evidence, not a staff assertion made while
// preparing a customer publication. An explicit empty list means unrestricted.
export const factScopeSchema = z.strictObject({
  version: z.literal(1),
  conditions: z.array(condition).max(50),
});

export type FactScope = z.output<typeof factScopeSchema>;
export type ScopeResult = "match" | "mismatch" | "unknown";

export const factScopeMapSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,99}$/), factScopeSchema,
);

function responseAt(response: unknown, path: readonly string[]): unknown {
  let current = response;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Checks saved answers only. Missing scope never establishes unrestricted use. */
export function evaluateFactScope(
  scope: unknown,
  requirements: readonly { key: string; response: unknown }[],
): ScopeResult {
  if (scope === undefined || scope === null) return "unknown";
  const parsed = factScopeSchema.parse(scope);
  const answers = new Map<string, unknown>();
  for (const requirement of requirements) {
    if (answers.has(requirement.key)) throw new Error("Duplicate scope requirement");
    answers.set(requirement.key, requirement.response);
  }
  let unknown = false;
  for (const rule of parsed.conditions) {
    const answer = scalar.safeParse(responseAt(answers.get(rule.requirementKey), rule.responsePath));
    if (!answer.success || (typeof answer.data === "string" && answer.data.trim() === "")) {
      unknown = true;
      continue;
    }
    // Typed equality avoids treating false as the string "false", or zero as
    // an absent answer. The SQL implementation must use the same JSON equality.
    if (!rule.allowedValues.some((allowed) => allowed === answer.data)) return "mismatch";
  }
  return unknown ? "unknown" : "match";
}

/** Uses the saved customer count and reviewed package scope without affecting fit scoring. */
export function evaluateEstimateScope(input: {
  estimateEmployeeCount: number;
  companyContext: unknown;
  scope: unknown;
  requirements: readonly { key: string; response: unknown }[];
}): ScopeResult {
  if (!isEstimateEmployeeCount(input.estimateEmployeeCount)) throw new Error("Invalid estimate employee count");
  const context = input.companyContext;
  const count = context !== null && typeof context === "object" && !Array.isArray(context) &&
    Object.prototype.hasOwnProperty.call(context, estimateEmployeeCountKey)
    ? (context as Record<string, unknown>)[estimateEmployeeCountKey] : undefined;
  const scope = evaluateFactScope(input.scope, input.requirements);
  if ((isEstimateEmployeeCount(count) && count !== input.estimateEmployeeCount) || scope === "mismatch") return "mismatch";
  return isEstimateEmployeeCount(count) && scope === "match" ? "match" : "unknown";
}
