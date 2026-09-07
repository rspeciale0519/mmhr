import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { vendorFactOverrideCommandSchema } from "./vendor-fact-override";

const base = { action: "create" as const, overrideId: randomUUID(), organizationId: randomUUID(), factId: randomUUID(), sourceId: randomUUID(), value: "Reviewed value", approvedByIdentityId: randomUUID(), approvedAt: "2026-09-03T00:00:00Z", expiresAt: "2026-10-03T00:00:00Z", reason: "Source correction", correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("R2B vendor fact override command", () => {
  test("accepts a source-linked expiring override", () => expect(vendorFactOverrideCommandSchema.parse(base)).toMatchObject({ action: "create", value: "Reviewed value" }));
  test("rejects an expiry before approval", () => expect(vendorFactOverrideCommandSchema.safeParse({ ...base, expiresAt: "2026-09-02T00:00:00Z" }).success).toBe(false));
  test("rejects missing source and reason", () => expect(vendorFactOverrideCommandSchema.safeParse({ ...base, sourceId: undefined, reason: "" }).success).toBe(false));
});
