import { describe, expect, test } from "vitest";

import {
  canTransitionDocument,
  isAllowedSignedUrlLifetime,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_SIGNED_URL_LIFETIME_SECONDS,
  validateDocumentSafety,
} from "./document-safety";

const base = {
  fileName: "proposal.pdf",
  declaredMimeType: "application/pdf",
  sizeBytes: 1_024,
  sha256: "A".repeat(64),
  magicBytes: "255044462d312e37",
};

describe("document safety contract", () => {
  test("accepts supported metadata but leaves the document quarantined", () => {
    expect(validateDocumentSafety(base)).toEqual({
      ok: true,
      state: "quarantined",
      fileName: "proposal.pdf",
      extension: "pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 1_024,
      sha256: "a".repeat(64),
    });
  });

  test.each([
    ["unsupported extension", { fileName: "proposal.exe" }, "unsupported_extension"],
    ["MIME mismatch", { declaredMimeType: "image/png" }, "mime_mismatch"],
    ["size limit", { sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1 }, "size_exceeded"],
    ["magic bytes", { magicBytes: "89504e470d0a1a0a" }, "magic_bytes_mismatch"],
  ])("rejects %s", (_name, change, code) => {
    expect(validateDocumentSafety({ ...base, ...change })).toEqual({ ok: false, code });
  });

  test("rejects paths and malformed digests without exposing input", () => {
    expect(validateDocumentSafety({ ...base, sizeBytes: 0 })).toEqual({ ok: false, code: "invalid_metadata" });
    expect(validateDocumentSafety({ ...base, fileName: "../secret.pdf" })).toEqual({ ok: false, code: "invalid_metadata" });
    expect(validateDocumentSafety({ ...base, sha256: "not-a-digest" })).toEqual({ ok: false, code: "invalid_metadata" });
  });

  test("allows only safe forward document transitions", () => {
    expect(canTransitionDocument("received", "quarantined")).toBe(true);
    expect(canTransitionDocument("quarantined", "approved")).toBe(false);
    expect(canTransitionDocument("approved", "processing")).toBe(false);
    expect(canTransitionDocument("failed", "ready")).toBe(false);
  });

  test("caps signed URL lifetime at fifteen minutes", () => {
    expect(isAllowedSignedUrlLifetime(1)).toBe(true);
    expect(isAllowedSignedUrlLifetime(MAX_SIGNED_URL_LIFETIME_SECONDS)).toBe(true);
    expect(isAllowedSignedUrlLifetime(MAX_SIGNED_URL_LIFETIME_SECONDS + 1)).toBe(false);
    expect(isAllowedSignedUrlLifetime(1.5)).toBe(false);
  });
});
