import { afterEach, describe, expect, test, vi } from "vitest";

import robots from "./robots";

describe("robots route", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("disallows crawlers while production release is blocked", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  test("allows crawlers outside the production quarantine", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });
});
