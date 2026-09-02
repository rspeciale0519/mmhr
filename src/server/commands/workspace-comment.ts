import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const workspaceCommentSchema = z.strictObject({ commentId: uuid, workspaceId: uuid, organizationId: uuid, actorIdentityId: uuid, visibility: z.enum(["customer", "internal"]), body: z.string().trim().min(1).max(5_000), correlationId: uuid, idempotencyKey: uuid });
const resultSchema = z.strictObject({ commentId: uuid, workspaceId: uuid, organizationId: uuid, authorIdentityId: uuid, visibility: z.enum(["customer", "internal"]), body: z.string().min(1).max(5_000), createdAt: z.iso.datetime({ offset: true }), correlationId: uuid });
export type WorkspaceCommentResult = z.infer<typeof resultSchema>;

export async function addWorkspaceComment(input: unknown, options: AuthorizationOptions = {}): Promise<WorkspaceCommentResult> {
  const parsed = workspaceCommentSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid workspace comment input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_add_workspace_comment", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("Workspace comment unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.commentId !== command.commentId || result.data.workspaceId !== command.workspaceId || result.data.organizationId !== command.organizationId || result.data.authorIdentityId !== command.actorIdentityId || result.data.correlationId !== command.correlationId) throw new Error("Invalid workspace comment response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Workspace comment unavailable" || error.message === "Invalid workspace comment response")) throw error;
    throw new Error("Workspace comment unavailable");
  }
}
