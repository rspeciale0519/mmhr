import { describe, expect, test } from "vitest";
import { rfpAmendmentCommandSchema } from "./rfp-amendment-contract";

const id = "11111111-1111-4111-8111-111111111111";
const base = { action: "create" as const, amendmentId: id, rfpId: id, organizationId: id, vendorProfileId: id, baseVersion: 1, version: 1, actorIdentityId: id, title: "Terms", items: [{ amendmentKey: "pricing", sectionKey: "commercial", title: "Pricing", text: "Terms" }], correlationId: id, idempotencyKey: id };

describe("RFP amendment contract", () => {
  test("accepts a bounded additive amendment", () => expect(rfpAmendmentCommandSchema.safeParse(base).success).toBe(true));
  test("rejects duplicate amendment keys and unknown fields", () => { expect(rfpAmendmentCommandSchema.safeParse({ ...base, items: [base.items[0], base.items[0]] }).success).toBe(false); expect(rfpAmendmentCommandSchema.safeParse({ ...base, extra: true }).success).toBe(false); });
});
