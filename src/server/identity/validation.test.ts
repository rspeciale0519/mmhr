// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalOrigin,
  fixedInvitationAcceptanceUrl,
  invitationDeliveryRequestSchema,
  mfaResetRequestSchema,
} from "./validation";

const context = {
  operation: "invitation_delivery" as const,
  intentId: "c80e9dca-fdf9-4d1e-bce1-281f0e9f188a",
  correlationId: "95284599-c545-46a8-8b02-2f8e6f3fda26",
  idempotencyKey: "50988d32-2943-4ef9-9db4-c8bef2817b90",
};

describe("identity request validation", () => {
  test("requires a fixed operation and complete opaque intent context", () => {
    const input = { email: "  Person@Example.test  ", context };
    expect(invitationDeliveryRequestSchema.parse(input).email).toBe("person@example.test");
    for (const field of ["operation", "intentId", "correlationId", "idempotencyKey"] as const) {
      expect(invitationDeliveryRequestSchema.safeParse({
        ...input, context: { ...context, [field]: undefined },
      }).success).toBe(false);
    }
    expect(invitationDeliveryRequestSchema.safeParse({
      ...input, context: { ...context, operation: "mfa_enrollment_reset" },
    }).success).toBe(false);
  });

  test("rejects raw application tokens and user-supplied redirect metadata", () => {
    const input = { email: "person@example.test", context };
    for (const extra of [{ redirectTo: "https://other.example.test" }, { token: "raw-token" }, { data: {} }]) {
      expect(invitationDeliveryRequestSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(invitationDeliveryRequestSchema.safeParse({
      ...input, context: { ...context, idempotencyKey: "person@example.test" },
    }).success).toBe(false);
    expect(invitationDeliveryRequestSchema.safeParse({
      ...input, context: { ...context, idempotencyKey: "a".repeat(64) },
    }).success).toBe(true);
  });

  test("rejects an arbitrary reset action or target path", () => {
    const input = { subjectId: context.intentId, context: { ...context, operation: "mfa_enrollment_reset" } };
    expect(mfaResetRequestSchema.safeParse(input).success).toBe(true);
    expect(mfaResetRequestSchema.safeParse({ ...input, subjectId: "../other-user" }).success).toBe(false);
    expect(mfaResetRequestSchema.safeParse({ ...input, factorIds: [context.intentId] }).success).toBe(false);
    expect(mfaResetRequestSchema.safeParse({
      ...input, context: { ...input.context, operation: "password_reset" },
    }).success).toBe(false);
  });
});

describe("fixed invitation acceptance URL", () => {
  test.each([
    ["https://app.example.test", "https://app.example.test/invitations/accept"],
    ["https://app.example.test/", "https://app.example.test/invitations/accept"],
    ["http://localhost:3000", "http://localhost:3000/invitations/accept"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000/invitations/accept"],
    ["http://[::1]:3000", "http://[::1]:3000/invitations/accept"],
  ])("builds only the fixed path for %s", (origin, expected) => {
    expect(fixedInvitationAcceptanceUrl(origin)).toBe(expected);
  });

  test.each([
    "http://app.example.test", "javascript:alert(1)", "//app.example.test",
    "https://user:password@app.example.test", "https://app.example.test/path",
    "https://app.example.test?token=secret", "https://app.example.test#token",
    " https://app.example.test", "https://app.example.test/../",
    "https://app.example.test\\other", "https://app.example.test//",
    "https://app.example.test/?", "https://app.example.test/#", "",
  ])("rejects an unsafe or noncanonical origin: %s", (origin) => {
    expect(canonicalOrigin(origin)).toBeNull();
    expect(fixedInvitationAcceptanceUrl(origin)).toBeNull();
  });
});
