import { describe, expect, test } from "vitest";

import {
  hiddenTrpcProcedures,
  isLaunchAreaEnabled,
  isPathInLaunch,
  launchAreaForPath,
  launchCandidate,
  launchVisibleLinks,
} from "./launch-surface";

describe("launch surface", () => {
  test("keeps only navigation links whose area is enabled", () => {
    const links = [
      { href: "/home" }, { href: "/customer?new=1" }, { href: "/customer/proposals" },
      { href: "/vendor/demos" }, { href: "/documents" }, { href: "/admin/finance/documents" },
    ];
    expect(launchVisibleLinks(links, "A")).toEqual([{ href: "/home" }, { href: "/customer?new=1" }]);
    expect(launchVisibleLinks(links, "B")).toEqual([
      { href: "/home" }, { href: "/customer?new=1" }, { href: "/customer/proposals" }, { href: "/vendor/demos" },
    ]);
  });

  test("defaults to Candidate A and rejects unknown candidates", () => {
    expect(launchCandidate(undefined)).toBe("A");
    expect(launchCandidate("")).toBe("A");
    expect(launchCandidate("A")).toBe("A");
    expect(launchCandidate("B")).toBe("B");
    expect(() => launchCandidate("C")).toThrow("MMHR_LAUNCH_CANDIDATE");
  });

  test("hides finance and documents in every candidate", () => {
    for (const candidate of ["A", "B"] as const) {
      expect(isLaunchAreaEnabled("finance", candidate)).toBe(false);
      expect(isLaunchAreaEnabled("documents", candidate)).toBe(false);
      expect(isLaunchAreaEnabled("core", candidate)).toBe(true);
    }
    expect(isLaunchAreaEnabled("candidate-b", "A")).toBe(false);
    expect(isLaunchAreaEnabled("candidate-b", "B")).toBe(true);
  });

  test.each([
    ["/admin/finance/invoices", "finance"],
    ["/api/finance/documents/access", "finance"],
    ["/documents", "documents"],
    ["/documents/review", "documents"],
    ["/api/documents/access", "documents"],
    ["/customer/demos", "candidate-b"],
    ["/vendor/proposals", "candidate-b"],
    ["/admin/contracts", "candidate-b"],
    ["/documentsx", "core"],
    ["/admin/financial-help", "core"],
    ["/customer/evaluation", "core"],
    ["/", "core"],
  ] as const)("maps %s to %s", (path, area) => {
    expect(launchAreaForPath(path)).toBe(area);
  });

  test("hides unapproved marketing pages in every candidate", () => {
    expect(isLaunchAreaEnabled("unapproved-marketing", "A")).toBe(false);
    expect(isLaunchAreaEnabled("unapproved-marketing", "B")).toBe(false);
  });

  // The 17 public pages that docs/LAUNCH.md removes from the launch site.
  const unapprovedMarketingPages = [
    "/about",
    "/blog",
    "/blog/some-post",
    "/broker-model",
    "/case-studies",
    "/case-studies/some-study",
    "/faq",
    "/partners/brokers-consultants",
    "/partners/pe-vc",
    "/partners/software-vendors",
    "/platform",
    "/resources",
    "/resources/hris-landscape-report",
    "/resources/partner-finder",
    "/resources/requirements-builder",
    "/services",
    "/transparency",
  ] as const;

  test.each(unapprovedMarketingPages)("blocks the unapproved marketing page %s", (path) => {
    expect(launchAreaForPath(path)).toBe("unapproved-marketing");
    expect(isPathInLaunch(path, "A")).toBe(false);
    expect(isPathInLaunch(path, "B")).toBe(false);
  });

  test.each(["/partners", "/blog/some-post/comments", "/resources/partner-finder/extra"])(
    "blocks the nested or parent marketing path %s",
    (path) => {
      expect(isPathInLaunch(path, "A")).toBe(false);
      expect(isPathInLaunch(path, "B")).toBe(false);
    },
  );

  test.each(["/", "/contact", "/privacy", "/terms", "/sign-up", "/sign-in"])(
    "keeps the launch page %s",
    (path) => {
      expect(launchAreaForPath(path)).toBe("core");
      expect(isPathInLaunch(path, "A")).toBe(true);
      expect(isPathInLaunch(path, "B")).toBe(true);
    },
  );

  test.each(["/platformx", "/blogging", "/aboutus", "/faqs", "/partnership", "/resources-hub", "/servicesx", "/contact/about"])(
    "does not block the look-alike path %s",
    (path) => {
      expect(launchAreaForPath(path)).toBe("core");
      expect(isPathInLaunch(path, "A")).toBe(true);
    },
  );

  test("hides tRPC procedures by router, including inside a batch", () => {
    expect(hiddenTrpcProcedures("/api/trpc/intakes.saveDraft", "A")).toEqual([]);
    expect(hiddenTrpcProcedures("/api/trpc/intakes.read,managedFinance.list", "A")).toEqual(["managedFinance.list"]);
    expect(hiddenTrpcProcedures("/api/trpc/demos.page", "A")).toEqual(["demos.page"]);
    expect(hiddenTrpcProcedures("/api/trpc/demos.page", "B")).toEqual([]);
    expect(hiddenTrpcProcedures("/api/trpc/documents.list", "B")).toEqual(["documents.list"]);
    expect(hiddenTrpcProcedures("/api/trpc/%E0%A4%A", "A")).toEqual(["/api/trpc/%E0%A4%A"]);
    expect(hiddenTrpcProcedures("/admin", "A")).toEqual([]);
  });

  test("combines page areas and tRPC procedures", () => {
    expect(isPathInLaunch("/customer", "A")).toBe(true);
    expect(isPathInLaunch("/admin/finance", "B")).toBe(false);
    expect(isPathInLaunch("/customer/demos", "A")).toBe(false);
    expect(isPathInLaunch("/customer/demos", "B")).toBe(true);
    expect(isPathInLaunch("/api/trpc/financeDocuments.list", "B")).toBe(false);
  });
});
