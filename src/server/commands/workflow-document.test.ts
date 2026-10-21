import { describe, expect, test } from "vitest";
import { workflowDocumentSchema } from "./workflow-document";
import { randomUUID } from "node:crypto";
const base = { documentId: randomUUID(), organizationId: randomUUID(), actorIdentityId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("workflow document command schema", () => {
  test("accepts quarantined upload metadata", () => expect(workflowDocumentSchema.parse({ ...base, action: "upload", version: 1, documentType: "contract", sha256: "a".repeat(64), storageReference: "quarantine://object-1", contentType: "application/pdf", byteSize: 100 }).action).toBe("upload"));
  test("rejects non-quarantine storage and oversized files", () => { expect(workflowDocumentSchema.safeParse({ ...base, action: "upload", version: 1, documentType: "contract", sha256: "a".repeat(64), storageReference: "public://object", contentType: "application/pdf", byteSize: 100 }).success).toBe(false); expect(workflowDocumentSchema.safeParse({ ...base, action: "upload", version: 1, documentType: "contract", sha256: "a".repeat(64), storageReference: "quarantine://object", contentType: "application/pdf", byteSize: 26214401 }).success).toBe(false); });
  test("rejects storage references beyond the database limit", () => expect(workflowDocumentSchema.safeParse({ ...base, action: "upload", version: 1, documentType: "contract", sha256: "a".repeat(64), storageReference: `quarantine://a${"a".repeat(256)}`, contentType: "application/pdf", byteSize: 100 }).success).toBe(false));
  test("accepts scan and approval transitions", () => { expect(workflowDocumentSchema.parse({ ...base, action: "scan", versionId: randomUUID(), scanState: "clean" }).action).toBe("scan"); expect(workflowDocumentSchema.parse({ ...base, action: "approve", versionId: randomUUID() }).action).toBe("approve"); });
});
