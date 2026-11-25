import { describe, expect, test } from "vitest";

import { isPathInLaunch } from "@/lib/launch-surface";

import { isCurrentPage, siteAccountLinks, siteFooterLinks, siteMenuLinks } from "./site-links";

describe("site links", () => {
  test("links only to pages the launch surface serves in both candidates", () => {
    const hrefs = [
      ...siteMenuLinks.map(({ href }) => href),
      ...siteFooterLinks.map(({ href }) => href),
      siteAccountLinks.signIn.href,
      siteAccountLinks.startFree.href,
    ];
    for (const href of hrefs) {
      expect(isPathInLaunch(href, "A"), href).toBe(true);
      expect(isPathInLaunch(href, "B"), href).toBe(true);
    }
  });

  test("puts contact, privacy, and terms in the footer", () => {
    expect(siteFooterLinks.map(({ href }) => href)).toEqual(["/contact", "/privacy", "/terms"]);
  });

  test.each([
    ["/resources", "/resources", true],
    ["/resources/some-guide", "/resources", true],
    ["/resources-hub", "/resources", false],
    ["/how-it-works", "/why-its-free", false],
    ["/", "/", true],
    ["/resources", "/", false],
    [null, "/resources", false],
  ] as const)("isCurrentPage(%s, %s) is %s", (pathname, href, expected) => {
    expect(isCurrentPage(pathname, href)).toBe(expected);
  });
});
