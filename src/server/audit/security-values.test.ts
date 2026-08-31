import { describe, expect, test, vi } from "vitest";

import { securityReasonSchema, securityTimestampSchema, securityUuidSchema } from "./security-values";

vi.mock("server-only", () => ({}));

describe("safe security values", () => {
  test("accepts a short reason and the maximum length", () => {
    expect(securityReasonSchema.parse("  Approved access review  ")).toBe("Approved access review");
    expect(securityReasonSchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(securityReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });

  test.each([
    "", "   ", "\n", "Review\nDone", "Review\tDone", "Review\u0000Done",
    "See https://example.com/review", "See HTTP://example.com", "See ftp://example.com",
    "See www.example.com", "Use mailto:person@example.com", "Use data:text/plain,private",
    "callback?token=private", "callback?x-amz-signature=private", "password=private",
    "passwd: private", "secret = private", "secret_key=private", "client_secret: private",
    "api key: private", "access_token=private", "token: private", "session_id=private",
    "refresh token: private", "authorization: private", "cookie: private", "Bearer private", "Basic private",
    '{"password":"private"}', '{"secret_key":"private"}', "sk-proj-examplevalue0000",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.private",
    "-----BEGIN PRIVATE KEY-----", "-----BEGIN RSA PRIVATE KEY-----",
  ])("rejects empty, unsafe, or secret-bearing reasons: %s", (reason) => {
    expect(securityReasonSchema.safeParse(reason).success).toBe(false);
  });

  test("allows a reason about credential work without recording the credential", () => {
    expect(securityReasonSchema.safeParse("Approved credential rotation after access review").success).toBe(true);
    expect(securityReasonSchema.safeParse("Revoke workspace.access after review").success).toBe(true);
  });

  test("canonicalizes timestamps while leaving expiry authority to SQL", () => {
    expect(securityTimestampSchema.parse("2000-01-01T12:00:00-05:00")).toBe("2000-01-01T17:00:00.000Z");
  });

  test("canonicalizes valid UUIDs", () => {
    expect(securityUuidSchema.parse("ABCDEF01-2345-4678-9ABC-DEF012345678")).toBe("abcdef01-2345-4678-9abc-def012345678");
    expect(securityUuidSchema.safeParse("invalid").success).toBe(false);
  });
});
