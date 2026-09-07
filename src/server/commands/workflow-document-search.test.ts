import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { workflowDocumentSearchContentSchema, workflowDocumentSearchSchema } from "./workflow-document-search";

const base = { organizationId: randomUUID(), actorIdentityId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
describe("workflow document search commands", () => {
  test("accepts approved extracted content and bounded metadata", () => expect(workflowDocumentSearchContentSchema.parse({ ...base, documentId: randomUUID(), versionId: randomUUID(), metadata: { vendor: "Acme" }, approvedExtractedContent: "supports SSO" }).metadata).toMatchObject({ vendor: "Acme" }));
  test("accepts scoped search filters", () => expect(workflowDocumentSearchSchema.parse({ ...base, query: "sso", documentType: "proposal", limit: 20 }).limit).toBe(20));
  test("rejects an empty query or oversized limit", () => expect(workflowDocumentSearchSchema.safeParse({ ...base, query: "", documentType: null, limit: 101 }).success).toBe(false));
});
