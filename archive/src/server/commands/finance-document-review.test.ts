import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { FinanceDocumentAccessExpiredError } from "./finance-document-errors";
import { getFinanceDocumentReview, issueFinanceDocumentAccess, recordFinanceDocumentReview, resolveFinanceDocumentAccess } from "./finance-document-review";

vi.mock("@/server/auth/authorization", () => ({ AuthorizationError: class extends Error {}, requirePermission: vi.fn() }));
const organizationId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), correlationId = randomUUID(), identityId = randomUUID();
const accessId = randomUUID(), accessToken = "a".repeat(64), scope = { organizationId, documentId, versionId, correlationId }, rpc = vi.fn();
const input = { ...scope, idempotencyKey: randomUUID(), expectedRevision: 4, action: "begin_review" as const,
  reason: "Synthetic manual review", reviewReference: "synthetic:review" };
const result = { ...scope, revision: 5, action: "begin_review", state: "needs_review", outcomeCode: "recorded" };
const access = { ...scope, expectedRevision: 5, idempotencyKey: randomUUID(), purpose: "finance_review" as const };
const issuedAt = new Date().toISOString(), expiresAt = new Date(Date.parse(issuedAt)+60_000).toISOString();
const granted = { ...scope, accessId, accessToken, revision: 5, purpose: "finance_review", issuedAt, expiresAt, outcomeCode: "recorded" };
const resolve = { organizationId, accessId, accessToken, correlationId };
const manifest = { ...scope, accessId, revision: 5, purpose: "finance_review", expiresAt,
  fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: 128, sha256: "b".repeat(64) };
