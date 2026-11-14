import { describe, expect, test } from "vitest";
import { verifyManagedFinanceOriginalChoices } from "./managed-finance-originals";

const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const input = { organizationId: id(1), correlationId: id(2), source: { sourceClass: "agreement", vendorOrganizationId: id(3) } };
const item = { original: { organizationId: id(1), documentId: id(4), versionId: id(5), sha256: "a".repeat(64) },
  document: { documentId: id(4), versionId: id(5), version: 1, isCurrent: true, state: "approved", revision: 6,
    fileName: "Synthetic original.pdf", contentType: "application/pdf", byteSize: 64, failureCode: null,
    createdAt: "2026-10-03T10:00:00Z", updatedAt: "2026-10-03T10:01:00Z" }, vendorLabel: "Synthetic vendor", dealLabel: null };
const page = { ...input, items: [item], nextCursor: null };

describe("Managed finance approved original choices", () => {
  test("retains exact current approved file identity, revision, and hash", () => {
    expect(verifyManagedFinanceOriginalChoices(page, input)).toEqual(page);
    expect(verifyManagedFinanceOriginalChoices({ ...page, items: [] }, input).items).toEqual([]);
  });
  test.each(["organizationId", "correlationId"])("rejects foreign %s", field => {
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, [field]: id(99) }, input)).toThrow();
  });
  test("rejects crossed source, original, and label associations", () => {
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, source: { ...input.source, vendorOrganizationId: id(99) } }, input)).toThrow();
    for (const changed of [{ organizationId: id(99) }, { documentId: id(99) }, { versionId: id(99) }]) {
      expect(() => verifyManagedFinanceOriginalChoices({ ...page, items: [{ ...item, original: { ...item.original, ...changed } }] }, input)).toThrow();
    }
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, items: [{ ...item, dealLabel: "Unbound case" }] }, input)).toThrow();
  });
  test("rejects unapproved and historical files as new preparation choices", () => {
    for (const changed of [{ state: "received" }, { state: "ready" }, { state: "needs_review" }, { state: "superseded" }, { isCurrent: false }]) {
      expect(() => verifyManagedFinanceOriginalChoices({ ...page, items: [{ ...item, document: { ...item.document, ...changed } }] }, input)).toThrow();
    }
  });
  test("binds each page to ascending version identifiers and the exact last item", () => {
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, items: [item, item] }, input)).toThrow();
    expect(() => verifyManagedFinanceOriginalChoices(page, { ...input, afterVersionId: id(5) })).toThrow();
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, nextCursor: id(5) }, input)).toThrow();
    const items = Array.from({ length: 25 }, (_, index) => ({ ...item, original: { ...item.original, versionId: id(index + 5) },
      document: { ...item.document, versionId: id(index + 5) } }));
    expect(verifyManagedFinanceOriginalChoices({ ...page, items, nextCursor: id(29) }, input).nextCursor).toBe(id(29));
    expect(() => verifyManagedFinanceOriginalChoices({ ...page, items, nextCursor: id(28) }, input)).toThrow();
  });
});
