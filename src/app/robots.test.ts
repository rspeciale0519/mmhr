import { afterEach, describe, expect, test, vi } from "vitest";

import robots from "./robots";

describe("robots route", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("disallows crawlers while production release is blocked", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  test("disallows crawlers on an opened develop preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  test("allows crawlers outside the production quarantine", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  test("does not advertise launch-hidden pages", () => {
    vi.stubEnv("NODE_ENV", "development");

    const output = JSON.stringify(robots());
    for (const hidden of [
      "/about",
      "/blog",
      "/broker-model",
      "/case-studies",
      "/faq",
      "/partners",
      "/platform",
      "/resources/",
      "/services",
      "/transparency",
    ]) {
      expect(output, hidden).not.toContain(hidden);
    }
  });
});
