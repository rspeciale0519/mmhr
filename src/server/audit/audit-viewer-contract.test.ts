import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import { auditViewerEventSchema, searchAuditEvents } from "./audit-viewer-contract";

const organizationId = randomUUID();
const actorIdentityId = randomUUID();
const correlationId = randomUUID();

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: randomUUID(), organizationId, actorIdentityId,
    entityType: "deal", entityId: "deal-1", action: "deal.stage.change",
    occurredAt: "2026-08-31T12:00:00.000Z", correlationId, ...overrides,
  };
}

describe("audit viewer contract", () => {
  test("filters by actor, entity, action, and date range in stable order", () => {
    const older = event({ eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-08-30T12:00:00.000Z", action: "deal.created" });
    const newer = event({ eventId: "22222222-2222-4222-8222-222222222222" });
    const result = searchAuditEvents([older, newer], {
      organizationId, actorIdentityId, entityType: "deal", action: "deal.stage.change",
      occurredFrom: "2026-08-31T00:00:00.000Z", limit: 50,
    });
    expect(result.rows.map((row) => row.eventId)).toEqual([newer.eventId]);
  });

  test("includes global events but rejects another organization's event", () => {
    expect(searchAuditEvents([event({ organizationId: null })], { organizationId }).rows).toHaveLength(1);
    expect(() => searchAuditEvents([event({ organizationId: randomUUID() })], { organizationId })).toThrow("another organization");
  });

  test("paginates with an opaque deterministic cursor", () => {
    const first = event({ eventId: "11111111-1111-4111-8111-111111111111" });
    const second = event({ eventId: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-08-30T12:00:00.000Z" });
    const page = searchAuditEvents([first, second], { organizationId, limit: 1 });
    expect(page.rows).toHaveLength(1);
    expect(page.nextCursor).toBe("1");
    expect(searchAuditEvents([first, second], { organizationId, limit: 1, cursor: page.nextCursor }).rows.map((row) => row.eventId)).toEqual([second.eventId]);
  });

  test("rejects duplicates, malformed rows, reversed ranges, and unsafe cursors", () => {
    const row = event();
    expect(() => searchAuditEvents([row, row], { organizationId })).toThrow("Duplicate audit event");
    expect(() => searchAuditEvents([{ ...row, action: "bad action" }], { organizationId })).toThrow("Invalid audit viewer event");
    expect(() => searchAuditEvents([row], { organizationId, occurredFrom: "2026-09-01T00:00:00.000Z", occurredTo: "2026-08-01T00:00:00.000Z" })).toThrow("Invalid audit viewer query");
    expect(() => searchAuditEvents([row], { organizationId, cursor: "-1" })).toThrow("Invalid audit viewer cursor");
  });

  test("returns frozen rows and strips extra fields", () => {
    const result = searchAuditEvents([event()], { organizationId });
    expect(result.rows[0]).not.toHaveProperty("privateValue");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(auditViewerEventSchema.safeParse(event()).success).toBe(true);
    expect(auditViewerEventSchema.safeParse(event({ privateValue: "redact" })).success).toBe(false);
  });
});
