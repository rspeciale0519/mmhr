import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { vendorSourceCommandSchema } from "./vendor-source";

const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), sourceId: randomUUID(), vendorProfileId: randomUUID(), ownerIdentityId: randomUUID(), uri: "https://vendor.example.invalid/source", sourceType: "manual" as const, captureMethod: "manual" as const, cadenceDays: 30, licenseNote: "Public vendor documentation", reviewRequired: true, capturedAt: "2026-09-01T00:00:00.000Z", correlationId: randomUUID(), idempotencyKey: randomUUID() };

describe("vendor source command", () => {
  test("accepts a bounded source registry record", () => expect(vendorSourceCommandSchema.parse({ ...base, action: "create" }).action).toBe("create"));
  test("accepts retirement with optimistic revision", () => expect(vendorSourceCommandSchema.parse({ organizationId: base.organizationId, actorIdentityId: base.actorIdentityId, sourceId: base.sourceId, action: "retire", expectedRevision: 1, reason: "License expired", correlationId: base.correlationId, idempotencyKey: base.idempotencyKey }).action).toBe("retire"));
  test("rejects non-HTTPS and invalid cadence", () => expect(vendorSourceCommandSchema.safeParse({ ...base, action: "create", uri: "http://vendor.example.invalid", cadenceDays: 0 }).success).toBe(false));
});
