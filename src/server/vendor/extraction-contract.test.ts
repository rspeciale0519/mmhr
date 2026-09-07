import { describe, expect, test } from "vitest";
import { validateVendorExtraction, vendorExtractionRequestSchema } from "./extraction-contract";

const output = { vendorName: "Acme", productName: "HR", sourceReference: "source:one", claims: [{ field: "pricing", value: "$10", confidence: 0.6 }, { field: "geography", value: "US", confidence: 0.95 }] };

describe("vendor extraction contract", () => {
  test("requires versioned source-bound input", () => {
    expect(vendorExtractionRequestSchema.safeParse({ organizationId: "00000000-0000-4000-8000-000000000001", sourceId: "00000000-0000-4000-8000-000000000002", sourceReferences: ["source:one"], content: "content", schemaVersion: "vendor-v1", templateVersion: "extract-v1", maxCostCents: 10 }).success).toBe(true);
  });
  test("routes low confidence and material changes to review", () => {
    const result = validateVendorExtraction(output, [{ field: "geography", value: "EU" }]);
    expect(result.accepted).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["low_confidence", "material_change"]);
  });
});
