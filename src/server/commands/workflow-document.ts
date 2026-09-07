import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { documentId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const workflowDocumentSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("upload"), ...base, versionId: uuid.optional(), version: z.number().int().min(1).max(1000), documentType: z.enum(["rfp","response","proposal","contract","attachment","other"]), sha256: z.string().regex(/^[0-9a-fA-F]{64}$/), storageReference: z.string().regex(/^quarantine:\/\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/), contentType: z.enum(["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","text/plain"]), byteSize: z.number().int().min(1).max(26214400) }),
  z.strictObject({ action: z.literal("scan"), ...base, versionId: uuid, scanState: z.enum(["clean","quarantined","failed"]) }),
  z.strictObject({ action: z.literal("approve"), ...base, versionId: uuid }),
  z.strictObject({ action: z.literal("archive"), ...base }),
]);
const resultSchema = z.strictObject({ documentId: uuid, organizationId: uuid, currentVersion: z.number().int().positive(), state: z.enum(["active","archived"]), versionId: uuid.nullable().optional(), versionState: z.enum(["ready","approved","superseded"]).nullable().optional(), scanState: z.enum(["pending","clean","quarantined","failed"]).nullable().optional(), outcomeCode: z.enum(["recorded","replayed"]), correlationId: uuid });
export async function recordWorkflowDocument(input: unknown, options: AuthorizationOptions = {}) {
  const command = workflowDocumentSchema.safeParse(input); if (!command.success) throw new Error("Invalid document input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_workflow_document", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Document unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.documentId !== command.data.documentId || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid document result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Document unavailable" || error.message === "Invalid document result")) throw error; throw new Error("Document unavailable"); }
}
