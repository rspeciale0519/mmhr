import { describe, expect, test } from "vitest";

import {
  buildCrmExport,
  parseCrmExportRequest,
} from "./export-contract";

const organizationId = "11111111-1111-4111-8111-111111111111";
const requesterId = "22222222-2222-4222-8222-222222222222";
const reviewerId = "33333333-3333-4333-8333-333333333333";
const exportId = "44444444-4444-4444-8444-444444444444";
const decisionId = "55555555-5555-4555-8555-555555555555";
const recordId = "66666666-6666-4666-8666-666666666666";

const request = {
  exportId,
  organizationId,
  requestedByIdentityId: requesterId,
  resource: "contact",
  fields: ["recordId", "status", "title"],
  purpose: "Quarterly operations review",
  requestedAt: "2026-08-31T12:00:00.000Z",
};

const decision = {
  decisionId,
  exportId,
  organizationId,
  reviewerIdentityId: reviewerId,
  decision: "approved",
  decidedAt: "2026-08-31T13:00:00.000Z",
  reason: null,
};

describe("CRM export contract", () => {
  test("allows only resource-specific fields", () => {
    expect(parseCrmExportRequest(request)).toMatchObject({ resource: "contact" });
    expect(() => parseCrmExportRequest({ ...request, fields: ["email"] })).toThrow(
      "Invalid CRM export request",
    );
    expect(() => parseCrmExportRequest({ ...request, fields: ["status", "status"] })).toThrow(
      "Invalid CRM export request",
    );
  });

  test("requires an approved, same-organization decision", () => {
    expect(() => buildCrmExport({ request, decision: { ...decision, decision: "denied" }, rows: [] }))
      .toThrow("CRM export was denied");
    expect(() => buildCrmExport({
      request,
      decision: { ...decision, organizationId: "77777777-7777-4777-8777-777777777777" },
      rows: [],
    })).toThrow("CRM export approval scope mismatch");
  });

  test("redacts unrequested row fields and emits an audit record", () => {
    const result = buildCrmExport({
      request,
      decision,
      rows: [{
        recordId,
        organizationId,
        status: "active",
        title: "Buyer",
        normalizedEmail: "private@example.com",
      }],
    });
    expect(result.rows).toEqual([{ recordId, status: "active", title: "Buyer" }]);
    expect(result.audit).toMatchObject({ exportId, reviewerIdentityId: reviewerId });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
  });

  test("rejects rows from another organization", () => {
    expect(() => buildCrmExport({
      request,
      decision,
      rows: [{ recordId, organizationId: "88888888-8888-4888-8888-888888888888" }],
    })).toThrow("CRM export row organization mismatch");
  });
});
