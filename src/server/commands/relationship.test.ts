import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { relationshipCommandSchema } from "./relationship";
const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), relationshipId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("R2B relationship command", () => {
  test("accepts organization-to-organization relationship metadata", () => expect(relationshipCommandSchema.parse({ ...base, action: "create", relationshipType: "customer_vendor", subjectOrganizationId: base.organizationId, subjectContactId: null, relatedOrganizationId: randomUUID(), relatedContactId: null, ownerIdentityId: base.actorIdentityId, influence: "high", preference: "Email" })).toMatchObject({ action: "create", influence: "high" }));
  test("rejects two endpoints on one side", () => expect(relationshipCommandSchema.safeParse({ ...base, action: "create", relationshipType: "partner", subjectOrganizationId: base.organizationId, subjectContactId: randomUUID(), relatedOrganizationId: randomUUID(), relatedContactId: null, ownerIdentityId: null, influence: "unknown", preference: null }).success).toBe(false));
  test("requires a positive revision for updates", () => expect(relationshipCommandSchema.safeParse({ ...base, action: "update", expectedRevision: 0 }).success).toBe(false));
});
