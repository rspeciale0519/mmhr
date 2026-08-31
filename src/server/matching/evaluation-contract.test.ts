import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  approveScoringConfiguration,
  createScoringConfiguration,
  maskCandidateIdentity,
  rankApprovedCandidates,
  unmaskCandidateIdentity,
} from "./evaluation-contract";

const ids = {
  configuration: randomUUID(),
  creator: randomUUID(),
  approver: randomUUID(),
  masker: randomUUID(),
  requester: randomUUID(),
};

const draftInput = {
  configurationId: ids.configuration,
  version: 1,
  status: "draft" as const,
  criteria: [
    { key: "payroll", importance: "must" as const, weight: 3 },
    { key: "benefits", importance: "nice" as const, weight: 1 },
  ],
  createdByIdentityId: ids.creator,
  createdAt: "2026-08-31T12:00:00.000Z",
  approvedByIdentityId: null,
  approvedAt: null,
  approvalReference: null,
  sourceReferences: ["requirements:r3-fixture"],
};

const approvalInput = {
  configurationId: ids.configuration,
  version: 1,
  approvedByIdentityId: ids.approver,
  approvedAt: "2026-08-31T12:01:00.000Z",
  approvalReference: "approval:r3-fixture-1",
};

describe("R3 evaluation contract", () => {
  test("requires explicit approval before deterministic ranking", () => {
    const draft = createScoringConfiguration(draftInput);
    expect(() => rankApprovedCandidates(draft, [])).toThrow("Only approved scoring");

    const approved = approveScoringConfiguration(draft, approvalInput);
    const candidates = [
      {
        candidateId: "vendor-b",
        capabilities: { payroll: true },
        confidence: 0.9,
        evidenceFreshAt: "2026-08-30T12:00:00.000Z",
      },
      {
        candidateId: "vendor-a",
        capabilities: { payroll: true },
        confidence: 0.8,
        evidenceFreshAt: null,
      },
    ];
    const ranked = rankApprovedCandidates(approved, candidates);
    expect(ranked.configurationVersion).toBe(1);
    expect(ranked.algorithm).toBe("deterministic-v1");
    expect(ranked.commercialDataUsed).toBe(false);
    expect(ranked.candidates.map((candidate) => candidate.candidateId)).toEqual(["vendor-a", "vendor-b"]);
    expect(ranked.candidates[0]).toMatchObject({ score: 7500, confidence: 0.8, evidenceFreshAt: null });
  });

  test("keeps ranking independent of commercial data and rejects it at the boundary", () => {
    const approved = approveScoringConfiguration(createScoringConfiguration(draftInput), approvalInput);
    const base = {
      candidateId: "vendor-a",
      capabilities: { payroll: true, benefits: true },
      confidence: 1,
      evidenceFreshAt: null,
    };
    const withoutCommercial = rankApprovedCandidates(approved, [base]);
    expect(() => rankApprovedCandidates(approved, [{ ...base, commissionRate: 0.5 }])).toThrow("Invalid evaluation candidate");
    expect(rankApprovedCandidates(approved, [base])).toEqual(withoutCommercial);
  });

  test("rejects missing, malformed, and stale approval evidence", () => {
    const draft = createScoringConfiguration(draftInput);
    expect(() => approveScoringConfiguration(draft, { ...approvalInput, approvalReference: "r3-no-prefix" }))
      .toThrow("Invalid scoring approval");
    expect(() => approveScoringConfiguration(draft, { ...approvalInput, version: 2 }))
      .toThrow("does not match the draft");
    expect(() => approveScoringConfiguration({ ...draftInput, status: "approved" }, approvalInput))
      .toThrow("Invalid scoring configuration");
  });

  test("masks identity and records an internal, reasoned unmasking approval", () => {
    const identity = { candidateId: "vendor-a", vendorName: "Hidden Vendor", productName: "Hidden Product" };
    const masked = maskCandidateIdentity(identity, {
      candidateId: "vendor-a",
      maskedByIdentityId: ids.masker,
      maskedAt: "2026-08-31T12:02:00.000Z",
      reason: "Initial customer comparison",
      auditReference: "audit:r3-mask-1",
      displayNumber: 1,
    });
    expect(masked).not.toHaveProperty("vendorName");
    expect(masked).not.toHaveProperty("productName");
    expect(masked.displayLabel).toBe("Candidate 1");
    expect(masked.maskingEvent).toMatchObject({ action: "masked", actorIdentityId: ids.masker });

    expect(() => unmaskCandidateIdentity(masked, identity, {
      candidateId: "vendor-a",
      requestedByIdentityId: ids.requester,
      approvedByIdentityId: ids.approver,
      approvedAt: "2026-08-31T12:03:00.000Z",
      approvalReference: "approval:r3-unmask-1",
      reason: "Internal review requires vendor identity",
      auditReference: "audit:r3-unmask-1",
      approvalScope: "customer",
    })).toThrow("Invalid candidate unmasking approval");

    const unmasked = unmaskCandidateIdentity(masked, identity, {
      candidateId: "vendor-a",
      requestedByIdentityId: ids.requester,
      approvedByIdentityId: ids.approver,
      approvedAt: "2026-08-31T12:03:00.000Z",
      approvalReference: "approval:r3-unmask-1",
      reason: "Internal review requires vendor identity",
      auditReference: "audit:r3-unmask-1",
      approvalScope: "internal",
    });
    expect(unmasked).toMatchObject({ vendorName: "Hidden Vendor", productName: "Hidden Product" });
    expect(unmasked.maskingEvent).toMatchObject({
      action: "unmasked",
      approvedByIdentityId: ids.approver,
      approvalReference: "approval:r3-unmask-1",
    });
    expect(Object.isFrozen(masked)).toBe(true);
    expect(Object.isFrozen(unmasked)).toBe(true);
  });
});
