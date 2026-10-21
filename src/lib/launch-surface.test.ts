import { describe, expect, test } from "vitest";

import {
  hiddenTrpcProcedures,
  isLaunchAreaEnabled,
  isPathInLaunch,
  launchAreaForPath,
  launchCandidate,
} from "./launch-surface";

describe("launch surface", () => {
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
