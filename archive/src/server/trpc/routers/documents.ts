import { TRPCError } from "@trpc/server";
import { workspaceDocumentHistorySchema, workspaceDocumentListSchema, workspaceDocumentVersionsSchema } from "@/lib/workspace-documents";
import { AuthorizationError } from "@/server/auth/authorization";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments, getWorkspaceDocumentVersions } from "@/server/commands/workspace-documents";
import { workspaceDocumentUploadCompletionSchema, workspaceDocumentUploadPreparationSchema } from "@/lib/workspace-document-upload";
import { prepareWorkspaceDocumentUpload } from "@/server/commands/document-upload-preparation";
import { completeWorkspaceDocumentUpload } from "@/server/commands/document-reservations";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { workspaceDocumentAccessSchema, workspaceDocumentReviewReadSchema, workspaceDocumentReviewSchema } from "@/lib/workspace-document-review";
import { getWorkspaceDocumentReview, issueWorkspaceDocumentAccess, recordWorkspaceDocumentReview } from "@/server/commands/workspace-document-review";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function resolve<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) { throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "Document request failed" }); }
}
async function resolveUpload<T>(organizationId: string, operation: () => Promise<T>) {
  return resolve(async () => {
    if (await readSelectedOrganizationId() !== organizationId) throw new AuthorizationError();
    return operation();
  });
}
export const documentsRouter = router({
  review: permissionProcedure({ permission: "rfp.approve", input: workspaceDocumentReviewReadSchema, resolveScope })
    .query(({ ctx, input }) => resolveUpload(input.organizationId, () => getWorkspaceDocumentReview(input, { supabase: ctx.supabase }))),
  decide: permissionProcedure({ permission: "rfp.approve", input: workspaceDocumentReviewSchema, resolveScope })
    .mutation(({ ctx, input }) => resolveUpload(input.organizationId, () => recordWorkspaceDocumentReview(input, { supabase: ctx.supabase }))),
  issueAccess: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentAccessSchema, resolveScope })
    .mutation(({ ctx, input }) => resolveUpload(input.organizationId, () => issueWorkspaceDocumentAccess(input, { supabase: ctx.supabase }))),
  prepareUpload: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentUploadPreparationSchema, resolveScope })
    .mutation(({ ctx, input }) => resolveUpload(input.organizationId, () => prepareWorkspaceDocumentUpload(input, { supabase: ctx.supabase }))),
  completeUpload: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentUploadCompletionSchema, resolveScope })
    .mutation(({ ctx, input }) => resolveUpload(input.organizationId, () => completeWorkspaceDocumentUpload(input, { supabase: ctx.supabase }))),
  list: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentListSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getWorkspaceDocuments(input, { supabase: ctx.supabase }))),
  versions: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentVersionsSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getWorkspaceDocumentVersions(input, { supabase: ctx.supabase }))),
  history: permissionProcedure({ permission: "workspace.access", input: workspaceDocumentHistorySchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getWorkspaceDocumentHistory(input, { supabase: ctx.supabase }))),
});
