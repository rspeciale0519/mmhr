import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import {
  administrationConfigSchema,
  approveAdministrationConfiguration,
  retireAdministrationConfiguration,
} from "./administration-config-contract";

const creator = randomUUID();
const reviewer = randomUUID();

function draft(overrides: Record<string, unknown> = {}) {
  return {
    configurationId: randomUUID(), organizationId: null, category: "system", version: 1, revision: 1,
    status: "draft", entries: [{ key: "default_timezone", value: "America/New_York" }],
    createdByIdentityId: creator, approvedByIdentityId: null, approvedAt: null, approvalReference: null, ...overrides,
  };
}

describe("administration configuration contract", () => {
  test("approves a draft and increments its revision", () => {
    const input = draft();
    const result = approveAdministrationConfiguration(input, {
      configurationId: input.configurationId, expectedRevision: 1, approvedByIdentityId: reviewer,
      approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "change-123",
    });
    expect(result.status).toBe("approved");
    expect(result.revision).toBe(2);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("retires approved history without deleting it", () => {
    const input = draft();
    const approved = approveAdministrationConfiguration(input, {
      configurationId: input.configurationId, expectedRevision: 1, approvedByIdentityId: reviewer,
      approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "change-123",
    });
    const retired = retireAdministrationConfiguration(approved, { configurationId: input.configurationId, expectedRevision: 2, retiredAt: "2026-08-31T13:00:00.000Z" });
    expect(retired.status).toBe("retired");
    expect(retired.entries).toEqual(input.entries);
  });

  test.each([
    ["duplicate keys", { entries: [{ key: "x", value: true }, { key: "x", value: false }] }],
    ["secret keys", { entries: [{ key: "api_key", value: "do-not-store" }] }],
    ["approval on draft", { approvedByIdentityId: reviewer, approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "x" }],
    ["creator approval", { status: "approved", approvedByIdentityId: creator, approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "x" }],
    ["unknown fields", { unsafe: "value" }],
  ] as const)("rejects %s", (_label, overrides) => {
    expect(administrationConfigSchema.safeParse(draft(overrides)).success).toBe(false);
  });

  test("rejects stale, invalid, and terminal transitions", () => {
    const input = draft();
    expect(() => approveAdministrationConfiguration(input, {
      configurationId: input.configurationId, expectedRevision: 2, approvedByIdentityId: reviewer,
      approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "change-123",
    })).toThrow("stale");
    const approved = approveAdministrationConfiguration(input, {
      configurationId: input.configurationId, expectedRevision: 1, approvedByIdentityId: reviewer,
      approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "change-123",
    });
    expect(() => approveAdministrationConfiguration(approved, {
      configurationId: input.configurationId, expectedRevision: 2, approvedByIdentityId: reviewer,
      approvedAt: "2026-08-31T12:00:00.000Z", approvalReference: "change-123",
    })).toThrow("Only draft");
    expect(() => retireAdministrationConfiguration(input, { configurationId: input.configurationId, expectedRevision: 1, retiredAt: "2026-08-31T13:00:00.000Z" })).toThrow("Only approved");
  });
});
