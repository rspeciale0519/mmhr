import { describe, expect, test, vi } from "vitest";

import { buildRfpEmail } from "./rfp-vendor-form-email";
import { isRfpFormToken, rfpFormLinksConfigured, rfpFormToken, rfpFormTokenHash, rfpFormUrl } from "./rfp-vendor-form-link";

vi.mock("server-only", () => ({}));

const secret = "test-secret-that-is-at-least-32-chars";
const recipientId = "22222222-2222-4222-8222-222222222222";

describe("RFP form private link", () => {
  test("makes the same 43-character token every time for one recipient", () => {
    const token = rfpFormToken(recipientId, secret)!;
    expect(isRfpFormToken(token)).toBe(true);
    expect(rfpFormToken(recipientId.toUpperCase(), secret)).toBe(token);
    // Another recipient, or another secret, gives an unrelated token.
    expect(rfpFormToken("33333333-3333-4333-8333-333333333333", secret)).not.toBe(token);
    expect(rfpFormToken(recipientId, `${secret}-other`)).not.toBe(token);
  });

  test("makes no token without a long enough secret", () => {
    expect(rfpFormToken(recipientId, "short")).toBeNull();
    expect(rfpFormLinksConfigured("short")).toBe(false);
    expect(rfpFormLinksConfigured(secret)).toBe(true);
  });

  test("refuses anything that is not token-shaped", () => {
    for (const value of ["", "abc", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}.`]) {
      expect(isRfpFormToken(value)).toBe(false);
    }
  });

  test("hashes the token and builds the link without a double slash", () => {
    const token = rfpFormToken(recipientId, secret)!;
    expect(rfpFormTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(rfpFormTokenHash(token)).not.toContain(token);
    expect(rfpFormUrl(token, "https://example.com/")).toBe(`https://example.com/rfp/${token}`);
  });
});

describe("RFP email", () => {
  const input = {
    kind: "invitation" as const, contactName: "Pat <b>Lee</b>", vendorName: "Northwind & Co", customerName: "Acme",
    rfpTitle: "HRIS request for proposal", formUrl: "https://example.com/rfp/abc", dueAt: new Date("2026-12-03T04:59:59Z"),
    brandName: "MatchMaker HR",
  };

  test("names the customer, the due date in Eastern time, and the link", () => {
    const email = buildRfpEmail(input);
    expect(email.subject).toBe("Request for proposal from Acme, due Wednesday, December 2, 2026");
    expect(email.text).toContain("Open the request: https://example.com/rfp/abc");
    expect(email.text).toContain("Responses are due by Wednesday, December 2, 2026.");
    expect(email.html).toContain('href="https://example.com/rfp/abc"');
  });

  test("escapes names in the HTML so they cannot add markup", () => {
    const email = buildRfpEmail(input);
    expect(email.html).toContain("Pat &lt;b&gt;Lee&lt;/b&gt;");
    expect(email.html).toContain("Northwind &amp; Co");
    expect(email.html).not.toContain("<b>Lee</b>");
  });

  test("a follow-up is marked as a reminder and carries the staff note", () => {
    const email = buildRfpEmail({ ...input, kind: "follow_up", note: "Any questions so far?" });
    expect(email.subject.startsWith("Reminder: ")).toBe(true);
    expect(email.text).toContain("Any questions so far?");
    expect(email.html).toContain("Any questions so far?");
  });
});
