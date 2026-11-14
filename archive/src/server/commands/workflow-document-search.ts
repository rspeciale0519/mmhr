import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
const documentTypes = ["rfp", "response", "proposal", "contract", "attachment", "other"] as const;
const metadata = z.record(z.string(), z.unknown());

export const workflowDocumentSearchContentSchema = z.strictObject({ ...base, documentId: uuid, versionId: uuid, metadata, approvedExtractedContent: z.string().max(1_000_000).nullable() });
export const workflowDocumentSearchSchema = z.strictObject({ ...base, query: z.string().trim().min(1).max(200), documentType: z.enum(documentTypes).nullable(), limit: z.number().int().min(1).max(100) });

const contentResultSchema = z.strictObject({ documentId: uuid, versionId: uuid, organizationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
const searchResultSchema = z.strictObject({ organizationId: uuid, query: z.string(), results: z.array(z.strictObject({ documentId: uuid, versionId: uuid, documentType: z.enum(documentTypes), version: z.number().int().positive(), metadata, snippet: z.string().nullable() })), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

function assertScope(context: Awaited<ReturnType<typeof requirePermission>>, organizationId: string, actorIdentityId: string) {
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId || context.identityId !== actorIdentityId) throw new AuthorizationError();
}

export async function setWorkflowDocumentSearchContent(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = workflowDocumentSearchContentSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid document search content");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options); assertScope(context, parsed.data.organizationId, parsed.data.actorIdentityId);
    const response = await context.supabase.rpc("mmhr_set_workflow_document_search_content", { payload: parsed.data, correlation_id: parsed.data.correlationId, idempotency_key: parsed.data.idempotencyKey });
    if (response.error) throw new Error("Document search content unavailable"); const result = contentResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.documentId !== parsed.data.documentId || result.data.versionId !== parsed.data.versionId || result.data.correlationId !== parsed.data.correlationId) throw new Error("Invalid document search content result"); return result.data;
  } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Document search content unavailable" || error.message === "Invalid document search content result")) throw error; throw new Error("Document search content unavailable"); }
}

export async function searchWorkflowDocuments(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = workflowDocumentSearchSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid document search");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options); assertScope(context, parsed.data.organizationId, parsed.data.actorIdentityId);
    const response = await context.supabase.rpc("mmhr_search_workflow_documents", { payload: parsed.data, correlation_id: parsed.data.correlationId, idempotency_key: parsed.data.idempotencyKey });
    if (response.error) throw new Error("Document search unavailable"); const result = searchResultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.query !== parsed.data.query || result.data.correlationId !== parsed.data.correlationId) throw new Error("Invalid document search result"); return result.data;
  } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Document search unavailable" || error.message === "Invalid document search result")) throw error; throw new Error("Document search unavailable"); }
}
