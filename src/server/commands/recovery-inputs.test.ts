import { describe, expect, test } from "vitest";

import {
  decideIdentityRecoverySchema, endIdentityRecoverySchema, prepareRecoveryPresenceSchema, requestIdentityRecoverySchema,
} from "./recovery-inputs";

const id = "abcdefab-1111-4111-8111-111111111111";
const metadata = { idempotencyKey: id };
const request = { ...metadata, opaqueReference: "a".repeat(64), reasonCode: "lost_factor" };
const decision = {
  ...metadata, requestId: id, phoneResult: "confirmed", preexistingContactAttested: true,
  phoneCheckedAt: "2026-08-30T12:30:00-04:00", evidenceReference: id,
};
const end = { ...metadata, requestId: id, endState: "cancelled" };
const inputs = [
  { name: "presence", schema: prepareRecoveryPresenceSchema, input: metadata },
  { name: "request", schema: requestIdentityRecoverySchema, input: request },
  { name: "decision", schema: decideIdentityRecoverySchema, input: decision },
  { name: "end", schema: endIdentityRecoverySchema, input: end },
];

describe("recovery input schemas", () => {
  test.each(inputs)("normalizes canonical UUIDs for $name", ({ schema, input }) => {
    expect(schema.parse({ ...input, idempotencyKey: id.toUpperCase() }).idempotencyKey).toBe(id);
  });

  for (const { name, schema, input } of inputs) {
    test.each([null, undefined, [], {}, "request"])(`rejects missing or wrong ${name} input: %j`, (value) => {
      expect(schema.safeParse(value).success).toBe(false);
    });
    test.each([
      "actorId", "actor_id", "subjectId", "sessionId", "auth_session_id", "auth_subject_id",
      "targetIdentityId", "assurance", "correlationId", "supabase", "rpc", "phoneNumber", "callNotes", "reason",
    ])(`rejects extra ${name} field %s`, (field) => {
      expect(schema.safeParse({ ...input, [field]: "not permitted" }).success).toBe(false);
    });
    test.each([
      null, 3, "", "invalid", "abcdefab111141118111111111111111", `{${id}}`, ` ${id} `,
      "11111111-1111-f111-8111-111111111111", "11111111-1111-4111-7111-111111111111",
    ])(`rejects unsupported ${name} idempotency keys: %j`, (value) => {
      expect(schema.safeParse({ ...input, idempotencyKey: value }).success).toBe(false);
    });
  }

  test.each(["lost_factor", "compromised_factor", "replace_device"])("accepts reason code %s", (reasonCode) => {
    expect(requestIdentityRecoverySchema.safeParse({ ...request, reasonCode }).success).toBe(true);
  });
  test.each([null, "", "lost factor", "password=value", "https://example.invalid", "reset_password"])
    ("rejects non-code reasons: %j", (reasonCode) => {
      expect(requestIdentityRecoverySchema.safeParse({ ...request, reasonCode }).success).toBe(false);
    });
  test.each([null, "", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), " " + "a".repeat(64)])
    ("requires the exact opaque reference format: %j", (opaqueReference) => {
      expect(requestIdentityRecoverySchema.safeParse({ ...request, opaqueReference }).success).toBe(false);
    });

  test("normalizes a phone-check instant and its UUIDs", () => {
    expect(decideIdentityRecoverySchema.parse({ ...decision, requestId: id.toUpperCase(), evidenceReference: id.toUpperCase() }))
      .toEqual({ ...decision, phoneCheckedAt: "2026-08-30T16:30:00.000Z" });
  });
  test.each(["no_preexisting_number", "no_answer", "not_confirmed", "failed"])
    ("permits a failed check without evidence: %s", (phoneResult) => {
      expect(decideIdentityRecoverySchema.safeParse({ ...decision, phoneResult, evidenceReference: null }).success).toBe(true);
    });
  test("permits an unattested confirmation only as a denial", () => {
    expect(decideIdentityRecoverySchema.safeParse({ ...decision, preexistingContactAttested: false, evidenceReference: null }).success).toBe(true);
    expect(decideIdentityRecoverySchema.safeParse({ ...decision, evidenceReference: null }).success).toBe(false);
  });
  test.each([
    { requestId: "invalid" }, { phoneResult: "approved" }, { phoneResult: null },
    { preexistingContactAttested: "true" }, { preexistingContactAttested: null },
    { phoneCheckedAt: "now" }, { phoneCheckedAt: "infinity" }, { phoneCheckedAt: "2026-08-30T16:30:00" },
    { phoneCheckedAt: "2026-02-30T16:30:00Z" }, { evidenceReference: "call-record.txt" },
    { evidenceReference: "11111111-1111-f111-8111-111111111111" },
  ])("rejects invalid phone-check metadata: %j", (change) => {
    expect(decideIdentityRecoverySchema.safeParse({ ...decision, ...change }).success).toBe(false);
  });
  test.each(["expired", "cancelled"])("accepts fixed end state %s", (endState) => {
    expect(endIdentityRecoverySchema.safeParse({ ...end, endState }).success).toBe(true);
  });
  test.each(["approved", "completed", "pending", "in_flight", null, ""])("rejects arbitrary end state %j", (endState) => {
    expect(endIdentityRecoverySchema.safeParse({ ...end, endState }).success).toBe(false);
  });
});
