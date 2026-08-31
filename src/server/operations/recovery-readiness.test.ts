import { describe, expect, test } from "vitest";

import {
  evaluateRecoveryEvidence,
  evaluateRecoveryEvidenceSet,
  recoveryEvidenceSchema,
  recoveryPointTargetSeconds,
  recoveryTimeTargetSeconds,
} from "@/server/operations/recovery-readiness";

const restore = {
  evidenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "restore_drill" as const,
  environment: "staging" as const,
  startedAt: "2026-08-31T08:00:00.000Z",
  completedAt: "2026-08-31T12:00:00.000Z",
  rpoSeconds: recoveryPointTargetSeconds,
  rtoSeconds: recoveryTimeTargetSeconds,
  outcome: "passed" as const,
  artifactReference: "ci://restore-2026-08-31",
  auditReference: "audit://restore-2026-08-31",
  approvedAt: "2026-08-31T13:00:00.000Z",
};

const rollback = {
  ...restore,
  evidenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  kind: "rollback_rehearsal" as const,
  artifactReference: "ci://rollback-2026-08-31",
  auditReference: "audit://rollback-2026-08-31",
};

describe("recovery evidence", () => {
  test("accepts approved restore and rollback records", () => {
    expect(evaluateRecoveryEvidenceSet([restore, rollback], "2026-08-31T18:00:00.000Z")).toMatchObject({
      ready: true,
      failedKinds: [],
      restoreDrill: restore,
      rollbackRehearsal: rollback,
    });
  });

  test("returns missing kinds when a record is absent", () => {
    expect(evaluateRecoveryEvidenceSet([restore], "2026-08-31T18:00:00.000Z")).toMatchObject({
      ready: false,
      failedKinds: ["rollback_rehearsal"],
    });
  });

  test.each([
    ["failed", { ...restore, outcome: "failed", approvedAt: null }, "failed"],
    ["stale", { ...restore, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:30:00.000Z", approvedAt: "2026-01-01T01:00:00.000Z" }, "stale"],
  ] as const)("rejects %s records", (_label, value, reason) => {
    expect(evaluateRecoveryEvidence(value, "2026-08-31T18:00:00.000Z")).toEqual({ eligible: false, reason });
  });

  test("rejects invalid timelines and early approval", () => {
    expect(recoveryEvidenceSchema.safeParse({ ...restore, completedAt: "2026-08-31T07:59:59.000Z" }).success).toBe(false);
    expect(recoveryEvidenceSchema.safeParse({ ...restore, approvedAt: "2026-08-31T11:00:00.000Z" }).success).toBe(false);
  });

  test("rejects missing approval for passed evidence", () => {
    expect(recoveryEvidenceSchema.safeParse({ ...restore, approvedAt: null }).success).toBe(false);
  });

  test("rejects restore records above the RPO and RTO targets", () => {
    expect(recoveryEvidenceSchema.safeParse({ ...restore, rpoSeconds: recoveryPointTargetSeconds + 1 }).success).toBe(false);
    expect(recoveryEvidenceSchema.safeParse({ ...restore, rtoSeconds: recoveryTimeTargetSeconds + 1 }).success).toBe(false);
  });

  test("rejects unknown personal or free-text fields", () => {
    expect(recoveryEvidenceSchema.safeParse({ ...restore, operatorName: "Rob" }).success).toBe(false);
    expect(recoveryEvidenceSchema.safeParse({ ...restore, artifactReference: "restore completed successfully" }).success).toBe(false);
  });

  test("rejects duplicate and future records", () => {
    expect(() => evaluateRecoveryEvidenceSet([restore, restore], "2026-08-31T18:00:00.000Z")).toThrow(/Duplicate/);
    expect(() => evaluateRecoveryEvidenceSet([{ ...restore, completedAt: "2026-09-01T00:00:00.000Z", approvedAt: "2026-09-01T01:00:00.000Z" }], "2026-08-31T18:00:00.000Z")).toThrow(/future/);
  });

  test("keeps the latest failed evidence as not ready", () => {
    expect(evaluateRecoveryEvidenceSet([
      restore,
      { ...restore, evidenceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", completedAt: "2026-08-31T14:00:00.000Z", outcome: "failed", approvedAt: null },
      rollback,
    ], "2026-08-31T18:00:00.000Z")).toMatchObject({
      ready: false,
      failedKinds: ["restore_drill"],
    });
  });
});