const document = { documentId, versionId, version: 1, isCurrent: true, fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: 128,
  state: "ready", revision: 4, failureCode: null, createdAt: issuedAt, updatedAt: issuedAt };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: result, error: null });
  vi.mocked(requirePermission).mockReset().mockImplementation(async (_permission, requestedScope, options) =>
    ({ scope: requestedScope, identityId, correlationId: options!.correlationId!, assurance: "aal2", supabase: { rpc } as never }));
});
test("uses current workspace, assigned staff approval, and platform authority before review", async () => {
  await expect(recordFinanceDocumentReview(input)).resolves.toEqual(result);
  expect(vi.mocked(requirePermission).mock.calls.map(([permission]) => permission)).toEqual(["workspace.access", "finance.manage", "admin.access"]);
  const { correlationId: correlation, idempotencyKey, ...payload } = input;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_finance_document_review", { payload, correlation_id: correlation, idempotency_key: idempotencyKey });
});
test("classifies only the exact authorized access retry expiry as expired", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Document access retry expired" } });
  await expect(issueFinanceDocumentAccess(access)).rejects.toBeInstanceOf(FinanceDocumentAccessExpiredError);
  expect(vi.mocked(requirePermission).mock.calls.map(([permission]) => permission)).toEqual(["workspace.access", "finance.manage", "admin.access"]);
});
test.each([{ code: "42501", message: "Document access denied" }, { code: "42501", message: "Document access retry expired extra" },
  { code: "P0001", message: "Document access retry expired" }])("does not classify other access failures as expiry %j", async error => {
  rpc.mockResolvedValue({ data: null, error });
  await expect(issueFinanceDocumentAccess(access)).rejects.not.toBeInstanceOf(FinanceDocumentAccessExpiredError);
});
test("does not classify the expiry spelling from a different RPC as expired", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Document access retry expired" } });
  await expect(recordFinanceDocumentReview(input)).rejects.toBeInstanceOf(AuthorizationError);
  await expect(recordFinanceDocumentReview(input)).rejects.not.toBeInstanceOf(FinanceDocumentAccessExpiredError);
});
test.each(["actorIdentityId", "scanEvidence", "approvedAt", "storageReference"])("rejects caller-injected %s", async field => {
  await expect(recordFinanceDocumentReview({ ...input, [field]: "private" })).rejects.toThrow();
  expect(requirePermission).not.toHaveBeenCalled();
});
test.each([{ expectedRevision: 0 }, { expectedRevision: 2_147_483_647 }, { reason: " " }, { reason: "one\ntwo" },
  { reason: "é".repeat(1001) }, { reviewReference: "has a space" }, { reviewedAccessId: accessId }, { contentsReviewed: true }])(
  "rejects invalid, oversized, and inconsistent review inputs", async change => {
    await expect(recordFinanceDocumentReview({ ...input, ...change })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
test.each([{ contentsReviewed: false }, { reviewedAccessId: undefined }, { reviewedAccessId: "bad" }])(
  "requires an explicit decision with its requested file access", async change => {
    await expect(recordFinanceDocumentReview({ ...input, action: "approve", reviewedAccessId: accessId, contentsReviewed: true, ...change })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
test.each(["actor", "scope", "correlation", "assurance"])("denies altered approval authorization %s", async change => {
  vi.mocked(requirePermission).mockImplementation(async (permission, requestedScope, options) => ({ scope: permission === "finance.manage" && change === "scope"
    ? { kind: "organization", organizationId: randomUUID() } : requestedScope,
  identityId: permission === "finance.manage" && change === "actor" ? randomUUID() : identityId,
  correlationId: permission === "finance.manage" && change === "correlation" ? randomUUID() : options!.correlationId!,
  assurance: permission === "finance.manage" && change === "assurance" ? "aal1" : "aal2", supabase: { rpc } as never }));
  await expect(recordFinanceDocumentReview(input)).rejects.toBeInstanceOf(AuthorizationError); expect(rpc).not.toHaveBeenCalled();
});
test.each([{ organizationId: randomUUID() }, { documentId: randomUUID() }, { versionId: randomUUID() }, { correlationId: randomUUID() },
  { action: "approve" }, { state: "approved" }, { revision: 6 }, { actorIdentityId: identityId }])("rejects altered review receipts", async change => {
  rpc.mockResolvedValue({ data: { ...result, ...change }, error: null }); await expect(recordFinanceDocumentReview(input)).rejects.toThrow();
});
test.each(["approve", "reject"] as const)("binds the terminal %s receipt and its unchanged retry", async action => {
  const decision = { ...input, expectedRevision: 5, action, reviewedAccessId: accessId, contentsReviewed: true };
  for (const outcomeCode of ["recorded", "replayed"]) {
    rpc.mockResolvedValue({ data: { ...result, action, state: action === "approve" ? "approved" : "rejected", revision: 6, outcomeCode }, error: null });
    await expect(recordFinanceDocumentReview(decision)).resolves.toMatchObject({ action, revision: 6, outcomeCode });
  }
});
test("binds safe review metadata and denies actionable earlier versions", async () => {
  rpc.mockResolvedValue({ data: { organizationId, correlationId, document, canReview: true }, error: null });
  await expect(getFinanceDocumentReview(scope)).resolves.toMatchObject({ canReview: true });
  rpc.mockResolvedValue({ data: { organizationId, correlationId, document: { ...document, isCurrent: false }, canReview: true }, error: null });
  await expect(getFinanceDocumentReview(scope)).rejects.toThrow();
});
test.each([{ purpose: "finance_original" }, { revision: 4 }, { versionId: randomUUID() }, { correlationId: randomUUID() },
  { expiresAt: new Date(Date.parse(issuedAt)+61_000).toISOString() }, { accessToken: "bad" }])("rejects changed or overlong file grants", async change => {
  rpc.mockResolvedValue({ data: { ...granted, ...change }, error: null }); await expect(issueFinanceDocumentAccess(access)).rejects.toThrow();
});
test("checks full finance staff authority for both private access purposes", async () => {
  rpc.mockResolvedValue({ data: granted, error: null }); await issueFinanceDocumentAccess(access);
  expect(requirePermission).toHaveBeenCalledTimes(3);
  vi.mocked(requirePermission).mockClear(); rpc.mockResolvedValue({ data: { ...granted, purpose: "finance_original" }, error: null });
  await issueFinanceDocumentAccess({ ...access, purpose: "finance_original" }); expect(requirePermission).toHaveBeenCalledTimes(3);
});
test.each([{ accessId: randomUUID() }, { organizationId: randomUUID() }, { correlationId: randomUUID() }, { storageReference: "private" },
  { fileName: "../private.pdf" }])("rejects altered or private resolved manifests", async change => {
  rpc.mockResolvedValue({ data: { ...manifest, ...change }, error: null }); await expect(resolveFinanceDocumentAccess(resolve)).rejects.toThrow();
});
test("sanitizes provider errors and preserves authority denial", async () => {
  rpc.mockResolvedValue({ error: { code: "XX000", message: "private provider detail" } });
  await expect(recordFinanceDocumentReview(input)).rejects.toThrow("Document request failed");
  rpc.mockResolvedValue({ error: { code: "42501", message: "private provider detail" } });
  await expect(recordFinanceDocumentReview(input)).rejects.toBeInstanceOf(AuthorizationError);
});
