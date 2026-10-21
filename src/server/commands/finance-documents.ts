import { checkFinanceDocumentRpcError } from "./finance-document-errors";
import { requireFinanceDocumentAuthority } from './finance-document-upload';
import "server-only";
import { financeDocumentHistoryPageSchema, financeDocumentHistorySchema, financeDocumentListSchema,
  financeDocumentPageSchema, financeDocumentVersionPageSchema, financeDocumentVersionsSchema } from "@/lib/finance-documents";
import { type AuthorizationOptions } from "@/server/auth/authorization";

async function read(name: string, input: { organizationId: string; correlationId: string }, options: AuthorizationOptions) {
  const { correlationId, ...payload } = input;
  const context=await requireFinanceDocumentAuthority(input.organizationId,correlationId,options);
  const response = await Promise.resolve(context.supabase.rpc(name, { payload, correlation_id: correlationId })).catch(() => { throw new Error("Document request failed"); });
  checkFinanceDocumentRpcError(response.error,"Document request failed");
  return response.data as unknown;
}
export async function getFinanceDocuments(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentListSchema.parse(value);
  const page = financeDocumentPageSchema.parse(await read("mmhr_get_finance_documents", input, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== input.correlationId) throw new Error("Invalid document page");
  let previous = input.afterId;
  for (const row of page.items) {
    if (!row.isCurrent || (previous && row.documentId <= previous)) throw new Error("Invalid document page");
    previous = row.documentId;
  }
  if (page.nextCursor && (page.items.length !== 25 || page.nextCursor !== previous)) throw new Error("Invalid document cursor");
  return page;
}
export async function getFinanceDocumentVersions(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentVersionsSchema.parse(value);
  const page = financeDocumentVersionPageSchema.parse(await read("mmhr_get_finance_document_versions", input, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== input.correlationId || page.documentId !== input.documentId) {
    throw new Error("Invalid document versions");
  }
  let previous = input.afterVersion;
  for (const row of page.items) {
    if (row.documentId !== input.documentId || row.version <= previous || row.version > page.currentVersion
      || row.isCurrent !== (row.version === page.currentVersion)) throw new Error("Invalid document versions");
    previous = row.version;
  }
  if (page.nextVersion && (page.items.length !== 25 || page.nextVersion !== previous)) throw new Error("Invalid document version cursor");
  return page;
}
export async function getFinanceDocumentHistory(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentHistorySchema.parse(value);
  const page = financeDocumentHistoryPageSchema.parse(await read("mmhr_get_finance_document_history", input, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== input.correlationId
    || page.documentId !== input.documentId || page.versionId !== input.versionId) throw new Error("Invalid document history");
  let previous = input.afterRevision;
  for (const row of page.items) {
    if (row.revision !== previous + 1) throw new Error("Invalid document history");
    previous = row.revision;
  }
  if (page.nextRevision && (page.items.length !== 25 || page.nextRevision !== previous)) throw new Error("Invalid document history cursor");
  return page;
}
