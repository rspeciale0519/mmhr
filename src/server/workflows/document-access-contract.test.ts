import { describe, expect, test } from "vitest";

import {
  createSignedDocumentAccess,
  parseDocumentVersion,
} from "./document-access-contract";

const version = {
  documentId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  version: 2,
  state: "approved",
  sha256: "a".repeat(64),
  storageReference: "quarantine:document-2",
  createdAt: "2026-08-31T12:00:00.000Z",
  createdByIdentityId: "33333333-3333-4333-8333-333333333333",
};

const access = {
  accessReference: "44444444-4444-4444-8444-444444444444",
  documentId: version.documentId,
  organizationId: version.organizationId,
  version: version.version,
  url: "https://storage.example/signed/document-2",
  issuedAt: "2026-08-31T12:00:00.000Z",
  expiresAt: "2026-08-31T12:10:00.000Z",
};

describe("document access contract", () => {
  test("accepts immutable approved document versions", () => {
    expect(parseDocumentVersion(version)).toMatchObject({ version: 2, state: "approved" });
  });

  test("issues scoped, short-lived HTTPS access", () => {
    const result = createSignedDocumentAccess({ version, access });
    expect(result).toMatchObject({ documentId: version.documentId, version: 2 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects superseded, cross-organization, and mismatched versions", () => {
    expect(() => createSignedDocumentAccess({ version: { ...version, state: "superseded" }, access }))
      .toThrow(/superseded/i);
    expect(() => createSignedDocumentAccess({
      version,
      access: { ...access, organizationId: "55555555-5555-4555-8555-555555555555" },
    })).toThrow("scope mismatch");
    expect(() => createSignedDocumentAccess({ version, access: { ...access, version: 1 } }))
      .toThrow("scope mismatch");
  });

  test("rejects excessive or reversed URL lifetimes and non-HTTPS URLs", () => {
    expect(() => createSignedDocumentAccess({
      version,
      access: { ...access, expiresAt: "2026-08-31T12:16:00.000Z" },
    })).toThrow("lifetime is not allowed");
    expect(() => createSignedDocumentAccess({
      version,
      access: { ...access, expiresAt: "2026-08-31T11:59:00.000Z" },
    })).toThrow("lifetime is not allowed");
    expect(() => createSignedDocumentAccess({ version, access: { ...access, url: "http://storage.example/file" } }))
      .toThrow("Invalid signed document access");
  });
});
