import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { inspectDocumentBytes } from "@/server/workflows/document-bytes";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/server/workflows/document-safety";
import { DOCUMENT_QUARANTINE_BUCKET, DocumentStoreError, type DocumentStore, type QuarantineObject, type QuarantineUploadRequest } from "@/server/workflows/document-store";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const ids = { organizationId: uuid, documentId: uuid, versionId: uuid };
const uploadSchema = z.strictObject({ ...ids, fileName: z.string(), declaredMimeType: z.string(), bytes: z.instanceof(Uint8Array) });
const objectSchema = z.strictObject({ ...ids,
  objectPath: z.string().max(160), storageReference: z.string().max(256), fileName: z.string().max(255),
  contentType: z.string().max(255), byteSize: z.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), state: z.literal("quarantined"),
});

function pathFor(ids: { organizationId: string; documentId: string; versionId: string }): string {
  return `${ids.organizationId}/${ids.documentId}/${ids.versionId}`;
}

/** Uses the supplied scoped client; Storage RLS must authorize every object. */
export function createSupabaseDocumentStore(client: RequestSupabaseClient): DocumentStore {
  const bucket = client.storage.from(DOCUMENT_QUARANTINE_BUCKET);
  return Object.freeze({
    async putQuarantined(input: QuarantineUploadRequest): Promise<QuarantineObject> {
      const parsed = uploadSchema.safeParse(input);
      if (!parsed.success) throw new DocumentStoreError("INVALID_REQUEST", "Invalid document upload");
      const request = parsed.data;
      const inspected = inspectDocumentBytes({ fileName: request.fileName, declaredMimeType: request.declaredMimeType }, request.bytes);
      if (!inspected.ok) throw new DocumentStoreError("INVALID_REQUEST", "Invalid document upload");
      const document = inspected.document;
      const objectPath = pathFor(request);
      const response = await bucket.upload(objectPath, document.copyBytes(), {
        contentType: document.contentType, cacheControl: "0", upsert: false,
      }).catch(() => { throw new DocumentStoreError("UNAVAILABLE", "Document storage unavailable"); });
      if (response.error || !response.data || response.data.path !== objectPath
        || response.data.fullPath !== `${DOCUMENT_QUARANTINE_BUCKET}/${objectPath}`) {
        throw new DocumentStoreError("UNAVAILABLE", "Document storage unavailable");
      }
      return Object.freeze({ organizationId: request.organizationId, documentId: request.documentId,
        versionId: request.versionId, objectPath, storageReference: `quarantine://${objectPath}`,
        fileName: document.fileName, contentType: document.contentType, byteSize: document.byteSize,
        sha256: document.sha256, state: "quarantined" });
    },
    async readForScan(input: QuarantineObject): Promise<Uint8Array> {
      const parsed = objectSchema.safeParse(input);
      if (!parsed.success) throw new DocumentStoreError("INVALID_REQUEST", "Invalid document object");
      const object = parsed.data;
      const objectPath = pathFor(object);
      if (object.objectPath !== objectPath || object.storageReference !== `quarantine://${objectPath}`) {
        throw new DocumentStoreError("INVALID_REQUEST", "Invalid document object");
      }
      const response = await bucket.download(objectPath).catch(() => { throw new DocumentStoreError("UNAVAILABLE", "Document storage unavailable"); });
      if (response.error || !response.data) throw new DocumentStoreError("UNAVAILABLE", "Document storage unavailable");
      if (response.data.size !== object.byteSize) throw new DocumentStoreError("INTEGRITY", "Document integrity check failed");
      const bytes = new Uint8Array(await response.data.arrayBuffer().catch(() => { throw new DocumentStoreError("UNAVAILABLE", "Document storage unavailable"); }));
      if (bytes.byteLength !== object.byteSize
        || createHash("sha256").update(bytes).digest("hex") !== object.sha256) throw new DocumentStoreError("INTEGRITY", "Document integrity check failed");
      const inspected = inspectDocumentBytes({ fileName: object.fileName, declaredMimeType: object.contentType }, bytes);
      if (!inspected.ok) throw new DocumentStoreError("INTEGRITY", "Document integrity check failed");
      return inspected.document.copyBytes();
    },
  });
}
