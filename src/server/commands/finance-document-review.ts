import { checkFinanceDocumentRpcError, FinanceDocumentAccessExpiredError } from "./finance-document-errors";
import "server-only";
import { financeDocumentAccessManifestSchema, financeDocumentAccessResolveSchema, financeDocumentAccessResultSchema,
  financeDocumentAccessSchema, financeDocumentReviewPageSchema, financeDocumentReviewReadSchema,
  financeDocumentReviewResultSchema, financeDocumentReviewSchema } from "@/lib/finance-document-review";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function execute(name: string, input: { organizationId: string; correlationId: string; idempotencyKey?: string },
  options: AuthorizationOptions) {
  const { correlationId, idempotencyKey, ...payload } = input;
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId || context.correlationId !== correlationId || context.assurance !== "aal2") {
    throw new AuthorizationError();
  }
  {
    const permissionOptions = { supabase: context.supabase, correlationId };
    const approval = await requirePermission("finance.manage", context.scope, permissionOptions);
    const administration = await requirePermission("admin.access", { kind: "platform" }, permissionOptions);
    if (approval.identityId !== context.identityId || administration.identityId !== context.identityId
      || approval.scope.kind !== "organization" || approval.scope.organizationId !== input.organizationId
      || administration.scope.kind !== "platform" || approval.correlationId !== correlationId || administration.correlationId !== correlationId
      || approval.assurance !== "aal2" || administration.assurance !== "aal2") throw new AuthorizationError();
  }
  const response = await Promise.resolve(context.supabase.rpc(name, { payload, correlation_id: correlationId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) })).catch(() => { throw new Error("Document request failed"); });
  // The exact RPC checks live source authority before testing its immutable retry's expiry.
  if (name === "mmhr_issue_finance_document_access" && response.error?.code === "42501"
    && response.error.message === "Document access retry expired") throw new FinanceDocumentAccessExpiredError();
  checkFinanceDocumentRpcError(response.error,"Document request failed");
  return response.data as unknown;
}

export async function getFinanceDocumentReview(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentReviewReadSchema.parse(value);
  const result = financeDocumentReviewPageSchema.parse(await execute("mmhr_get_finance_document_review", input, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.document.documentId !== input.documentId || result.document.versionId !== input.versionId
    || (result.canReview && (!result.document.isCurrent || !["ready", "needs_review"].includes(result.document.state)))) {
    throw new Error("Invalid document review");
  }
  return result;
}

export async function recordFinanceDocumentReview(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentReviewSchema.parse(value);
  const result = financeDocumentReviewResultSchema.parse(await execute("mmhr_record_finance_document_review", input, options));
  const state = input.action === "begin_review" ? "needs_review" : input.action === "approve" ? "approved" : "rejected";
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.documentId !== input.documentId || result.versionId !== input.versionId || result.action !== input.action
    || result.state !== state || result.revision !== input.expectedRevision+1) throw new Error("Invalid document review receipt");
  return result;
}

export async function issueFinanceDocumentAccess(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentAccessSchema.parse(value);
  const result = financeDocumentAccessResultSchema.parse(await execute("mmhr_issue_finance_document_access", input, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId
    || result.documentId !== input.documentId || result.versionId !== input.versionId || result.purpose !== input.purpose
    || result.revision !== input.expectedRevision) throw new Error("Invalid document access receipt");
  return result;
}

export async function resolveFinanceDocumentAccess(value: unknown, options: AuthorizationOptions = {}) {
  const input = financeDocumentAccessResolveSchema.parse(value);
  const result = financeDocumentAccessManifestSchema.parse(await execute("mmhr_resolve_finance_document_access", input, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId || result.accessId !== input.accessId) {
    throw new Error("Invalid document access manifest");
  }
  return result;
}
