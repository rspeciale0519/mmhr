import { checkFinanceDocumentRpcError } from "./finance-document-errors";
import "server-only";
import { z } from "zod";
import { financeDocumentUploadPreparationSchema, financeDocumentUploadCompletionSchema,
  financeDocumentReservationResultSchema, financeDocumentCompletionResultSchema } from "@/lib/finance-document-upload";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { inspectDocumentBytes } from "@/server/workflows/document-bytes";

export async function requireFinanceDocumentAuthority(organizationId: string, correlationId: string, options: AuthorizationOptions = {}) {
  const scope = { kind: "organization" as const, organizationId };
  const context = await requirePermission("workspace.access", scope, { ...options, correlationId });
  const finance = await requirePermission("finance.manage", scope, { supabase: context.supabase, correlationId });
  const admin = await requirePermission("admin.access", { kind: "platform" }, { supabase: context.supabase, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId
    || finance.scope.kind !== "organization" || finance.scope.organizationId !== organizationId || admin.scope.kind !== "platform"
    || [context, finance, admin].some(value => value.identityId !== context.identityId || value.assurance !== "aal2"
      || value.correlationId !== correlationId)) throw new AuthorizationError();
  return context;
}
async function execute<T extends { organizationId: string; correlationId: string; idempotencyKey: string }>(name: string, input: T, options: AuthorizationOptions) {
  const context = await requireFinanceDocumentAuthority(input.organizationId, input.correlationId, options);
  const { correlationId, idempotencyKey, ...payload } = input;
  const response = await Promise.resolve(context.supabase.rpc(name, { payload, correlation_id: correlationId, idempotency_key: idempotencyKey }))
    .catch(() => { throw new Error("Finance document request failed"); });
  checkFinanceDocumentRpcError(response.error);
  return response.data as unknown;
}
export async function prepareFinanceDocumentUpload(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentUploadPreparationSchema.parse(value);
  const { declaredMimeType, ...manifest } = input;
  const result = financeDocumentReservationResultSchema.parse(await execute("mmhr_reserve_finance_document",
    { ...manifest, contentType: declaredMimeType }, options));
  if (result.organizationId !== input.organizationId || result.documentId !== input.documentId || result.versionId !== input.versionId
    || result.correlationId !== input.correlationId || result.version !== input.expectedVersion + 1) throw new Error("Invalid finance document reservation");
  return result;
}
const { byteSize: _size, sha256: _hash, ...byteFields } = financeDocumentUploadPreparationSchema.shape;
void [_size, _hash];
const byteInput = z.strictObject(byteFields);
export async function reserveFinanceDocument(value: unknown, bytes: Uint8Array, options: AuthorizationOptions = {}) {
  const input = byteInput.parse(value);
  const inspection = inspectDocumentBytes({ fileName: input.fileName, declaredMimeType: input.declaredMimeType }, bytes);
  if (!inspection.ok) throw new Error("Finance document validation failed");
  const { fileName, byteSize, sha256, contentType } = inspection.document;
  return prepareFinanceDocumentUpload({ ...input, fileName, byteSize, sha256, declaredMimeType: contentType }, options);
}
export async function completeFinanceDocumentUpload(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentUploadCompletionSchema.parse(value);
  const result = financeDocumentCompletionResultSchema.parse(await execute("mmhr_complete_finance_document_upload", input, options));
  if (result.organizationId !== input.organizationId || result.documentId !== input.documentId || result.versionId !== input.versionId
    || result.correlationId !== input.correlationId) throw new Error("Invalid finance document completion");
  return result;
}
