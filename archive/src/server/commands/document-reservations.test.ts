import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { completeWorkspaceDocumentUpload, reserveWorkspaceDocument } from "./document-reservations";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const input = { organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(), expectedVersion: 0,
  fileName: "synthetic.pdf", declaredMimeType: "application/pdf", correlationId: randomUUID(), idempotencyKey: randomUUID() };
const bytes = Buffer.from("%PDF-1.7\nsynthetic test bytes");
const result = { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId,
  version: 1, state: "received", revision: 1, correlationId: input.correlationId, outcomeCode: "recorded" };
const rpc = vi.fn(); const supabase = { rpc } as never;
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ scope, correlationId: options!.correlationId!, identityId: randomUUID(), assurance: "aal1", supabase }));
});

test("uses verified scoped identity and derives metadata from actual bytes", async () => {
  await expect(reserveWorkspaceDocument(input, bytes)).resolves.toEqual(result);
  expect(requirePermission).toHaveBeenCalledWith("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { correlationId: input.correlationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_reserve_workspace_document", { payload: {
    organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId, expectedVersion: 0,
    fileName: input.fileName, contentType: input.declaredMimeType, byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }, correlation_id: input.correlationId, idempotency_key: input.idempotencyKey });
});
test.each(["actorIdentityId", "sha256", "byteSize", "storageReference", "state"])("rejects client-supplied %s", async (field) => {
  await expect(reserveWorkspaceDocument({ ...input, [field]: "forged" }, bytes)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
test.each([Buffer.alloc(0), Buffer.from("not a PDF"), Buffer.alloc(25_000_001)])("rejects invalid or oversized bytes", async (value) => {
  await expect(reserveWorkspaceDocument(input, value)).rejects.toThrow("Document validation failed");
  expect(rpc).not.toHaveBeenCalled();
});
test("checks authority before examining or recording contents", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
  await expect(reserveWorkspaceDocument(input, bytes)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([{ organizationId: randomUUID() }, { documentId: randomUUID() }, { versionId: randomUUID() },
  { version: 2 }, { revision: 2 }, { state: "approved" }, { correlationId: randomUUID() }, { leaseToken: randomUUID() }])(
  "rejects changed result associations or hidden authority fields", async (change) => {
    rpc.mockResolvedValue({ data: { ...result, ...change }, error: null });
    await expect(reserveWorkspaceDocument(input, bytes)).rejects.toThrow("Invalid document reservation result");
  });
test("retains the original reservation result for a valid replay", async () => {
  rpc.mockResolvedValue({ data: { ...result, outcomeCode: "replayed" }, error: null });
  await expect(reserveWorkspaceDocument(input, bytes)).resolves.toMatchObject({ outcomeCode: "replayed", state: "received" });
});
test("hides database details and does not retry uncertain writes", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "42501", message: "private database details" } });
  await expect(reserveWorkspaceDocument(input, bytes)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "private database details" } });
  await expect(reserveWorkspaceDocument(input, bytes)).rejects.toThrow("Document reservation failed");
  expect(rpc).toHaveBeenCalledTimes(2);
});

const completion = { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId,
  expectedRevision: 1, correlationId: input.correlationId, idempotencyKey: randomUUID() };
const completed = { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId,
  state: "quarantined", revision: 2, correlationId: input.correlationId, outcomeCode: "recorded" };
test("queues completion through the scoped RPC without client scan evidence", async () => {
  rpc.mockResolvedValue({ data: completed, error: null });
  await expect(completeWorkspaceDocumentUpload(completion)).resolves.toEqual(completed);
  const { correlationId, idempotencyKey, ...payload } = completion;
  expect(rpc).toHaveBeenCalledWith("mmhr_complete_workspace_document_upload", {
    payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
});
test.each([{ expectedRevision: 2 }, { scanEvidence: {} }, { sha256: "a".repeat(64) }, { actorIdentityId: randomUUID() },
  { storageReference: "https://example.invalid" }])("rejects changed completion authority or revision", async (change) => {
  await expect(completeWorkspaceDocumentUpload({ ...completion, ...change })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});
test.each([{ organizationId: randomUUID() }, { documentId: randomUUID() }, { versionId: randomUUID() },
  { state: "ready" }, { revision: 3 }, { correlationId: randomUUID() }, { processingJobId: randomUUID() }])(
  "rejects mismatched completion results or private job fields", async (change) => {
    rpc.mockResolvedValue({ data: { ...completed, ...change }, error: null });
    await expect(completeWorkspaceDocumentUpload(completion)).rejects.toThrow("Invalid document upload completion result");
  });
test("hides completion failures and does not repeat an uncertain database write", async () => {
  rpc.mockResolvedValue({ error: { code: "XX000", message: "private database details" } });
  await expect(completeWorkspaceDocumentUpload(completion)).rejects.toThrow("Document upload completion failed"); expect(rpc).toHaveBeenCalledTimes(1);
});
