import "server-only";
import { workspaceDocumentAccessManifestSchema, workspaceDocumentAccessResolveSchema, workspaceDocumentAccessResultSchema,
  workspaceDocumentAccessSchema, workspaceDocumentReviewPageSchema, workspaceDocumentReviewReadSchema,
  workspaceDocumentReviewResultSchema, workspaceDocumentReviewSchema } from "@/lib/workspace-document-review";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function execute(name: string, input: { organizationId: string; correlationId: string; idempotencyKey?: string },
  options: AuthorizationOptions, review = false) {
  const { correlationId, idempotencyKey, ...payload } = input;
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId || context.correlationId !== correlationId) {
    throw new AuthorizationError();
  }
  if (review) {
    const permissionOptions = { supabase: context.supabase, correlationId };
    const approval = await requirePermission("rfp.approve", context.scope, permissionOptions);
    const administration = await requirePermission("admin.access", { kind: "platform" }, permissionOptions);
    if (approval.identityId !== context.identityId || administration.identityId !== context.identityId
      || approval.scope.kind !== "organization" || approval.scope.organizationId !== input.organizationId
      || administration.scope.kind !== "platform" || approval.correlationId !== correlationId || administration.correlationId !== correlationId
      || approval.assurance !== "aal2" || administration.assurance !== "aal2") throw new AuthorizationError();
  }
  const response = await context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Document request failed");
  return response.data as unknown;
}

export async function getWorkspaceDocumentReview(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentReviewReadSchema.parse(value);
  const result = workspaceDocumentReviewPageSchema.parse(await execute("mmhr_get_workspace_document_review", input, options, true));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.document.documentId !== input.documentId || result.document.versionId !== input.versionId
    || (result.canReview && (!result.document.isCurrent || !["ready", "needs_review"].includes(result.document.state)))) {
    throw new Error("Invalid document review");
  }
  return result;
}

export async function recordWorkspaceDocumentReview(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentReviewSchema.parse(value);
  const result = workspaceDocumentReviewResultSchema.parse(await execute("mmhr_record_workspace_document_review", input, options, true));
  const state = input.action === "begin_review" ? "needs_review" : input.action === "approve" ? "approved" : "rejected";
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.documentId !== input.documentId || result.versionId !== input.versionId || result.action !== input.action
    || result.state !== state || result.revision !== input.expectedRevision+1) throw new Error("Invalid document review receipt");
  return result;
}

export async function issueWorkspaceDocumentAccess(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentAccessSchema.parse(value);
  const result = workspaceDocumentAccessResultSchema.parse(await execute("mmhr_issue_workspace_document_access", input, options, input.purpose === "review"));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.documentId !== input.documentId || result.versionId !== input.versionId || result.purpose !== input.purpose
    || result.revision !== input.expectedRevision) throw new Error("Invalid document access receipt");
  return result;
}

export async function resolveWorkspaceDocumentAccess(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentAccessResolveSchema.parse(value);
  const result = workspaceDocumentAccessManifestSchema.parse(await execute("mmhr_resolve_workspace_document_access", input, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId || result.accessId !== input.accessId) {
    throw new Error("Invalid document access manifest");
  }
  return result;
}
