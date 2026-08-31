import { describe, expect, test } from "vitest";

import {
  canTransitionContractHandoff,
  contractHandoffSelectionSchema,
  createContractHandoff,
  transitionContractHandoff,
} from "./contract-handoff";

const selection = {
  handoffId: "11111111-1111-4111-8111-111111111111",
  customerOrganizationId: "22222222-2222-4222-8222-222222222222",
  selectedVendorOrganizationId: "33333333-3333-4333-8333-333333333333",
  selectionReasons: ["Meets payroll requirements", "Fits the implementation timeline"],
  remainingRisks: ["Final data migration plan needs confirmation"],
  approvedByIdentityIds: ["44444444-4444-4444-8444-444444444444"],
  approvedAt: "2026-08-31T12:00:00.000Z",
  correlationId: "55555555-5555-4555-8555-555555555555",
};

const transition = {
  handoffId: selection.handoffId,
  fromStatus: "introduction_pending" as const,
  toStatus: "introduced" as const,
  actorIdentityId: "66666666-6666-4666-8666-666666666666",
  reason: "MMHR introduced the customer and vendor",
  occurredAt: "2026-08-31T13:00:00.000Z",
  correlationId: "77777777-7777-4777-8777-777777777777",
};

describe("contract handoff contract", () => {
  test("creates an approved selection in the introduction-pending state", () => {
    const record = createContractHandoff({
      ...selection,
      handoffId: selection.handoffId.toUpperCase(),
    });

    expect(record).toMatchObject({
      handoffId: selection.handoffId,
      status: "introduction_pending",
      transitions: [],
      selection: { handoffId: selection.handoffId },
    });
  });

  test("requires distinct customer and vendor organizations and unique approvers", () => {
    expect(contractHandoffSelectionSchema.safeParse({
      ...selection,
      selectedVendorOrganizationId: selection.customerOrganizationId,
    }).success).toBe(false);
    expect(contractHandoffSelectionSchema.safeParse({
      ...selection,
      approvedByIdentityIds: [selection.approvedByIdentityIds[0], selection.approvedByIdentityIds[0]],
    }).success).toBe(false);
  });

  test("rejects legal negotiation fields and incomplete selection evidence", () => {
    expect(() => createContractHandoff({
      ...selection,
      legalTerms: "customer and vendor only",
    })).toThrow("Invalid contract handoff selection");
    expect(contractHandoffSelectionSchema.safeParse({
      ...selection,
      selectionReasons: [],
    }).success).toBe(false);
  });

  test("appends a transition and preserves the selection record", () => {
    const initial = createContractHandoff(selection);
    const introduced = transitionContractHandoff(initial, transition);

    expect(introduced.status).toBe("introduced");
    expect(introduced.transitions).toEqual([expect.objectContaining({ toStatus: "introduced" })]);
    expect(introduced.selection).toEqual(initial.selection);
    expect(initial.status).toBe("introduction_pending");
    expect(initial.transitions).toHaveLength(0);
  });

  test("rejects stale, skipped, mismatched, and terminal transitions", () => {
    const initial = createContractHandoff(selection);
    expect(() => transitionContractHandoff(initial, { ...transition, fromStatus: "introduced" })).toThrow("stale");
    expect(() => transitionContractHandoff(initial, { ...transition, toStatus: "signed" })).toThrow("not allowed");
    expect(() => transitionContractHandoff(initial, { ...transition, handoffId: "88888888-8888-4888-8888-888888888888" })).toThrow("does not match");

    const signed = [
      transitionContractHandoff(initial, transition),
      transitionContractHandoff(transitionContractHandoff(initial, transition), {
        ...transition,
        fromStatus: "introduced",
        toStatus: "negotiating",
        correlationId: "99999999-9999-4999-8999-999999999999",
      }),
    ].at(-1)!;
    const terminal = transitionContractHandoff(signed, {
      ...transition,
      fromStatus: "negotiating",
      toStatus: "signed",
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(() => transitionContractHandoff(terminal, {
      ...transition,
      fromStatus: "signed",
      toStatus: "stalled",
    })).toThrow("not allowed");
  });

  test("allows a stalled handoff to reopen through recorded states", () => {
    expect(canTransitionContractHandoff("introduction_pending", "stalled")).toBe(true);
    expect(canTransitionContractHandoff("stalled", "negotiating")).toBe(true);
    expect(canTransitionContractHandoff("signed", "negotiating")).toBe(false);
  });
});
