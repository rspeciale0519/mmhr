import { afterEach, describe, expect, test, vi } from "vitest";

import sitemap, { PUBLIC_SITEMAP_PATHS } from "./sitemap";

describe("sitemap route", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("returns stable marketing routes with the configured canonical origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const entries = sitemap();

    expect(entries).toHaveLength(PUBLIC_SITEMAP_PATHS.length);
    expect(entries[0]).toEqual({ url: "http://localhost:3000/" });
    expect(entries).toContainEqual({
      url: "http://localhost:3000/resources/requirements-builder",
    });
    expect(entries.some(({ url }) => url.includes("/admin"))).toBe(false);
    expect(entries.some(({ url }) => url.includes("/designs"))).toBe(false);
  });

  test("fails closed when production release access is blocked", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");

    expect(sitemap()).toEqual([]);
  });

  test("fails closed when no canonical application origin is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(sitemap()).toEqual([]);
  });
});
