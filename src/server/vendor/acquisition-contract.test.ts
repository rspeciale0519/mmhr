import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { selectVendorAcquisitionAdapter, vendorAcquisitionRequestSchema } from "./acquisition-contract";
describe("vendor acquisition contract", () => {
  test("requires an adapter only for automated runs", () => { const sourceId = randomUUID(); expect(vendorAcquisitionRequestSchema.parse({ sourceId, mode: "manual", adapterId: null }).mode).toBe("manual"); expect(vendorAcquisitionRequestSchema.safeParse({ sourceId, mode: "automated", adapterId: null }).success).toBe(false); });
  test("selects one provider-neutral adapter", () => { const sourceId = randomUUID(); const adapter = { adapterId: "web", acquire: async () => ({ artifactReferences: [] }) }; expect(selectVendorAcquisitionAdapter([adapter], { sourceId, mode: "automated", adapterId: "web" })).toBe(adapter); });
});
