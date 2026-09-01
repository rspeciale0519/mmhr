import { describe, expect, test } from "vitest";

import {
  approveRfpVersion,
  distributeRfp,
  parseRfpVersion,
} from "./rfp-contract";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  rfp: "22222222-2222-4222-8222-222222222222",
  creator: "33333333-3333-4333-8333-333333333333",
  approver: "44444444-4444-4444-8444-444444444444",
  recipient: "55555555-5555-4555-8555-555555555555",
  vendor: "66666666-6666-4666-8666-666666666666",
};

const draft = {
  rfpId: ids.rfp,
  organizationId: ids.organization,
  version: 1,
  status: "draft",
  title: "HR platform selection",
  sections: [{ sectionKey: "security", title: "Security", questionCount: 3 }],
  createdByIdentityId: ids.creator,
  createdAt: "2026-08-31T12:00:00.000Z",
  approvedByIdentityId: null,
  approvedAt: null,
  approvalReference: null,
};

const approval = {
  rfpId: ids.rfp,
  organizationId: ids.organization,
  version: 1,
  approvedByIdentityId: ids.approver,
  approvedAt: "2026-08-31T13:00:00.000Z",
  approvalReference: "approval:rfp-1",
};

function recipient(overrides: Record<string, unknown> = {}) {
  return {
    recipientId: ids.recipient,
    rfpId: ids.rfp,
    organizationId: ids.organization,
    vendorProfileId: ids.vendor,
    state: "pending",
    sentAt: null,
    respondedAt: null,
    ...overrides,
  };
}

describe("RFP contract", () => {
  test("rejects unapproved RFPs that contain approval evidence", () => {
    expect(parseRfpVersion(draft)).toMatchObject({ status: "draft" });
    expect(() => parseRfpVersion({ ...draft, approvalReference: "approval:bad" })).toThrow("Invalid RFP version");
  });

  test("approves a matching immutable version", () => {
    const approved = approveRfpVersion(draft, approval);
    expect(approved).toMatchObject({ status: "approved", approvalReference: "approval:rfp-1" });
    expect(Object.isFrozen(approved)).toBe(true);
    expect(() => approveRfpVersion(draft, { ...approval, organizationId: "77777777-7777-4777-8777-777777777777" }))
      .toThrow("does not match");
  });

  test("distributes only approved versions to unique pending recipients", () => {
    const result = distributeRfp({
      version: approveRfpVersion(draft, approval),
      recipients: [recipient()],
      distributedAt: "2026-08-31T14:00:00.000Z",
    });
    expect(result.version.status).toBe("distributed");
    expect(result.recipients[0]).toMatchObject({ state: "distributed", sentAt: "2026-08-31T14:00:00.000Z" });
    expect(Object.isFrozen(result.recipients[0])).toBe(true);
  });

  test("rejects recipient scope, duplicates, and non-pending states", () => {
    const version = approveRfpVersion(draft, approval);
    expect(() => distributeRfp({
      version,
      recipients: [recipient({ organizationId: "88888888-8888-4888-8888-888888888888" })],
      distributedAt: "2026-08-31T14:00:00.000Z",
    })).toThrow("scope mismatch");
    expect(() => distributeRfp({
      version,
      recipients: [recipient(), recipient({ recipientId: "99999999-9999-4999-8999-999999999999" })],
      distributedAt: "2026-08-31T14:00:00.000Z",
    })).toThrow("recipients must be unique");
    expect(() => distributeRfp({
      version,
      recipients: [recipient({ state: "responded" })],
      distributedAt: "2026-08-31T14:00:00.000Z",
    })).toThrow("not pending");
  });
});
