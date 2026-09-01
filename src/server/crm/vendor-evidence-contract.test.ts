import { describe, expect, test } from "vitest";

import {
  parseVendorSource,
  resolvePublishedVendorFact,
} from "./vendor-evidence-contract";

const organizationId = "11111111-1111-4111-8111-111111111111";
const vendorProfileId = "22222222-2222-4222-8222-222222222222";
const factId = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555";
const reviewerId = "66666666-6666-4666-8666-666666666666";

const fact = {
  factId,
  organizationId,
  vendorProfileId,
  productId: null,
  fieldKey: "pricing_model",
  value: "Per employee per month",
  observedAt: "2026-08-31T12:00:00.000Z",
  status: "published",
};

const source = {
  sourceId,
  organizationId,
  vendorProfileId,
  uri: "https://vendor.example/pricing",
  sourceType: "vendor_owned",
  licenseNote: null,
  capturedAt: "2026-08-31T12:00:00.000Z",
  active: true,
};

const evidence = {
  evidenceId,
  organizationId,
  factId,
  sourceId,
  version: 1,
  contentHash: "a".repeat(64),
  capturedAt: "2026-08-31T12:00:00.000Z",
  freshUntil: "2026-09-30T12:00:00.000Z",
  citation: "https://vendor.example/pricing#plans",
};

const approval = {
  approvalId: "77777777-7777-4777-8777-777777777777",
  organizationId,
  evidenceId,
  reviewerIdentityId: reviewerId,
  decision: "approved",
  decidedAt: "2026-08-31T13:00:00.000Z",
  reason: null,
};

describe("vendor evidence contract", () => {
  test("requires HTTPS and rejects unapproved source fields", () => {
    expect(parseVendorSource(source)).toMatchObject({ sourceType: "vendor_owned" });
    expect(() => parseVendorSource({ ...source, uri: "http://vendor.example/pricing" })).toThrow(
      "Invalid vendor source",
    );
    expect(() => parseVendorSource({ ...source, secret: "no" })).toThrow("Invalid vendor source");
  });

  test("resolves a published fact only from fresh approved evidence", () => {
    const resolved = resolvePublishedVendorFact({
      fact,
      source,
      evidence,
      approval,
      asOf: "2026-09-01T00:00:00.000Z",
    });
    expect(resolved).toMatchObject({
      value: fact.value,
      provenance: "evidence",
      evidenceId,
      sourceId,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  test("rejects stale, rejected, and draft facts", () => {
    expect(() => resolvePublishedVendorFact({
      fact,
      source,
      evidence: { ...evidence, freshUntil: "2026-08-30T12:00:00.000Z" },
      approval,
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Invalid vendor evidence");
    expect(() => resolvePublishedVendorFact({
      fact,
      source,
      evidence: { ...evidence, freshUntil: "2026-08-31T23:59:00.000Z" },
      approval,
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Vendor evidence is stale");
    expect(() => resolvePublishedVendorFact({
      fact,
      source,
      evidence,
      approval: { ...approval, decision: "rejected" },
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Vendor evidence scope or approval mismatch");
    expect(() => resolvePublishedVendorFact({
      fact: { ...fact, status: "draft" },
      source,
      evidence,
      approval,
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Vendor fact lacks approved evidence");
  });

  test("allows only a scoped, unexpired approved override", () => {
    const resolved = resolvePublishedVendorFact({
      fact,
      override: {
        overrideId: "88888888-8888-4888-8888-888888888888",
        organizationId,
        factId,
        value: "Custom approved range",
        approvedByIdentityId: reviewerId,
        approvedAt: "2026-08-31T12:00:00.000Z",
        expiresAt: "2026-09-15T12:00:00.000Z",
        reason: "Contract exception",
      },
      asOf: "2026-09-01T00:00:00.000Z",
    });
    expect(resolved).toMatchObject({ value: "Custom approved range", provenance: "override" });
    expect(() => resolvePublishedVendorFact({
      fact,
      override: {
        overrideId: "88888888-8888-4888-8888-888888888888",
        organizationId,
        factId,
        value: "Custom approved range",
        approvedByIdentityId: reviewerId,
        approvedAt: "2026-08-31T12:00:00.000Z",
        expiresAt: "2026-08-31T23:59:00.000Z",
        reason: "Contract exception",
      },
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Vendor override is expired");
  });

  test("rejects cross-organization evidence", () => {
    expect(() => resolvePublishedVendorFact({
      fact,
      source: { ...source, organizationId: "99999999-9999-4999-8999-999999999999" },
      evidence,
      approval,
      asOf: "2026-09-01T00:00:00.000Z",
    })).toThrow("Vendor evidence scope or approval mismatch");
  });
});
