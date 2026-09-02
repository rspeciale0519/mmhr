import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { workspaceStages } from "@/server/matching/workspace-contract";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const workspaceViewSchema = z.strictObject({ workspaceId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid });
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);
const resultSchema = z.strictObject({ workspaceId: uuid, organizationId: uuid, intakeId: uuid, stage: z.enum(workspaceStages), candidateIds: z.array(reference).max(10_000), openTaskIds: z.array(uuid).max(10_000), approvalIds: z.array(uuid).max(10_000), upcomingEventReferences: z.array(reference).max(100), recentActivityIds: z.array(uuid).max(100), capturedAt: z.iso.datetime({ offset: true }), revision: z.number().int().positive(), correlationId: uuid });
export type WorkspaceView = z.infer<typeof resultSchema>;

export async function getWorkspaceView(input: unknown, options: AuthorizationOptions = {}): Promise<WorkspaceView> {
  const parsed = workspaceViewSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid workspace snapshot input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_get_workspace_snapshot", { payload: command });
    if (response.error) throw new Error("Workspace snapshot unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.workspaceId !== command.workspaceId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid workspace snapshot response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Workspace snapshot unavailable" || error.message === "Invalid workspace snapshot response")) throw error;
    throw new Error("Workspace snapshot unavailable");
  }
}
