import { describe, expect, test, vi } from "vitest";

import { parseAuditEventMetadataRows } from "./events";

vi.mock("server-only", () => ({}));

const row = {
  id: "abcdef01-2345-4678-9abc-def012345678", action: "role_version.activate",
  entity_type: "role_definition", entity_id: "11111111-1111-4111-8111-111111111111",
  occurred_at: "2026-08-30T12:00:00-04:00",
};

describe("audit metadata DTO", () => {
  test("returns only the fixed metadata fields", () => {
    const result = parseAuditEventMetadataRows([{
      ...row, reason: "private reason", actor_identity_id: row.entity_id,
      before_summary: { email: "private@example.com" }, after_summary: { fullRecord: "private" },
      actor_reference: "internal", correlation_id: row.id, idempotency_key: row.id,
    }]);
    expect(result).toEqual([{
      id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id,
      occurredAt: "2026-08-30T16:00:00.000Z",
    }]);
  });

  test("accepts an empty authorized response without fabricating an event", () => {
    expect(parseAuditEventMetadataRows([])).toEqual([]);
  });

  test("preserves the fixed endpoint limit", () => {
    expect(parseAuditEventMetadataRows(Array(100).fill(row))).toHaveLength(100);
    expect(parseAuditEventMetadataRows(Array(101).fill(row))).toBeNull();
  });

  test("accepts an existing migration entity identifier", () => {
    expect(parseAuditEventMetadataRows([{ ...row, entity_id: "r1.4-evaluation" }])?.[0].entityId).toBe("r1.4-evaluation");
  });

  test.each([
    null, undefined, {}, row, [null], [{}], [{ ...row, id: "invalid" }],
    [{ ...row, entity_type: "" }], [{ ...row, entity_id: null }],
    [{ ...row, occurred_at: "yesterday" }], [{ ...row, occurred_at: "2026-08-30T12:00:00" }],
    [{ ...row, action: "" }], [row, { ...row, id: "invalid" }],
  ])("rejects a malformed response without returning partial rows: %j", (value) => {
    expect(parseAuditEventMetadataRows(value)).toBeNull();
  });
});
