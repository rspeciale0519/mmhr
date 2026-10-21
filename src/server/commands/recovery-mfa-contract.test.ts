import { describe, expect, test } from "vitest";

import {
  parseRecoveryMfaReceipt, reactivateRecoveredIdentitySchema, recoveryMfaActions, recoveryMfaContextRowsSchema,
  registerRecoveryFactorSchema,
} from "./recovery-mfa-contract";

const requestId = "abcdefab-1111-4111-8111-111111111111";
const presenceId = "abcdefab-2222-4222-8222-222222222222";
const factorId = "abcdefab-3333-4333-8333-333333333333";
const receiptId = "abcdefab-4444-4444-8444-444444444444";
const idempotencyKey = "abcdefab-5555-4555-8555-555555555555";
const invalidUuids = [
  null, 3, "", "invalid", "abcdefab111141118111111111111111", `{${requestId}}`, ` ${requestId} `,
  "11111111-1111-f111-8111-111111111111", "11111111-1111-4111-7111-111111111111",
];
const row = {
  recovery_request_id: requestId, recovery_presence_id: presenceId,
  expected_factor_id: null, state: "enrollment_required",
};
const receipt = { receipt_id: receiptId, entity_id: presenceId, action: "identity.recovery.factor.register" as const };

describe("recovery MFA input schemas", () => {
  const inputs = [
    { name: "factor registration", schema: registerRecoveryFactorSchema, input: { factorId, idempotencyKey } },
    { name: "reactivation", schema: reactivateRecoveredIdentitySchema, input: { idempotencyKey } },
  ];
  for (const { name, schema, input } of inputs) {
    test.each([null, undefined, [], {}, "request"])(`rejects missing or wrong ${name} input: %j`, (value) => {
      expect(schema.safeParse(value).success).toBe(false);
    });
    test.each([
      "actorId", "actor_id", "identityId", "subjectId", "sessionId", "auth_subject_id", "auth_session_id",
      "targetIdentityId", "recoveryPresenceId", "requestId", "aal", "assurance", "correlationId", "rpc",
      "supabase", "secret", "totp", "challengeId", "verificationCode", "email", "reason", "state",
    ])(`rejects the extra ${name} field %s`, (field) => {
      expect(schema.safeParse({ ...input, [field]: "not permitted" }).success).toBe(false);
    });
    test.each(invalidUuids)(`rejects unsupported ${name} idempotency keys: %j`, (value) => {
      expect(schema.safeParse({ ...input, idempotencyKey: value }).success).toBe(false);
    });
    test(`normalizes the ${name} idempotency key`, () => {
      expect(schema.parse({ ...input, idempotencyKey: idempotencyKey.toUpperCase() }).idempotencyKey).toBe(idempotencyKey);
    });
  }
  test.each(invalidUuids)("rejects invalid provider factor IDs: %j", (value) => {
    expect(registerRecoveryFactorSchema.safeParse({ factorId: value, idempotencyKey }).success).toBe(false);
  });
  test("normalizes factor IDs without changing the semantic request", () => {
    expect(registerRecoveryFactorSchema.parse({ factorId: factorId.toUpperCase(), idempotencyKey })).toEqual({ factorId, idempotencyKey });
  });
  test("does not let a reactivation select a factor", () => {
    expect(reactivateRecoveredIdentitySchema.safeParse({ idempotencyKey, factorId }).success).toBe(false);
  });
});

