import { describe, expect, test } from "vitest";

import {
  customerProfileSchema,
  parseContact,
  parseCustomerProfile,
  parseProduct,
  parseRelationship,
  parseVendorProfile,
  productSchema,
  relationshipSchema,
  vendorProfileSchema,
} from "./entity-contract";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const audit = { revision: 1, correlationId: id(90), createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" };

function customer(overrides: Record<string, unknown> = {}) {
  return {
    profileId: id(1), organizationId: id(2), status: "prospect", businessContext: null, currentSoftware: null,
    purchaseHistory: [], contractStartAt: null, contractEndAt: null, renewalWindowStartAt: null, renewalWindowEndAt: null, ...audit, ...overrides,
  };
}

function vendor(overrides: Record<string, unknown> = {}) {
  return {
    profileId: id(3), organizationId: id(4), status: "prospect", description: null, approvedCommercialMetadata: null,
    approvedAt: null, approvedByIdentityId: null, ...audit, ...overrides,
  };
}

describe("R2B CRM entity contracts", () => {
  test("normalizes IDs and freezes customer records", () => {
    const result = parseCustomerProfile({ ...customer(), profileId: id(1).toUpperCase() });
    expect(result.profileId).toBe(id(1));
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects invalid customer date windows", () => {
    expect(customerProfileSchema.safeParse(customer({ contractStartAt: "2026-09-02T00:00:00.000Z", contractEndAt: "2026-09-01T00:00:00.000Z" })).success).toBe(false);
    expect(customerProfileSchema.safeParse(customer({ renewalWindowStartAt: "2026-09-02T00:00:00.000Z", renewalWindowEndAt: "2026-09-01T00:00:00.000Z" })).success).toBe(false);
  });

  test("requires complete vendor approval before activation or metadata", () => {
    expect(vendorProfileSchema.safeParse(vendor({ status: "active" })).success).toBe(false);
    expect(vendorProfileSchema.safeParse(vendor({ approvedAt: "2026-09-01T10:00:00.000Z" })).success).toBe(false);
    expect(vendorProfileSchema.safeParse(vendor({ approvedCommercialMetadata: { tier: "gold" } })).success).toBe(false);
    expect(parseVendorProfile(vendor({ status: "active", approvedAt: "2026-09-01T10:00:00.000Z", approvedByIdentityId: id(5), approvedCommercialMetadata: { tier: "gold" } })).status).toBe("active");
  });

  test("requires a distinct owning and vendor organization for products", () => {
    const input = { productId: id(6), organizationId: id(7), vendorOrganizationId: id(8), stableKey: "payroll", name: "Payroll", description: null, status: "draft", ...audit };
    expect(parseProduct(input).stableKey).toBe("payroll");
    expect(productSchema.safeParse({ ...input, vendorOrganizationId: id(7) }).success).toBe(false);
    expect(productSchema.safeParse({ ...input, stableKey: "Not Valid" }).success).toBe(false);
  });

  test("normalizes contact email and rejects unknown fields", () => {
    const result = parseContact({ contactId: id(9), organizationId: id(10), identityId: null, fullName: "Ada", normalizedEmail: "ADA@EXAMPLE.COM", phone: null, title: null, status: "active", ...audit });
    expect(result.normalizedEmail).toBe("ada@example.com");
    expect(() => parseContact({ contactId: id(9), organizationId: id(10), identityId: null, fullName: "Ada", normalizedEmail: null, phone: null, title: null, status: "active", ...audit, secret: "x" })).toThrow("Invalid contact");
  });

  test("requires one organization or contact endpoint per relationship", () => {
    const input = { relationshipId: id(11), organizationId: id(12), relationshipType: "customer_vendor", subject: { organizationId: id(12), contactId: null }, related: { organizationId: id(13), contactId: null }, ownerIdentityId: id(14), influence: "high", preference: null, status: "active", ...audit };
    expect(parseRelationship(input).relationshipType).toBe("customer_vendor");
    expect(relationshipSchema.safeParse({ ...input, related: { organizationId: null, contactId: null } }).success).toBe(false);
    expect(relationshipSchema.safeParse({ ...input, related: { organizationId: id(12), contactId: null } }).success).toBe(false);
  });

  test("rejects same contact relationships and reversed audit timestamps", () => {
    const input = { relationshipId: id(15), organizationId: id(16), relationshipType: "customer_contact", subject: { organizationId: null, contactId: id(17) }, related: { organizationId: null, contactId: id(18) }, ownerIdentityId: id(19), influence: "unknown", preference: null, status: "active", ...audit };
    expect(parseRelationship(input).status).toBe("active");
    expect(relationshipSchema.safeParse({ ...input, related: { organizationId: null, contactId: id(17) } }).success).toBe(false);
    expect(relationshipSchema.safeParse({ ...input, updatedAt: "2026-09-01T09:00:00.000Z" }).success).toBe(false);
  });
});
