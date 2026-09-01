import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const origin = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && (parsed.pathname === "" || parsed.pathname === "/") && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}, "Origin must be an HTTPS origin without a path");

export const deploymentEnvironments = ["staging", "production"] as const;
export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];

export const deploymentSmokeEvidenceSchema = z.strictObject({
  evidenceId: uuid,
  deploymentId: uuid,
  environment: z.enum(deploymentEnvironments),
  canonicalOrigin: origin,
  commitSha: z.string().regex(/^[0-9a-f]{40}$/i),
  checkedAt: timestamp,
  health: z.enum(["ok", "degraded", "failed"]),
  protectedRoutesClosed: z.boolean(),
  migrationBackwardCompatible: z.boolean(),
  passed: z.boolean(),
  reference: z.string().trim().min(1).max(500),
}).superRefine((evidence, context) => {
  if (evidence.passed && (evidence.health !== "ok" || !evidence.protectedRoutesClosed || !evidence.migrationBackwardCompatible)) {
    context.addIssue({ code: "custom", path: ["passed"], message: "Passed deployment evidence requires healthy, closed protected routes and rollback-compatible migrations" });
  }
});

export type DeploymentSmokeEvidence = z.output<typeof deploymentSmokeEvidenceSchema>;

/** Validates a deployment smoke result against one exact canonical origin. */
export function parseDeploymentSmokeEvidence(value: unknown, expectedOrigin: string, asOfInput?: string | Date): Readonly<DeploymentSmokeEvidence> {
  const result = deploymentSmokeEvidenceSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid deployment smoke evidence");
  const expected = origin.safeParse(expectedOrigin);
  if (!expected.success || result.data.canonicalOrigin !== expected.data) throw new Error("Deployment origin does not match canonical origin");
  if (asOfInput !== undefined) {
    const asOf = asOfInput instanceof Date ? asOfInput.toISOString() : asOfInput;
    if (!timestamp.safeParse(asOf).success || Date.parse(result.data.checkedAt) > Date.parse(asOf)) throw new Error("Deployment smoke evidence is after as-of timestamp");
  }
  return Object.freeze({ ...result.data });
}

export { origin, timestamp, uuid };
