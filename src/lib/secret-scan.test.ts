import { describe, expect, test } from "vitest";

import { findSecretMatches } from "@/lib/secret-scan";

describe("secret scan", () => {
  test.each([
    ["-----BEGIN RSA PRIVATE KEY-----", "private-key"],
    ["AKIA1234567890ABCDEF", "aws-access-key"],
    ["ghp_123456789012345678901234", "github-token"],
    ["xoxb-123456789012345678901234", "slack-token"],
    ["sk_live_1234567890123456", "stripe-key"],
    ["postgres://user:password@db.example.test/app", "credential-url"],
  ] as const)("finds %s", (text, kind) => {
    expect(findSecretMatches(text)).toEqual([{ line: 1, kind }]);
  });

  test("returns no matches for ordinary configuration text", () => {
    expect(findSecretMatches("NEXT_PUBLIC_APP_URL=https://example.test\nKEY="))
      .toEqual([]);
  });
});
