import "server-only";
import { z } from "zod";
import { workspaceDocumentUploadPreparationSchema } from "@/lib/workspace-document-upload";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const reservationResult = z.strictObject({ organizationId: uuid, documentId: uuid, versionId: uuid,
  version: z.number().int().min(1).max(100_000), state: z.literal("received"), revision: z.literal(1),
  correlationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]),
});

/** A manifest is untrusted. Reservation never certifies bytes, scan results, or approval. */
export async function prepareWorkspaceDocumentUpload(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentUploadPreparationSchema.parse(value);
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { ...options, correlationId: input.correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId
    || context.correlationId !== input.correlationId) throw new AuthorizationError();
  const { correlationId, idempotencyKey, declaredMimeType, ...manifest } = input;
  const response = await context.supabase.rpc("mmhr_reserve_workspace_document", {
    payload: { ...manifest, contentType: declaredMimeType }, correlation_id: correlationId, idempotency_key: idempotencyKey,
  });
  if (response.error?.code === "42501") throw new AuthorizationError();
  if (response.error) throw new Error("Document preparation failed");
  const parsed = reservationResult.safeParse(response.data);
  if (!parsed.success || parsed.data.organizationId !== input.organizationId || parsed.data.documentId !== input.documentId
    || parsed.data.versionId !== input.versionId || parsed.data.correlationId !== correlationId
    || parsed.data.version !== input.expectedVersion + 1) throw new Error("Invalid document preparation result");
  return parsed.data;
}
