import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { prepareWorkspaceDocumentUpload } from "./document-upload-preparation";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const input = { organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(), expectedVersion: 0,
  fileName: "synthetic.pdf", declaredMimeType: "application/pdf", byteSize: 12, sha256: "a".repeat(64),
  correlationId: randomUUID(), idempotencyKey: randomUUID() };
const result = { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId, version: 1,
  state: "received", revision: 1, correlationId: input.correlationId, outcomeCode: "recorded" };
const rpc = vi.fn(), supabase = { rpc } as never;
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, scope, options) =>
    ({ scope, correlationId: options!.correlationId!, identityId: randomUUID(), assurance: "aal1", supabase }));
});
test("records an untrusted manifest with no scan, approval, path, or bytes assertion", async () => {
  await expect(prepareWorkspaceDocumentUpload(input)).resolves.toEqual(result);
  const { correlationId, idempotencyKey, declaredMimeType, ...manifest } = input;
  expect(rpc).toHaveBeenCalledWith("mmhr_reserve_workspace_document", { payload: { ...manifest, contentType: declaredMimeType },
    correlation_id: correlationId, idempotency_key: idempotencyKey });
  expect(requirePermission).toHaveBeenCalledWith("workspace.access", { kind: "organization", organizationId: input.organizationId }, { correlationId });
});
test.each([{ actorIdentityId: randomUUID() }, { storageReference: "quarantine://forged" }, { scanState: "clean" }, { approved: true },
  { byteSize: 25_000_001 }, { fileName: "../synthetic.pdf" }])("rejects manifest injection before authorization or RPC", async (change) => {
  await expect(prepareWorkspaceDocumentUpload({ ...input, ...change })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
test("does not record when current authority fails", async () => {
  vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError());
  await expect(prepareWorkspaceDocumentUpload(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test.each([{ organizationId: randomUUID() }, { documentId: randomUUID() }, { versionId: randomUUID() }, { version: 2 },
  { state: "approved" }, { revision: 2 }, { correlationId: randomUUID() }, { privateObjectPath: "private" }])(
  "rejects forged reservation associations and output authority", async (change) => {
    rpc.mockResolvedValue({ data: { ...result, ...change }, error: null });
    await expect(prepareWorkspaceDocumentUpload(input)).rejects.toThrow("Invalid document preparation result");
  });
test("preserves replay and conceals provider errors without automatic retries", async () => {
  rpc.mockResolvedValueOnce({ data: { ...result, outcomeCode: "replayed" }, error: null });
  await expect(prepareWorkspaceDocumentUpload(input)).resolves.toMatchObject({ outcomeCode: "replayed" });
  rpc.mockResolvedValueOnce({ error: { code: "42501", message: "private" } });
  await expect(prepareWorkspaceDocumentUpload(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "private" } });
  await expect(prepareWorkspaceDocumentUpload(input)).rejects.toThrow("Document preparation failed");
  expect(rpc).toHaveBeenCalledTimes(3);
});
