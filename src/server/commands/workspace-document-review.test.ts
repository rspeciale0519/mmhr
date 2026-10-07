import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getWorkspaceDocumentReview, issueWorkspaceDocumentAccess, recordWorkspaceDocumentReview, resolveWorkspaceDocumentAccess } from "./workspace-document-review";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), correlationId = randomUUID(), identityId = randomUUID();
const accessId = randomUUID(), accessToken = "a".repeat(64), scope = { organizationId, documentId, versionId, correlationId }, rpc = vi.fn();
const input = { ...scope, idempotencyKey: randomUUID(), expectedRevision: 4, action: "begin_review" as const,
  reason: "Synthetic manual review", reviewReference: "synthetic:review" };
const result = { ...scope, revision: 5, action: "begin_review", state: "needs_review", outcomeCode: "recorded" };
const access = { ...scope, expectedRevision: 5, idempotencyKey: randomUUID(), purpose: "review" as const };
const issuedAt = new Date().toISOString(), expiresAt = new Date(Date.parse(issuedAt)+60_000).toISOString();
const granted = { ...scope, accessId, accessToken, revision: 5, purpose: "review", issuedAt, expiresAt, outcomeCode: "recorded" };
const resolve = { organizationId, accessId, accessToken, correlationId };
const manifest = { ...scope, accessId, revision: 5, purpose: "review", expiresAt,
  fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: 128, sha256: "b".repeat(64) };
const document = { documentId, versionId, version: 1, isCurrent: true, fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: 128,
  state: "ready", revision: 4, failureCode: null, createdAt: issuedAt, updatedAt: issuedAt };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, requestedScope, options) =>
    ({ scope: requestedScope, identityId, correlationId: options!.correlationId!, assurance: "aal2", supabase: { rpc } as never }));
});
test("uses current workspace, assigned staff approval, and platform authority before review", async () => {
  await expect(recordWorkspaceDocumentReview(input)).resolves.toEqual(result);
  expect(vi.mocked(requirePermission).mock.calls.map(([permission]) => permission)).toEqual(["workspace.access", "rfp.approve", "admin.access"]);
  const { correlationId: correlation, idempotencyKey, ...payload } = input;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_workspace_document_review", { payload, correlation_id: correlation, idempotency_key: idempotencyKey });
});
test.each(["actorIdentityId", "scanEvidence", "approvedAt", "storageReference"])("rejects caller-injected %s", async field => {
  await expect(recordWorkspaceDocumentReview({ ...input, [field]: "private" })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled();
});
test.each([{ expectedRevision: 0 }, { expectedRevision: 2_147_483_647 }, { reason: " " }, { reason: "one\ntwo" },
  { reason: "é".repeat(1001) }, { reviewReference: "has a space" }, { reviewedAccessId: accessId }, { contentsReviewed: true }])(
  "rejects invalid, oversized, and inconsistent review inputs", async change => {
    await expect(recordWorkspaceDocumentReview({ ...input, ...change })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
test.each([{ contentsReviewed: false }, { reviewedAccessId: undefined }, { reviewedAccessId: "bad" }])(
  "requires an explicit decision with its requested file access", async change => {
    await expect(recordWorkspaceDocumentReview({ ...input, action: "approve", reviewedAccessId: accessId, contentsReviewed: true, ...change })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
test.each(["actor", "scope", "correlation", "assurance"])("denies altered approval authorization %s", async change => {
  vi.mocked(requirePermission).mockImplementation(async (permission, requestedScope, options) => ({ scope: permission === "rfp.approve" && change === "scope"
    ? { kind: "organization", organizationId: randomUUID() } : requestedScope,
  identityId: permission === "rfp.approve" && change === "actor" ? randomUUID() : identityId,
  correlationId: permission === "rfp.approve" && change === "correlation" ? randomUUID() : options!.correlationId!,
  assurance: permission === "rfp.approve" && change === "assurance" ? "aal1" : "aal2", supabase: { rpc } as never }));
  await expect(recordWorkspaceDocumentReview(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test.each([{ organizationId: randomUUID() }, { documentId: randomUUID() }, { versionId: randomUUID() }, { correlationId: randomUUID() },
  { action: "approve" }, { state: "approved" }, { revision: 6 }, { actorIdentityId: identityId }])("rejects altered review receipts", async change => {
  rpc.mockResolvedValue({ data: { ...result, ...change }, error: null }); await expect(recordWorkspaceDocumentReview(input)).rejects.toThrow();
});
test.each(["approve", "reject"] as const)("binds the terminal %s receipt and its unchanged retry", async action => {
  const decision = { ...input, expectedRevision: 5, action, reviewedAccessId: accessId, contentsReviewed: true };
  for (const outcomeCode of ["recorded", "replayed"]) {
    rpc.mockResolvedValue({ data: { ...result, action, state: action === "approve" ? "approved" : "rejected", revision: 6, outcomeCode }, error: null });
    await expect(recordWorkspaceDocumentReview(decision)).resolves.toMatchObject({ action, revision: 6, outcomeCode });
  }
});
test("binds safe review metadata and denies actionable earlier versions", async () => {
  rpc.mockResolvedValue({ data: { organizationId, correlationId, document, canReview: true }, error: null });
  await expect(getWorkspaceDocumentReview(scope)).resolves.toMatchObject({ canReview: true });
  rpc.mockResolvedValue({ data: { organizationId, correlationId, document: { ...document, isCurrent: false }, canReview: true }, error: null });
  await expect(getWorkspaceDocumentReview(scope)).rejects.toThrow();
});
test.each([{ purpose: "approved" }, { revision: 4 }, { versionId: randomUUID() }, { correlationId: randomUUID() },
  { expiresAt: new Date(Date.parse(issuedAt)+61_000).toISOString() }, { accessToken: "bad" }])("rejects changed or overlong file grants", async change => {
  rpc.mockResolvedValue({ data: { ...granted, ...change }, error: null }); await expect(issueWorkspaceDocumentAccess(access)).rejects.toThrow();
});
test("checks extra staff authority only for a review access grant", async () => {
  rpc.mockResolvedValue({ data: granted, error: null }); await issueWorkspaceDocumentAccess(access);
  expect(requirePermission).toHaveBeenCalledTimes(3);
  vi.mocked(requirePermission).mockClear(); rpc.mockResolvedValue({ data: { ...granted, purpose: "approved" }, error: null });
  await issueWorkspaceDocumentAccess({ ...access, purpose: "approved" }); expect(requirePermission).toHaveBeenCalledTimes(1);
});
test.each([{ accessId: randomUUID() }, { organizationId: randomUUID() }, { correlationId: randomUUID() }, { storageReference: "private" },
  { fileName: "../private.pdf" }])("rejects altered or private resolved manifests", async change => {
  rpc.mockResolvedValue({ data: { ...manifest, ...change }, error: null }); await expect(resolveWorkspaceDocumentAccess(resolve)).rejects.toThrow();
});
test("sanitizes provider errors and preserves authority denial", async () => {
  rpc.mockResolvedValue({ error: { code: "XX000", message: "private provider detail" } });
  await expect(recordWorkspaceDocumentReview(input)).rejects.toThrow("Document request failed");
  rpc.mockResolvedValue({ error: { code: "42501", message: "private provider detail" } });
  await expect(recordWorkspaceDocumentReview(input)).rejects.toBeInstanceOf(AuthorizationError);
});
