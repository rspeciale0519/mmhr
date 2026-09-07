import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { vendorAcquisitionCommandSchema } from "./vendor-acquisition";
const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), runId: randomUUID(), sourceId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("vendor acquisition command", () => {
  test("accepts manual and automated creation", () => {
    const manual = vendorAcquisitionCommandSchema.parse({ ...base, action: "create", mode: "manual", adapterId: null });
    const automated = vendorAcquisitionCommandSchema.parse({ ...base, action: "create", mode: "automated", adapterId: "web" });
    expect(manual.action).toBe("create");
    if (manual.action === "create") expect(manual.mode).toBe("manual");
    if (automated.action === "create") expect(automated.adapterId).toBe("web");
  });
  test("accepts bounded completion artifacts", () => expect(vendorAcquisitionCommandSchema.parse({ ...base, action: "complete", expectedRevision: 1, artifactReferences: ["artifact:one"] }).action).toBe("complete"));
  test("rejects invalid adapter mode", () => expect(vendorAcquisitionCommandSchema.safeParse({ ...base, action: "create", mode: "manual", adapterId: "web" }).success).toBe(false));
});
