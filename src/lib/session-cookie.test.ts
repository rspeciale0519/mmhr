import { describe, expect, test } from "vitest";

import {
  hardenSessionCookieOptions,
  shouldUseSecureCookies,
} from "@/lib/session-cookie";

describe("session cookie flags", () => {
  test("keeps local HTTP cookies usable without the Secure flag", () => {
    expect(shouldUseSecureCookies("http://localhost:3000")).toBe(false);

    expect(
      hardenSessionCookieOptions(
        { sameSite: "none", path: "/auth" },
        "http://localhost:3000",
      ),
    ).toEqual({ sameSite: "lax", secure: false, path: "/auth" });
  });

  test("forces Lax and Secure on HTTPS origins", () => {
    expect(shouldUseSecureCookies("https://app.example")).toBe(true);

    expect(
      hardenSessionCookieOptions({ path: "/" }, "https://app.example"),
    ).toMatchObject({ sameSite: "lax", secure: true, path: "/" });
  });

  test("leaves HttpOnly to the provider so the browser client can read the session", () => {
    expect(
      hardenSessionCookieOptions({ httpOnly: false }, "https://app.example"),
    ).toMatchObject({ httpOnly: false });
    expect(hardenSessionCookieOptions({}, "https://app.example")).not.toHaveProperty(
      "httpOnly",
    );
  });

  test("treats a missing app URL as HTTP", () => {
    expect(shouldUseSecureCookies(undefined)).toBe(false);
  });
});
