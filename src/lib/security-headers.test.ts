import { describe, expect, test } from "vitest";

import {
  APPLICATION_SECURITY_HEADERS,
  applicationHeaderMap,
} from "@/lib/security-headers";

describe("application security headers", () => {
  test("blocks framing, sniffing, and plugin content", () => {
    const headers = applicationHeaderMap();

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  test("keeps a stable header inventory", () => {
    expect(APPLICATION_SECURITY_HEADERS.map((header) => header.key)).toEqual([
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "X-DNS-Prefetch-Control",
      "Content-Security-Policy",
      "Strict-Transport-Security",
    ]);
  });
});
