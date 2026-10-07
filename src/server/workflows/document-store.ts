import "server-only";

export const DOCUMENT_QUARANTINE_BUCKET = "mmhr-document-quarantine";

export class DocumentStoreError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "UNAVAILABLE" | "INTEGRITY", message: string) {
    super(message);
    this.name = "DocumentStoreError";
  }
}

export type QuarantineObject = Readonly<{
  organizationId: string;
  documentId: string;
  versionId: string;
  objectPath: string;
  storageReference: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  state: "quarantined";
}>;

export type QuarantineUploadRequest = Readonly<{
  organizationId: string;
  documentId: string;
  versionId: string;
  fileName: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}>;

// Download signing belongs to the later authorized, clean, approved version
// path. This adapter intentionally supplies no public or quarantine URL.
export interface DocumentStore {
  putQuarantined(request: QuarantineUploadRequest): Promise<QuarantineObject>;
  readForScan(object: QuarantineObject): Promise<Uint8Array>;
}
