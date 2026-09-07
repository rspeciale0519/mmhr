import { describe, expect, test } from "vitest";
import { vendorEvidenceSchema } from "@/server/ai/ai-service";
import { validateVendorExtraction } from "@/server/vendor/extraction-contract";

describe("vendor extraction command", () => {
  test("uses the versioned structured vendor schema", () => {
    const parsed = vendorEvidenceSchema.safeParse({ vendorName: "Acme", productName: "HR", sourceReference: "source:one", claims: [{ field: "pricing", value: "$10", confidence: 0.9 }] });
    expect(parsed.success).toBe(true);
  });
  test("keeps material changes out of automatic acceptance", () => {
    expect(validateVendorExtraction({ vendorName: "Acme", productName: "HR", sourceReference: "source:one", claims: [{ field: "pricing", value: "$20", confidence: 0.9 }] }, [{ field: "pricing", value: "$10" }]).accepted).toBe(false);
  });
});
