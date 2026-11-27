import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import * as forProviders from "./for-providers/page";
import * as howItWorks from "./how-it-works/page";
import * as resources from "./resources/page";
import * as whyItsFree from "./why-its-free/page";

// The four menu pages (owner decision, 2026-11-25).
const pages = [
  ["/how-it-works", howItWorks, "how-it-works"],
  ["/why-its-free", whyItsFree, "why-its-free"],
  ["/for-providers", forProviders, "for-providers"],
  ["/resources", resources, "resources"],
] as const;

describe("menu page metadata", () => {
  test.each(pages)("%s has its own canonical URL, title, and description", (pathname, page) => {
    expect(page.metadata.alternates?.canonical).toBe(pathname);
    expect(page.metadata.openGraph).toMatchObject({ url: pathname });
    expect(String(page.metadata.title)).toMatch(/— MatchMaker HR$/);
    expect(String(page.metadata.description).length).toBeGreaterThan(40);
  });

  test("uses a different title and description on every page", () => {
    const titles = pages.map(([, page]) => String(page.metadata.title));
    const descriptions = pages.map(([, page]) => String(page.metadata.description));
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
  });

  test.each(pages)("%s renders its body from src/designs/cobalt/pages/<slug>/Body.tsx", (_pathname, _page, slug) => {
    const source = readFileSync(path.join(process.cwd(), "src", "app", "(marketing)", "(site)", slug, "page.tsx"), "utf8");
    expect(source).toContain(`@/designs/cobalt/pages/${slug}/Body`);
    expect(source).toContain("CobaltPageTransition");
  });
});
