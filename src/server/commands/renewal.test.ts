import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { renewalCommandSchema } from "./renewal";

const ids = { organizationId: randomUUID(), actorIdentityId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID(), renewalId: randomUUID() };
const dates = { contractStartAt: "2026-01-01T00:00:00.000Z", contractEndAt: "2027-01-01T00:00:00.000Z", renewalWindowStartAt: "2026-10-01T00:00:00.000Z", renewalWindowEndAt: "2026-12-01T00:00:00.000Z" };

describe("R8 renewal command", () => {
  test("accepts scoped create and transition payloads", () => {
    expect(renewalCommandSchema.parse({ ...ids, action: "create", contractId: randomUUID(), sourceDealId: randomUUID(), ownerIdentityId: ids.actorIdentityId, ...dates })).toMatchObject({ action: "create" });
    expect(renewalCommandSchema.parse({ ...ids, action: "transition", fromStatus: "upcoming", toStatus: "in_review", expectedRevision: 1, occurredAt: "2026-09-01T00:00:00.000Z", reason: "Start review", approvalReference: null })).toMatchObject({ action: "transition" });
  });

  test("rejects unknown fields and invalid statuses", () => {
    expect(renewalCommandSchema.safeParse({ ...ids, action: "transition", fromStatus: "bad", toStatus: "in_review", expectedRevision: 1, occurredAt: "2026-09-01T00:00:00.000Z", reason: "x", approvalReference: null }).success).toBe(false);
    expect(renewalCommandSchema.safeParse({ ...ids, action: "create", contractId: randomUUID(), sourceDealId: randomUUID(), ownerIdentityId: ids.actorIdentityId, ...dates, extra: true }).success).toBe(false);
  });
});
