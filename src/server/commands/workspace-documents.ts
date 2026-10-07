import "server-only";
import { workspaceDocumentHistoryPageSchema, workspaceDocumentHistorySchema, workspaceDocumentListSchema,
  workspaceDocumentPageSchema, workspaceDocumentVersionPageSchema, workspaceDocumentVersionsSchema } from "@/lib/workspace-documents";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function read(name: string, input: { organizationId: string; correlationId: string }, options: AuthorizationOptions) {
  const { correlationId, ...payload } = input;
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId
    || context.correlationId !== correlationId) throw new AuthorizationError();
  const response = await context.supabase.rpc(name, { payload, correlation_id: correlationId });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Document request failed");
  return response.data as unknown;
}
export async function getWorkspaceDocuments(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentListSchema.parse(value);
  const page = workspaceDocumentPageSchema.parse(await read("mmhr_get_workspace_documents", input, options));
  if (page.organizationId !== input.organizationId || page.correlationId !== input.correlationId) throw new Error("Invalid document page");
  let previous = input.afterId;
  for (const row of page.items) {
    if (!row.isCurrent || (previous && row.documentId <= previous)) throw new Error("Invalid document page");
    previous = row.documentId;
  }
  if (page.nextCursor && (page.items.length !== 25 || page.nextCursor !== previous)) throw new Error("Invalid document cursor");
  return page;
}
export async function getWorkspaceDocumentVersions(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentVersionsSchema.parse(value);
  const page = workspaceDocumentVersionPageSchema.parse(await read("mmhr_get_workspace_document_versions", input, options));
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
export async function getWorkspaceDocumentHistory(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentHistorySchema.parse(value);
  const page = workspaceDocumentHistoryPageSchema.parse(await read("mmhr_get_workspace_document_history", input, options));
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
