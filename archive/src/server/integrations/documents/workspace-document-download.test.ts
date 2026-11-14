import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { resolveWorkspaceDocumentAccess } from "@/server/commands/workspace-document-review";
import { downloadWorkspaceDocument } from "./workspace-document-download";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
vi.mock("@/server/commands/workspace-document-review", () => ({ resolveWorkspaceDocumentAccess: vi.fn() }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), accessId = randomUUID(), correlationId = randomUUID();
const input = { organizationId, accessId, accessToken: "a".repeat(64), correlationId }, download = vi.fn(), from = vi.fn();
const bytes = new Uint8Array(Buffer.from("%PDF-1.7\nSynthetic bounded file\n%%EOF"));
const manifest = { organizationId, documentId, versionId, accessId, correlationId, purpose: "review" as const, revision: 5,
  fileName: "synthetic.pdf", contentType: "application/pdf" as const, byteSize: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"), expiresAt: new Date(Date.now()+60_000).toISOString() };
beforeEach(() => {
  from.mockReset().mockReturnValue({ download }); download.mockReset().mockResolvedValue({ data: new Blob([bytes]), error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ identityId: randomUUID(), scope, correlationId: options!.correlationId!, assurance: "aal2", supabase: { storage: { from } } as never }));
  vi.mocked(resolveWorkspaceDocumentAccess).mockReset().mockResolvedValue(manifest);
});
test("reads only the exact scoped private object and rechecks authorization after checking its bytes", async () => {
  await expect(downloadWorkspaceDocument(input)).resolves.toMatchObject({ manifest, bytes });
  expect(from).toHaveBeenCalledWith("mmhr-document-quarantine");
  expect(download).toHaveBeenCalledWith(`${organizationId}/${documentId}/${versionId}`);
  expect(resolveWorkspaceDocumentAccess).toHaveBeenCalledTimes(2);
  expect(vi.mocked(resolveWorkspaceDocumentAccess).mock.invocationCallOrder[1]).toBeGreaterThan(download.mock.invocationCallOrder[0]);
});
test("stops before Storage when authority or the capability fails", async () => {
  vi.mocked(requirePermission).mockRejectedValueOnce(new AuthorizationError());
  await expect(downloadWorkspaceDocument(input)).rejects.toBeInstanceOf(AuthorizationError); expect(download).not.toHaveBeenCalled();
  vi.mocked(resolveWorkspaceDocumentAccess).mockRejectedValueOnce(new AuthorizationError());
  await expect(downloadWorkspaceDocument(input)).rejects.toBeInstanceOf(AuthorizationError); expect(download).not.toHaveBeenCalled();
});
test.each(["provider_error", "transport", "missing", "size", "hash", "format"])("rejects %s without returning unverified bytes", async failure => {
  if (failure === "transport") download.mockRejectedValue(new Error("private provider detail"));
  else if (failure === "provider_error") download.mockResolvedValue({ data: null, error: { message: "private provider detail" } });
  else if (failure === "missing") download.mockResolvedValue({ data: null, error: null });
  else {
    const changed = failure === "size" ? new Uint8Array(1) : new Uint8Array(bytes);
    if (failure !== "size") changed[0] ^= 1;
    download.mockResolvedValue({ data: new Blob([changed]), error: null });
    if (failure === "format") vi.mocked(resolveWorkspaceDocumentAccess).mockResolvedValue({ ...manifest,
      sha256: createHash("sha256").update(changed).digest("hex") });
  }
  await expect(downloadWorkspaceDocument(input)).rejects.toThrow("Document request failed");
  expect(resolveWorkspaceDocumentAccess).toHaveBeenCalledTimes(1);
});
test("denies revoked or changed grants after a successful Storage read", async () => {
  vi.mocked(resolveWorkspaceDocumentAccess).mockResolvedValueOnce(manifest).mockRejectedValueOnce(new AuthorizationError());
  await expect(downloadWorkspaceDocument(input)).rejects.toBeInstanceOf(AuthorizationError);
  vi.mocked(resolveWorkspaceDocumentAccess).mockResolvedValueOnce(manifest).mockResolvedValueOnce({ ...manifest, revision: 6 });
  await expect(downloadWorkspaceDocument(input)).rejects.toThrow("Document request failed");
});
