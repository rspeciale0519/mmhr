import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { startDocumentScannerRehearsal, syntheticScanRequest } from "@/test/documents/document-scanner-rehearsal";

describe("genuine isolated document malware scanner", () => {
  let fixture: Awaited<ReturnType<typeof startDocumentScannerRehearsal>> | undefined;
  beforeAll(async () => { fixture = await startDocumentScannerRehearsal(); }, 360_000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 90_000);

  test("accepts synthetic clean bytes with current signatures and exact provenance", async () => {
    const input = syntheticScanRequest(Buffer.from("%PDF-1.7\nSynthetic scan check\n%%EOF"));
    const result = await fixture!.scanner.scan(input);
    expect(result).toMatchObject({ state: "clean", failureCode: null, scannerVersion: "1.4.6",
      versionId: input.versionId, sha256: input.expectedSha256 });
    expect(result.signatureVersion).toBeGreaterThan(0);
    expect(Date.now() - Date.parse(result.signatureUpdatedAt!)).toBeLessThan(86_400_000);
  }, 60_000);

  test("quarantines the harmless standard EICAR antivirus test string", async () => {
    // Keep the standard test string in memory; create no host test file.
    const input = syntheticScanRequest(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"));
    const result = await fixture!.scanner.scan(input);
    expect(result).toMatchObject({ state: "quarantined", failureCode: "unsafe_document", scannerVersion: "1.4.6",
      versionId: input.versionId, sha256: input.expectedSha256 });
    expect(JSON.stringify(result)).not.toMatch(/eicar/i);
  }, 60_000);

  test("rejects a mismatched stored hash before scanner transport", async () => {
    const input = syntheticScanRequest(Buffer.from("Synthetic integrity check"));
    await expect(fixture!.scanner.scan({ ...input, expectedSha256: "a".repeat(64) }))
      .resolves.toMatchObject({ state: "failed", failureCode: "hash_mismatch", scannerVersion: null });
  });
});
