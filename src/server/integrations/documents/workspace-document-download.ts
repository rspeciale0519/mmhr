import "server-only";
import { createHash } from "node:crypto";
import { workspaceDocumentAccessResolveSchema } from "@/lib/workspace-document-review";
import { resolveWorkspaceDocumentAccess } from "@/server/commands/workspace-document-review";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { inspectDocumentBytes } from "@/server/workflows/document-bytes";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";

/** Never uses a service key. Recheck authority after fetching immutable bytes. */
export async function downloadWorkspaceDocument(value: unknown, options: AuthorizationOptions = {}) {
  const input = workspaceDocumentAccessResolveSchema.parse(value);
  const context = await requirePermission("workspace.access", { kind: "organization", organizationId: input.organizationId },
    { ...options, correlationId: input.correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== input.organizationId || context.correlationId !== input.correlationId) {
    throw new AuthorizationError();
  }
  const scopedOptions = { supabase: context.supabase };
  const manifest = await resolveWorkspaceDocumentAccess(input, scopedOptions);
  const path = `${manifest.organizationId}/${manifest.documentId}/${manifest.versionId}`;
  const response = await context.supabase.storage.from(DOCUMENT_QUARANTINE_BUCKET).download(path)
    .catch(() => { throw new Error("Document request failed"); });
  if (response.error || !response.data || response.data.size !== manifest.byteSize) throw new Error("Document request failed");
  const bytes = new Uint8Array(await response.data.arrayBuffer().catch(() => { throw new Error("Document request failed"); }));
  if (bytes.byteLength !== manifest.byteSize || createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
    || !inspectDocumentBytes({ fileName: manifest.fileName, declaredMimeType: manifest.contentType }, bytes).ok) {
    throw new Error("Document request failed");
  }
  const current = await resolveWorkspaceDocumentAccess(input, scopedOptions);
  if (JSON.stringify(current) !== JSON.stringify(manifest)) throw new Error("Document request failed");
  return Object.freeze({ manifest, bytes });
}
