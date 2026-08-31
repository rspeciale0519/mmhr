import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/, "Reference contains unsupported characters");

export const recoveryEvidenceKinds = ["restore_drill", "rollback_rehearsal"] as const;
export const recoveryEvidenceOutcomes = ["passed", "failed"] as const;
export const recoveryPointTargetSeconds = 24 * 60 * 60;
export const recoveryTimeTargetSeconds = 8 * 60 * 60;
export const recoveryEvidenceFreshnessDays = 92;

export const recoveryEvidenceSchema = z
  .strictObject({
    evidenceId: uuid,
    kind: z.enum(recoveryEvidenceKinds),
    environment: z.enum(["staging", "production"]),
    startedAt: timestamp,
    completedAt: timestamp,
    rpoSeconds: z.number().int().nonnegative().max(recoveryPointTargetSeconds),
    rtoSeconds: z.number().int().nonnegative().max(recoveryTimeTargetSeconds),
    outcome: z.enum(recoveryEvidenceOutcomes),
    artifactReference: reference,
    auditReference: reference,
    approvedAt: timestamp.nullable(),
  })
  .superRefine((record, context) => {
    const startedMs = Date.parse(record.startedAt);
    const completedMs = Date.parse(record.completedAt);
    if (completedMs < startedMs) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Recovery evidence must complete after it starts" });
    }
    if (record.outcome === "passed" && record.approvedAt === null) {
      context.addIssue({ code: "custom", path: ["approvedAt"], message: "Passed recovery evidence requires approval" });
    }
    if (record.approvedAt !== null && Date.parse(record.approvedAt) < completedMs) {
      context.addIssue({ code: "custom", path: ["approvedAt"], message: "Approval cannot precede completion" });
    }
  });

export type RecoveryEvidence = z.output<typeof recoveryEvidenceSchema>;
export type RecoveryEvidenceKind = (typeof recoveryEvidenceKinds)[number];
export type RecoveryEvidenceDecision = Readonly<{
  eligible: boolean;
  reason: "approved" | "failed" | "not_approved" | "rpo_exceeded" | "rto_exceeded" | "stale";
}>;

function parseAsOf(value: string | Date): number {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (!timestamp.safeParse(normalized).success) throw new Error("Invalid recovery evaluation timestamp");
  return Date.parse(normalized);
}

/** Parses one recovery record without accepting personal data or free text. */
export function parseRecoveryEvidence(value: unknown): RecoveryEvidence {
  const parsed = recoveryEvidenceSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid recovery evidence");
  return parsed.data;
}

/** Evaluates one record without checking external artifact or approval systems. */
export function evaluateRecoveryEvidence(value: unknown, asOfInput: string | Date): RecoveryEvidenceDecision {
  const record = parseRecoveryEvidence(value);
  const asOfMs = parseAsOf(asOfInput);
  if (asOfMs - Date.parse(record.completedAt) > recoveryEvidenceFreshnessDays * 24 * 60 * 60 * 1000) {
    return { eligible: false, reason: "stale" };
  }
  if (record.outcome !== "passed") return { eligible: false, reason: "failed" };
  if (record.approvedAt === null) return { eligible: false, reason: "not_approved" };
  if (record.kind === "restore_drill" && record.rpoSeconds > recoveryPointTargetSeconds) {
    return { eligible: false, reason: "rpo_exceeded" };
  }
  if (record.kind === "restore_drill" && record.rtoSeconds > recoveryTimeTargetSeconds) {
    return { eligible: false, reason: "rto_exceeded" };
  }
  return { eligible: true, reason: "approved" };
}

export type RecoveryEvidenceSetReadiness = Readonly<{
  restoreDrill: RecoveryEvidence | null;
  rollbackRehearsal: RecoveryEvidence | null;
  ready: boolean;
  failedKinds: RecoveryEvidenceKind[];
}>;

/** Requires one current, approved record for both restore and rollback evidence. */
export function evaluateRecoveryEvidenceSet(
  values: readonly unknown[],
  asOfInput: string | Date,
): RecoveryEvidenceSetReadiness {
  const asOfMs = parseAsOf(asOfInput);
  const records = values.map(parseRecoveryEvidence);
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.evidenceId)) throw new Error(`Duplicate recovery evidence: ${record.evidenceId}`);
    seen.add(record.evidenceId);
    if (Date.parse(record.completedAt) > asOfMs) throw new Error(`Recovery evidence is in the future: ${record.evidenceId}`);
  }

  const latest = (kind: RecoveryEvidenceKind) =>
    [...records]
      .filter((record) => record.kind === kind)
      .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))[0] ?? null;
  const restoreDrill = latest("restore_drill");
  const rollbackRehearsal = latest("rollback_rehearsal");
  const asOfIso = new Date(asOfMs).toISOString();
  const failedKinds: RecoveryEvidenceKind[] = [];
  if (!restoreDrill || !evaluateRecoveryEvidence(restoreDrill, asOfIso).eligible) failedKinds.push("restore_drill");
  if (!rollbackRehearsal || !evaluateRecoveryEvidence(rollbackRehearsal, asOfIso).eligible) failedKinds.push("rollback_rehearsal");
  return { restoreDrill, rollbackRehearsal, ready: failedKinds.length === 0, failedKinds };
}

export { reference, timestamp, uuid };
