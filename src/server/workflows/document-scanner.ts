import "server-only";

export type DocumentScanRequest = Readonly<{
  versionId: string;
  expectedSha256: string;
  bytes: Uint8Array;
}>;

export type DocumentScanResult = Readonly<{
  versionId: string;
  sha256: string;
  state: "clean" | "quarantined" | "failed";
  scanner: "clamav";
  scannerVersion: string | null;
  signatureVersion: number | null;
  signatureUpdatedAt: string | null;
  scannedAt: string;
  failureCode: "hash_mismatch" | "scanner_unavailable" | "scanner_timeout"
    | "scanner_protocol" | "scanner_version" | "signatures_stale" | "scan_context_changed" | "unsafe_document" | null;
}>;

export interface DocumentScanner {
  scan(request: DocumentScanRequest): Promise<DocumentScanResult>;
}
