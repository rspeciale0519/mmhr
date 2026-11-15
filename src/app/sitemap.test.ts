import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { isPathInLaunch } from "@/lib/launch-surface";

import sitemap, {
  getPublicSitemapPaths,
  PUBLIC_SITEMAP_PATHS,
} from "./sitemap";

const siteRoot = path.join(process.cwd(), "src", "app", "(marketing)", "(site)");

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function routePath(file: string): string {
  const relative = path.relative(siteRoot, file).replaceAll("\\", "/");
  const segments = relative.split("/");
  segments.pop();
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

describe("sitemap route", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("returns stable marketing routes with the configured canonical origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const entries = sitemap();

    expect(entries).toEqual([
      { url: "http://localhost:3000/" },
      { url: "http://localhost:3000/contact" },
      { url: "http://localhost:3000/privacy" },
      { url: "http://localhost:3000/terms" },
    ]);
    expect(entries.some(({ url }) => url.includes("/admin"))).toBe(false);
    expect(entries.some(({ url }) => url.includes("/designs"))).toBe(false);
  });

  test("lists only paths that the launch surface serves in every candidate", () => {
    for (const pathname of getPublicSitemapPaths()) {
      for (const candidate of ["A", "B"] as const) {
        expect(isPathInLaunch(pathname, candidate), `${pathname} (${candidate})`).toBe(true);
      }
    }
  });

  test.each([
    "/about",
    "/blog",
    "/blog/what-hris-pricing-actually-looks-like",
    "/broker-model",
    "/case-studies",
    "/case-studies/northwind-payroll-renegotiation",
    "/faq",
    "/partners/pe-vc",
    "/platform",
    "/resources",
    "/resources/requirements-builder",
    "/services",
    "/transparency",
  ])("does not list the launch-hidden page %s", (pathname) => {
    expect(getPublicSitemapPaths()).not.toContain(pathname);
  });

  test("fails closed when production release access is blocked", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");

    expect(sitemap()).toEqual([]);
  });

  test("stays empty on an opened develop preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_RELEASE_ENABLED", "0");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MMHR_PREVIEW_RELEASE_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://develop.mmhr.test");

    expect(sitemap()).toEqual([]);
  });

  test("fails closed when no canonical application origin is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(sitemap()).toEqual([]);
  });

  test("covers every stable sitemap route with route-specific metadata", () => {
    const pages = walk(siteRoot).filter(
      (file) => file.endsWith("page.tsx") && !file.includes("[slug]"),
    );
    const pageByRoute = new Map(pages.map((file) => [routePath(file), file]));

    for (const pathname of PUBLIC_SITEMAP_PATHS) {
      const file = pageByRoute.get(pathname);
      expect(file, pathname).toBeDefined();
      expect(readFileSync(file!, "utf8"), pathname).toContain(
        "getMarketingPageMetadata",
      );
    }
  });
});
