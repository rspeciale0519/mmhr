import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments, getWorkspaceDocumentVersions } from "./workspace-documents";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), correlationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID();
const input = { organizationId, correlationId }, rpc = vi.fn();
const row = { documentId, versionId, version: 1, isCurrent: true, fileName: "synthetic.pdf", contentType: "application/pdf",
  byteSize: 128, state: "received", revision: 1, failureCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const page = { ...input, canUpload: false, items: [row], nextCursor: null };
const versions = { ...input, documentId, canUpload: true, currentVersion: 1, items: [row], nextVersion: null };
const history = { ...input, documentId, versionId, items: [{ revision: 1, action: "reserve", occurredAt: new Date().toISOString() }], nextRevision: null };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: page, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ scope, correlationId: options!.correlationId!, identityId: randomUUID(), assurance: "aal1", supabase: { rpc } as never }));
});
test("reads only through the currently authorized request client", async () => {
  await expect(getWorkspaceDocuments(input)).resolves.toEqual(page);
  expect(requirePermission).toHaveBeenCalledWith("workspace.access", { kind: "organization", organizationId }, { correlationId });
  expect(rpc).toHaveBeenCalledWith("mmhr_get_workspace_documents", { payload: { organizationId }, correlation_id: correlationId });
});
test("normalizes and forwards a bounded private file-name filter", async () => {
  await getWorkspaceDocuments({ ...input, searchQuery: "  Synthetic  " });
  expect(rpc).toHaveBeenCalledWith("mmhr_get_workspace_documents", { payload: { organizationId, searchQuery: "Synthetic" }, correlation_id: correlationId });
});
test.each(["", " ", "x".repeat(121), "one\ntwo", "a\u0000b", "a\u007fb", null, 1])("rejects an invalid metadata search term", async (searchQuery) => {
  await expect(getWorkspaceDocuments({ ...input, searchQuery })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});
test.each([{ actorIdentityId: randomUUID() }, { storageReference: "private" }, { canUpload: true }, { afterId: null }, { afterId: "bad" }])(
  "rejects forged read authority and invalid cursors", async (change) => {
    await expect(getWorkspaceDocuments({ ...input, ...change })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  });
test("denies before reading data when authorization fails", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
  await expect(getWorkspaceDocuments(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test.each(["storageReference", "sha256", "leaseToken", "scanEvidence", "approvedExtractedContent", "uploadedByIdentityId"])(
  "rejects unexpected private row field %s", async (field) => {
    rpc.mockResolvedValue({ data: { ...page, items: [{ ...row, [field]: "private" }] }, error: null });
    await expect(getWorkspaceDocuments(input)).rejects.toThrow();
  });
test.each([{ organizationId: randomUUID() }, { correlationId: randomUUID() }, { nextCursor: randomUUID() },
  { items: [{ ...row, isCurrent: false }] }, { items: [row, row] }, { items: [{ ...row, failureCode: "unsafe_document" }] },
  { items: [{ ...row, updatedAt: "2020-01-01T00:00:00Z" }] }])("rejects mismatched, invalid, and unordered pages", async (change) => {
  rpc.mockResolvedValue({ data: { ...page, ...change }, error: null }); await expect(getWorkspaceDocuments(input)).rejects.toThrow();
});
test("accepts a complete bounded page with an exact continuation cursor", async () => {
  const items = Array.from({ length: 25 }, (_, index) => ({ ...row, documentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));
  rpc.mockResolvedValue({ data: { ...page, items, nextCursor: items.at(-1)!.documentId }, error: null });
  await expect(getWorkspaceDocuments(input)).resolves.toMatchObject({ nextCursor: items.at(-1)!.documentId });
  await expect(getWorkspaceDocuments({ ...input, afterId: items[0]!.documentId })).rejects.toThrow("Invalid document page");
});
test("reads managed versions without file access and binds the requested document", async () => {
  rpc.mockResolvedValue({ data: versions, error: null }); await expect(getWorkspaceDocumentVersions({ ...input, documentId })).resolves.toEqual(versions);
  expect(rpc).toHaveBeenCalledWith("mmhr_get_workspace_document_versions", { payload: { organizationId, documentId, afterVersion: 0 }, correlation_id: correlationId });
});
test.each([{ documentId: randomUUID() }, { items: [{ ...row, documentId: randomUUID() }] }, { currentVersion: 2 },
  { items: [row, row] }, { nextVersion: 1 }, { items: [{ ...row, version: 2 }] }])("rejects mismatched version pages", async (change) => {
  rpc.mockResolvedValue({ data: { ...versions, ...change }, error: null });
  await expect(getWorkspaceDocumentVersions({ ...input, documentId })).rejects.toThrow();
});
test("reads only public history summaries", async () => {
  rpc.mockResolvedValue({ data: history, error: null });
  await expect(getWorkspaceDocumentHistory({ ...input, documentId, versionId })).resolves.toEqual(history);
  expect(rpc).toHaveBeenCalledWith("mmhr_get_workspace_document_history", { payload: { organizationId, documentId, versionId, afterRevision: 0 }, correlation_id: correlationId });
});
test.each([{ versionId: randomUUID() }, { documentId: randomUUID() }, { items: [{ ...history.items[0], snapshot: {} }] },
  { items: [{ ...history.items[0], revision: 2 }] }, { nextRevision: 1 }])("rejects mismatched or private history", async (change) => {
  rpc.mockResolvedValue({ data: { ...history, ...change }, error: null });
  await expect(getWorkspaceDocumentHistory({ ...input, documentId, versionId })).rejects.toThrow();
});
test.each(["versions", "history"])("rejects negative and excessive numeric cursors for %s", async (kind) => {
  for (const cursor of [-1, 0.5, "1", null, 2_147_483_647]) {
    const read = kind === "versions" ? getWorkspaceDocumentVersions({ ...input, documentId, afterVersion: cursor })
      : getWorkspaceDocumentHistory({ ...input, documentId, versionId, afterRevision: cursor });
    await expect(read).rejects.toThrow();
  }
  expect(rpc).not.toHaveBeenCalled();
});
test("hides provider errors without another request", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "42501", message: "private" } });
  await expect(getWorkspaceDocuments(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "private" } });
  await expect(getWorkspaceDocuments(input)).rejects.toThrow("Document request failed"); expect(rpc).toHaveBeenCalledTimes(2);
});
