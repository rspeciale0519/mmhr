import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { dealCommandSchema } from "./deal";

const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), dealId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("R2B deal command", () => {
  test("accepts a lead deal with optional product links", () => expect(dealCommandSchema.parse({ ...base, action: "create", vendorOrganizationId: randomUUID(), productId: null, ownerIdentityId: base.actorIdentityId, stage: "lead", status: "open", expectedCloseAt: null })).toMatchObject({ action: "create", stage: "lead" }));
  test("accepts a valid stage transition", () => expect(dealCommandSchema.parse({ ...base, action: "transition", fromStage: "lead", toStage: "discovery", fromStatus: "open", toStatus: "open", expectedRevision: 1, occurredAt: "2026-09-03T00:00:00Z", reason: "Qualify opportunity" })).toMatchObject({ action: "transition", toStage: "discovery" }));
  test("requires a positive revision and bounded reason", () => expect(dealCommandSchema.safeParse({ ...base, action: "transition", fromStage: "lead", toStage: "won", fromStatus: "open", toStatus: "won", expectedRevision: 0, occurredAt: "2026-09-03T00:00:00Z", reason: "Won" }).success).toBe(false));
});
