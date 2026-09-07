import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

describe("R5 vendor extraction evidence", () => {
  test("AI extraction uses the internal service and structured schema", () => {
    const source = readFileSync("src/server/commands/vendor-extraction.ts", "utf8");
    expect(source).toContain("extract_vendor_evidence");
    expect(source).toContain("vendorEvidenceSchema");
    expect(source).toContain("reviewRequired");
  });
});
