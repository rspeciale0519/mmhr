import { describe, expect, test } from "vitest";

import {
  canTransitionProposal,
  createApprovedProposalComparison,
  createApprovedVendorSelection,
  createProposalVersion,
  recordDirectNegotiationStatus,
  transitionProposalVersion,
} from "./proposal-contract";

const ids = {
  proposalA: "11111111-1111-4111-8111-111111111111",
  proposalB: "22222222-2222-4222-8222-222222222222",
  deal: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  vendorA: "55555555-5555-4555-8555-555555555555",
  vendorB: "66666666-6666-4666-8666-666666666666",
  approver: "77777777-7777-4777-8777-777777777777",
  actor: "88888888-8888-4888-8888-888888888888",
  comparison: "99999999-9999-4999-8999-999999999999",
  selection: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  correlation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const proposalInput = (proposalVersionId: string, vendorOrganizationId: string, versionNumber: number) => ({
  proposalVersionId,
  dealId: ids.deal,
  customerOrganizationId: ids.customer,
  vendorOrganizationId,
  versionNumber,
  receivedAt: "2026-08-31T12:00:00.000Z",
  sourceReferences: [`storage://proposal/${proposalVersionId}`],
  pricing: {
    currency: "usd",
    implementationCostMinorUnits: 100_000,
    recurringCostMinorUnits: 20_000,
    optionalCostMinorUnits: 5_000,
    discountMinorUnits: 1_000,
    termMonths: 36,
    termsAndAssumptions: ["Annual prepayment assumed"],
    customerRequestedChanges: [],
  },
});

function approvedProposal(proposalVersionId: string, vendorOrganizationId: string, versionNumber: number) {
  const received = createProposalVersion(proposalInput(proposalVersionId, vendorOrganizationId, versionNumber));
  return transitionProposalVersion(received, {
    proposalVersionId,
    fromStatus: "received",
    toStatus: "under_review",
    actorIdentityId: ids.actor,
    reason: "MMHR started review",
    occurredAt: "2026-08-31T13:00:00.000Z",
    correlationId: ids.correlation,
  });
}

function comparison() {
  const a = transitionProposalVersion(approvedProposal(ids.proposalA, ids.vendorA, 1), {
    proposalVersionId: ids.proposalA,
    fromStatus: "under_review",
    toStatus: "approved_for_comparison",
    actorIdentityId: ids.actor,
    reason: "Source and pricing reviewed",
    occurredAt: "2026-08-31T14:00:00.000Z",
    correlationId: ids.correlation,
  });
  const b = transitionProposalVersion(approvedProposal(ids.proposalB, ids.vendorB, 1), {
    proposalVersionId: ids.proposalB,
    fromStatus: "under_review",
    toStatus: "approved_for_comparison",
    actorIdentityId: ids.actor,
    reason: "Source and pricing reviewed",
    occurredAt: "2026-08-31T14:00:00.000Z",
    correlationId: ids.correlation,
  });
  return createApprovedProposalComparison({
    comparisonId: ids.comparison,
    dealId: ids.deal,
    customerOrganizationId: ids.customer,
    proposalVersions: [a, b],
    approvedByIdentityIds: [ids.approver],
    approvedAt: "2026-08-31T15:00:00.000Z",
    correlationId: ids.correlation,
  });
}

describe("R6 proposal and selection safety contract", () => {
  test("creates version one and preserves every transition", () => {
    const received = createProposalVersion(proposalInput(ids.proposalA, ids.vendorA, 1));
    const reviewed = transitionProposalVersion(received, {
      proposalVersionId: ids.proposalA,
      fromStatus: "received",
      toStatus: "under_review",
      actorIdentityId: ids.actor,
      reason: "Review started",
      occurredAt: "2026-08-31T13:00:00.000Z",
      correlationId: ids.correlation,
    });
    expect(received.status).toBe("received");
    expect(reviewed.status).toBe("under_review");
    expect(reviewed.transitions).toHaveLength(1);
  });

  test("rejects missing source links, negative money, and extra fields", () => {
    expect(() => createProposalVersion({ ...proposalInput(ids.proposalA, ids.vendorA, 1), sourceReferences: [] })).toThrow();
    expect(() => createProposalVersion({ ...proposalInput(ids.proposalA, ids.vendorA, 1), extra: true })).toThrow();
    expect(() => createProposalVersion({
      ...proposalInput(ids.proposalA, ids.vendorA, 1),
      pricing: { ...proposalInput(ids.proposalA, ids.vendorA, 1).pricing, recurringCostMinorUnits: -1 },
    })).toThrow();
  });

  test("rejects stale, skipped, and terminal transitions", () => {
    const received = createProposalVersion(proposalInput(ids.proposalA, ids.vendorA, 1));
    expect(() => transitionProposalVersion(received, {
      proposalVersionId: ids.proposalA,
      fromStatus: "under_review",
      toStatus: "approved_for_comparison",
      actorIdentityId: ids.actor,
      reason: "skip",
      occurredAt: "2026-08-31T13:00:00.000Z",
      correlationId: ids.correlation,
    })).toThrow("stale");
    const withdrawn = transitionProposalVersion(received, {
      proposalVersionId: ids.proposalA,
      fromStatus: "received",
      toStatus: "withdrawn",
      actorIdentityId: ids.actor,
      reason: "Vendor withdrew quote",
      occurredAt: "2026-08-31T13:00:00.000Z",
      correlationId: ids.correlation,
    });
    expect(() => transitionProposalVersion(withdrawn, {
      proposalVersionId: ids.proposalA,
      fromStatus: "withdrawn",
      toStatus: "under_review",
      actorIdentityId: ids.actor,
      reason: "reopen",
      occurredAt: "2026-08-31T14:00:00.000Z",
      correlationId: ids.correlation,
    })).toThrow("not allowed");
  });

  test("requires all versions to be approved, scoped, and from distinct vendors", () => {
    const received = createProposalVersion(proposalInput(ids.proposalA, ids.vendorA, 1));
    expect(() => createApprovedProposalComparison({
      comparisonId: ids.comparison, dealId: ids.deal, customerOrganizationId: ids.customer,
      proposalVersions: [received, received], approvedByIdentityIds: [ids.approver],
      approvedAt: "2026-08-31T15:00:00.000Z", correlationId: ids.correlation,
    })).toThrow("approved");
    const approved = comparison();
    expect(() => createApprovedProposalComparison({
      ...approved,
      proposalVersions: [approved.proposalVersions[0], { ...approved.proposalVersions[0], proposalVersionId: ids.proposalB }],
    })).toThrow("vendor");
  });

  test("accepts only same-currency approved versions and protects snapshots", () => {
    const a = transitionProposalVersion(approvedProposal(ids.proposalA, ids.vendorA, 1), {
      proposalVersionId: ids.proposalA,
      fromStatus: "under_review",
      toStatus: "approved_for_comparison",
      actorIdentityId: ids.actor,
      reason: "Source and pricing reviewed",
      occurredAt: "2026-08-31T14:00:00.000Z",
      correlationId: ids.correlation,
    });
    const b = transitionProposalVersion(approvedProposal(ids.proposalB, ids.vendorB, 1), {
      proposalVersionId: ids.proposalB,
      fromStatus: "under_review",
      toStatus: "approved_for_comparison",
      actorIdentityId: ids.actor,
      reason: "Source and pricing reviewed",
      occurredAt: "2026-08-31T14:00:00.000Z",
      correlationId: ids.correlation,
    });
    const approved = createApprovedProposalComparison({
      comparisonId: ids.comparison,
      dealId: ids.deal,
      customerOrganizationId: ids.customer,
      proposalVersions: [a, b],
      approvedByIdentityIds: [ids.approver],
      approvedAt: "2026-08-31T15:00:00.000Z",
      correlationId: ids.correlation,
    });
    expect(approved.proposalVersions).toHaveLength(2);
    expect(approved.proposalVersions[0]?.pricing.currency).toBe("USD");
    expect(() => (a.sourceReferences as string[]).push("changed")).toThrow();
    expect(() => (approved.proposalVersions[0]!.sourceReferences as string[]).push("changed")).toThrow();
    expect(approved.proposalVersions[0]!.sourceReferences).toHaveLength(1);
  });

  test("requires selection to use an approved comparison vendor", () => {
    const approved = comparison();
    const selection = createApprovedVendorSelection({
      selectionId: ids.selection,
      comparisonId: ids.comparison,
      dealId: ids.deal,
      customerOrganizationId: ids.customer,
      selectedVendorOrganizationId: ids.vendorA,
      decisionReasons: ["Best fit"],
      remainingRisks: ["Implementation plan needs confirmation"],
      approvedByIdentityIds: [ids.approver],
      approvedAt: "2026-08-31T16:00:00.000Z",
      correlationId: ids.correlation,
    }, approved);
    expect(selection.selectedVendorOrganizationId).toBe(ids.vendorA);
    expect(() => createApprovedVendorSelection({
      selectionId: ids.selection, comparisonId: ids.comparison, dealId: ids.deal,
      customerOrganizationId: ids.customer, selectedVendorOrganizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      decisionReasons: ["Best fit"], remainingRisks: [], approvedByIdentityIds: [ids.approver],
      approvedAt: "2026-08-31T16:00:00.000Z", correlationId: ids.correlation,
    }, approved)).toThrow("not in");
  });

  test("records shared status but rejects legal negotiation data", () => {
    const status = recordDirectNegotiationStatus({
      handoffId: ids.selection,
      customerOrganizationId: ids.customer,
      vendorOrganizationId: ids.vendorA,
      status: "negotiating",
      sharedStatus: "Customer and vendor are negotiating directly",
      recordedByIdentityId: ids.actor,
      occurredAt: "2026-08-31T17:00:00.000Z",
      correlationId: ids.correlation,
    });
    expect(status.status).toBe("negotiating");
    expect(() => recordDirectNegotiationStatus({
      ...status,
      legalTerms: "net 30",
    })).toThrow();
    expect(() => recordDirectNegotiationStatus({
      ...status,
      customerOrganizationId: ids.vendorA,
      vendorOrganizationId: ids.vendorA,
    })).toThrow("different");
  });

  test("exposes the allowed state graph", () => {
    expect(canTransitionProposal("under_review", "approved_for_comparison")).toBe(true);
    expect(canTransitionProposal("approved_for_comparison", "received")).toBe(false);
    expect(canTransitionProposal("superseded", "under_review")).toBe(false);
  });
});
