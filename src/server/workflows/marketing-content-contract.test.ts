import { describe, expect, test } from "vitest";
import { approveMarketingContent, canPublishMarketingContent, parseMarketingContent } from "./marketing-content-contract";

const base = { contentId: "00000000-0000-4000-8000-000000000001", slug: "case-study", body: "Approved body", sourceReference: "evidence://case-study-2026-09", sourceCapturedAt: "2026-09-03T11:00:00.000Z", status: "draft" as const, approvedBy: null, approvedAt: null };

describe("marketing content contract", () => {
  test("requires approval metadata before publication", () => expect(() => parseMarketingContent({ ...base, status: "published" })).toThrow("Published content requires approval"));
  test.each([
    ["source reference", { sourceReference: "" }],
    ["source capture time", { sourceCapturedAt: undefined }],
  ])("rejects missing %s", (_name, override) => {
    expect(() => parseMarketingContent({ ...base, ...override })).toThrow();
  });
  test("approves content through a distinct reviewer", () => {
    const approved = approveMarketingContent(base, "00000000-0000-4000-8000-000000000002", "2026-09-03T12:00:00.000Z");
    expect(canPublishMarketingContent(approved)).toBe(true);
  });
});