describe("recovery MFA context allowlist", () => {
  test("returns null for the exact empty SQL row set", () => {
    expect(recoveryMfaContextRowsSchema.parse([])).toBeNull();
  });
  test.each([
    { state: "enrollment_required", expected_factor_id: null },
    { state: "verification_required", expected_factor_id: factorId },
    { state: "completed", expected_factor_id: factorId },
    { state: "needs_review", expected_factor_id: null },
    { state: "needs_review", expected_factor_id: factorId },
  ])("permits only a consistent context: %j", (change) => {
    const result = recoveryMfaContextRowsSchema.parse([{ ...row, ...change }]);
    expect(result).toEqual({
      recoveryRequestId: requestId, recoveryPresenceId: presenceId,
      expectedFactorId: change.expected_factor_id, state: change.state,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
  test.each([
    null, undefined, {}, row, [null], [{ ...row, state: "active" }], [{ ...row, state: null }],
    [{ ...row, state: "enrollment_required", expected_factor_id: factorId }],
    [{ ...row, state: "verification_required" }], [{ ...row, state: "completed" }],
    [{ ...row, expected_factor_id: undefined }], [{ ...row, recovery_request_id: undefined }],
    [{ ...row, recovery_presence_id: undefined }], [row, row],
    [row, { ...row, recovery_presence_id: requestId }],
  ])("rejects malformed, duplicate, or inconsistent rows: %j", (value) => {
    expect(recoveryMfaContextRowsSchema.safeParse(value).success).toBe(false);
  });
  test.each(["actor_id", "identity_id", "subject_id", "session_id", "secret", "email", "access_token", "extra"])
    ("rejects unlisted context field %s", (field) => {
      expect(recoveryMfaContextRowsSchema.safeParse([{ ...row, [field]: "must not escape" }]).success).toBe(false);
    });
  for (const field of ["recovery_request_id", "recovery_presence_id", "expected_factor_id"] as const) {
    test.each(invalidUuids.filter((value) => value !== null))(`rejects malformed ${field}: %j`, (value) => {
      expect(recoveryMfaContextRowsSchema.safeParse([{ ...row, state: "needs_review", [field]: value }]).success).toBe(false);
    });
  }
  test("normalizes every context UUID", () => {
    expect(recoveryMfaContextRowsSchema.parse([{
      recovery_request_id: requestId.toUpperCase(), recovery_presence_id: presenceId.toUpperCase(),
      expected_factor_id: factorId.toUpperCase(), state: "verification_required",
    }])).toEqual({ recoveryRequestId: requestId, recoveryPresenceId: presenceId, expectedFactorId: factorId, state: "verification_required" });
  });
});

describe("recovery MFA receipt allowlist", () => {
  test.each(recoveryMfaActions)("accepts only the expected action %s", (action) => {
    const result = parseRecoveryMfaReceipt({ ...receipt, action }, action);
    expect(result).toEqual({ receiptId, entityId: presenceId, action });
    expect(Object.isFrozen(result)).toBe(true);
  });
  test("rejects a different valid command action", () => {
    expect(parseRecoveryMfaReceipt(receipt, "identity.recovery.reactivate")).toBeNull();
  });
  test.each([
    null, undefined, {}, [], [receipt], { ...receipt, action: "identity.recovery.presence.create" },
    { ...receipt, action: "identity.recovery.reset_confirmed" }, { ...receipt, action: "identity.recovery.request" },
    { ...receipt, action: null }, { ...receipt, receipt_id: undefined }, { ...receipt, entity_id: undefined },
  ])("rejects malformed receipts or unrelated actions: %j", (value) => {
    expect(parseRecoveryMfaReceipt(value, receipt.action)).toBeNull();
  });
  test.each(["actor_id", "subject_id", "session_id", "factor_id", "correlation_id", "secret", "email", "extra"])
    ("rejects unlisted receipt field %s", (field) => {
      expect(parseRecoveryMfaReceipt({ ...receipt, [field]: "must not escape" }, receipt.action)).toBeNull();
    });
  for (const field of ["receipt_id", "entity_id"] as const) {
    test.each(invalidUuids)(`rejects malformed ${field}: %j`, (value) => {
      expect(parseRecoveryMfaReceipt({ ...receipt, [field]: value }, receipt.action)).toBeNull();
    });
  }
  test("normalizes both receipt UUIDs", () => {
    expect(parseRecoveryMfaReceipt({ ...receipt, receipt_id: receiptId.toUpperCase(), entity_id: presenceId.toUpperCase() }, receipt.action))
      .toEqual({ receiptId, entityId: presenceId, action: receipt.action });
  });
});
