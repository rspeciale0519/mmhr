import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { inspectDocumentBytes } from "@/server/workflows/document-bytes";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const inputSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid,
  expectedVersion: z.number().int().min(0).max(99_999),
  fileName: z.string(), declaredMimeType: z.string(),
  correlationId: uuid, idempotencyKey: uuid,
});
const resultSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid,
  version: z.number().int().min(1).max(100_000), state: z.literal("received"), revision: z.literal(1),
  correlationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]),
});

/** Reservation records metadata only. It grants no Storage or download access. */
export async function reserveWorkspaceDocument(value: unknown, bytes: Uint8Array, options: AuthorizationOptions = {}) {
  const input = inputSchema.parse(value);
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { ...options, correlationId: input.correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId
    || context.correlationId !== input.correlationId) throw new AuthorizationError();
  const inspection = inspectDocumentBytes({ fileName: input.fileName, declaredMimeType: input.declaredMimeType }, bytes);
  if (!inspection.ok) throw new Error("Document validation failed");
  const document = inspection.document;
  const response = await context.supabase.rpc("mmhr_reserve_workspace_document", {
    payload: { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId,
      expectedVersion: input.expectedVersion, fileName: document.fileName, contentType: document.contentType,
      byteSize: document.byteSize, sha256: document.sha256 },
    correlation_id: input.correlationId, idempotency_key: input.idempotencyKey,
  });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Document reservation failed");
  const parsed = resultSchema.safeParse(response.data);
  if (!parsed.success) throw new Error("Invalid document reservation result");
  const result = parsed.data;
  if (result.organizationId !== input.organizationId || result.documentId !== input.documentId
    || result.versionId !== input.versionId || result.correlationId !== input.correlationId
    || result.version !== input.expectedVersion + 1) throw new Error("Invalid document reservation result");
  return result;
}

const completionInput = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid, expectedRevision: z.literal(1), correlationId: uuid, idempotencyKey: uuid,
});
const completionResult = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid, state: z.literal("quarantined"), revision: z.literal(2),
  correlationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]),
});

/** The database verifies the actual private object before queuing a scan. */
export async function completeWorkspaceDocumentUpload(value: unknown, options: AuthorizationOptions = {}) {
  const input = completionInput.parse(value);
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { ...options, correlationId: input.correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId
    || context.correlationId !== input.correlationId) throw new AuthorizationError();
  const { correlationId, idempotencyKey, ...payload } = input;
  const response = await context.supabase.rpc("mmhr_complete_workspace_document_upload", {
    payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Document upload completion failed");
  const parsed = completionResult.safeParse(response.data);
  if (!parsed.success) throw new Error("Invalid document upload completion result");
  const result = parsed.data;
  if (result.organizationId !== input.organizationId || result.documentId !== input.documentId
    || result.versionId !== input.versionId || result.correlationId !== input.correlationId) {
    throw new Error("Invalid document upload completion result");
  }
  return result;
}
