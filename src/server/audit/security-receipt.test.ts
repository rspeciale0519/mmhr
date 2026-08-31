import { describe, expect, test, vi } from "vitest";

import { parseSecurityCommandReceipt, securityCommandActions } from "./security-receipt";

vi.mock("server-only", () => ({}));

const receiptId = "abcdef01-2345-4678-9abc-def012345678";
const entityId = "11111111-1111-4111-8111-111111111111";
const row = { receipt_id: receiptId, entity_id: entityId, action: "platform_role.assign" };

describe("security command receipts", () => {
  test.each(securityCommandActions)("accepts only the expected fixed action %s", (action) => {
    expect(parseSecurityCommandReceipt({ ...row, action }, action)).toEqual({ receiptId, entityId, action });
  });

  test.each([
    null, undefined, [], [row], {}, { ...row, receipt_id: "invalid" },
    { ...row, entity_id: "invalid" }, { ...row, action: "arbitrary.action" },
    { ...row, extra: true }, { ...row, actor_identity_id: entityId },
    { ...row, reason: "private" }, { ...row, after_summary: { email: "private@example.com" } },
  ])("rejects malformed receipts or extra columns: %j", (value) => {
    expect(parseSecurityCommandReceipt(value, "platform_role.assign")).toBeNull();
  });

  test("rejects an otherwise valid but different action", () => {
    expect(parseSecurityCommandReceipt(row, "platform_role.revoke")).toBeNull();
  });

  test("rejects a different known target", () => {
    expect(parseSecurityCommandReceipt(row, "platform_role.assign", receiptId)).toBeNull();
  });

  test("canonicalizes a matching UUID response", () => {
    expect(parseSecurityCommandReceipt({ ...row, receipt_id: receiptId.toUpperCase() }, "platform_role.assign", entityId))
      .toEqual({ receiptId, entityId, action: "platform_role.assign" });
  });
});
