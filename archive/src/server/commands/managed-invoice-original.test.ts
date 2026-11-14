import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError } from "@/server/auth/authorization";
import { downloadManagedInvoiceOriginal, ManagedInvoiceOriginalAccessExpiredError } from "./managed-invoice-original";
const { authority, detail, issue, download } = vi.hoisted(() => ({ authority: vi.fn(), detail: vi.fn(), issue: vi.fn(), download: vi.fn() }));
vi.mock("./finance-document-upload", () => ({ requireFinanceDocumentAuthority: authority }));
vi.mock("./managed-invoice", () => ({ getManagedInvoiceDetail: detail }));
vi.mock("./finance-document-review", () => ({ issueFinanceDocumentAccess: issue }));
vi.mock("@/server/integrations/documents/finance-document-download", () => ({ downloadFinanceDocument: download }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { organizationId: id(1), commissionEventId: id(2), invoiceId: id(3), preparationId: id(4),
  source: { organizationId: id(5), documentId: id(6), versionId: id(7), sha256: "a".repeat(64) },
  expectedRevision: 6, correlationId: id(8), idempotencyKey: id(9) };
const supabase = {} as never, actor = id(10), bytes = new Uint8Array([1, 2, 3]);
const original = { ...input.source, fileName: "Synthetic original.pdf", document: { revision: 6, byteSize: 3, contentType: "application/pdf" } };
const observed = { currentActorIdentityId: actor, invoice: { invoiceRevision: 1 }, currentPreparation: {
  preparationId: input.preparationId, revision: 1, sourceDigest: "b".repeat(64), supportingOriginals: [original] } };
const grant = { accessId: id(11), accessToken: "c".repeat(64), expiresAt: "2099-01-01T00:00:00Z" };
const manifest = { ...input.source, accessId: grant.accessId, revision: 6, byteSize: 3,
  fileName: original.fileName, contentType: original.document.contentType, purpose: "finance_original" };
beforeEach(() => {
  authority.mockReset().mockResolvedValue({ identityId: actor, supabase });
  detail.mockReset().mockResolvedValue(structuredClone(observed)); issue.mockReset().mockResolvedValue(grant);
  download.mockReset().mockResolvedValue({ manifest, bytes });
});
test("downloads the exact invoice original through separately verified customer and source scopes", async () => {
  const options = { supabase };
  expect(await downloadManagedInvoiceOriginal(input, options)).toEqual({ manifest, bytes, reviewedAccessId: grant.accessId });
  expect(authority.mock.calls).toEqual([[input.organizationId, input.correlationId, options], [input.source.organizationId, input.correlationId, options]]);
  expect(detail).toHaveBeenCalledTimes(2);
  expect(issue).toHaveBeenCalledWith({ organizationId: input.source.organizationId, documentId: input.source.documentId,
    versionId: input.source.versionId, expectedRevision: 6, purpose: "finance_original", correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey }, options);
  expect(download).toHaveBeenCalledWith({ organizationId: input.source.organizationId, accessId: grant.accessId,
    accessToken: grant.accessToken, correlationId: input.correlationId }, options);
});
test.each(["organizationId", "documentId", "versionId", "sha256"])("denies crossed supporting %s before granting access", async field => {
  const source = { ...input.source, [field]: field === "sha256" ? "d".repeat(64) : id(99) };
  await expect(downloadManagedInvoiceOriginal({ ...input, source })).rejects.toBeInstanceOf(AuthorizationError);
  expect(issue).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
});
test.each(["actor", "preparation", "revision", "source_actor"])("denies %s changes before granting access", async mode => {
  if (mode === "actor") detail.mockResolvedValue({ ...observed, currentActorIdentityId: id(99) });
  if (mode === "preparation") detail.mockResolvedValue({ ...observed, currentPreparation: { ...observed.currentPreparation, preparationId: id(99) } });
  if (mode === "revision") detail.mockResolvedValue({ ...observed, currentPreparation: { ...observed.currentPreparation,
    supportingOriginals: [{ ...original, document: { ...original.document, revision: 7 } }] } });
  if (mode === "source_actor") authority.mockResolvedValueOnce({ identityId: actor, supabase }).mockResolvedValueOnce({ identityId: id(99), supabase });
  await expect(downloadManagedInvoiceOriginal(input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(issue).not.toHaveBeenCalled();
});
test.each(["organizationId", "documentId", "versionId", "sha256", "revision", "byteSize", "fileName", "contentType", "accessId", "purpose"])(
  "rejects a mismatched downloaded %s without returning bytes", async field => {
    const changed = field === "revision" || field === "byteSize" ? 99 : field === "sha256" ? "d".repeat(64) : "mismatched";
    download.mockResolvedValue({ manifest: { ...manifest, [field]: changed }, bytes });
    await expect(downloadManagedInvoiceOriginal(input)).rejects.toBeInstanceOf(AuthorizationError);
  });
test.each(["actor", "invoice_revision", "preparation", "preparation_revision", "digest", "original", "revoked"])(
  "withholds downloaded bytes after a final %s change", async mode => {
    const current = structuredClone(observed);
    if (mode === "actor") current.currentActorIdentityId = id(99);
    if (mode === "invoice_revision") current.invoice.invoiceRevision = 2;
    if (mode === "preparation") current.currentPreparation.preparationId = id(99);
    if (mode === "preparation_revision") current.currentPreparation.revision = 2;
    if (mode === "digest") current.currentPreparation.sourceDigest = "d".repeat(64);
    if (mode === "original") current.currentPreparation.supportingOriginals[0].fileName = "Changed.pdf";
    detail.mockResolvedValueOnce(observed);
    if (mode === "revoked") detail.mockRejectedValueOnce(new AuthorizationError()); else detail.mockResolvedValueOnce(current);
    await expect(downloadManagedInvoiceOriginal(input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(download).toHaveBeenCalledTimes(1);
  });
test("retains the complete request and access key after an unknown result", async () => {
  issue.mockRejectedValueOnce(new Error("Unknown result"));
  await expect(downloadManagedInvoiceOriginal(input)).rejects.toThrow("Unknown result");
  await downloadManagedInvoiceOriginal(input);
  expect(issue.mock.calls[1]).toEqual(issue.mock.calls[0]);
});
test("identifies an expired original grant only after both workspace authorities pass", async () => {
  issue.mockResolvedValue({ ...grant, expiresAt: "2000-01-01T00:00:00Z" });
  await expect(downloadManagedInvoiceOriginal(input)).rejects.toBeInstanceOf(ManagedInvoiceOriginalAccessExpiredError);
  expect(authority).toHaveBeenCalledTimes(2); expect(download).not.toHaveBeenCalled();
});
test("maps the genuine access RPC's expired exact-retry classification to fresh invoice access", async () => {
  const { FinanceDocumentAccessExpiredError } = await import("./finance-document-errors");
  issue.mockRejectedValue(new FinanceDocumentAccessExpiredError());
  await expect(downloadManagedInvoiceOriginal(input)).rejects.toBeInstanceOf(ManagedInvoiceOriginalAccessExpiredError);
  expect(authority).toHaveBeenCalledTimes(2); expect(download).not.toHaveBeenCalled();
});
test.each([{ ...input, actorIdentityId: actor }, { ...input, expectedRevision: 0 },
  { ...input, source: { ...input.source, url: "https://foreign.invalid" } }])("rejects invalid input before authority", async value => {
  await expect(downloadManagedInvoiceOriginal(value)).rejects.toThrow(); expect(authority).not.toHaveBeenCalled();
});
