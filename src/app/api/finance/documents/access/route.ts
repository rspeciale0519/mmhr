import { randomUUID } from "node:crypto";
import { financeDocumentAccessResolveSchema } from "@/lib/finance-document-review";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { hasTrustedMutationOrigin } from "@/server/auth/server-action-request";
import { downloadFinanceDocument } from "@/server/integrations/documents/finance-document-download";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) throw new Error("Invalid request");
  if (!request.body) throw new Error("Invalid request");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 2048) { await reader.cancel(); throw new Error("Invalid request"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** POST keeps access tokens out of URLs, browser history, and referrers. */
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Document request failed" }, { status: 403, headers: privateHeaders });
  }
  try {
    const organizationId = await readSelectedOrganizationId();
    if (!organizationId) throw new AuthorizationError();
    const correlationId = randomUUID();
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId }, { correlationId });
    const input = financeDocumentAccessResolveSchema.parse(await boundedJson(request));
    if (input.organizationId !== organizationId) throw new AuthorizationError();
    const { manifest, bytes } = await downloadFinanceDocument({ ...input, correlationId }, { supabase: context.supabase });
    const encodedName = encodeURIComponent(manifest.fileName).replace(/['()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(bytes, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength),
      "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodedName}` } });
  } catch {
    return Response.json({ error: "Document request failed" }, { status: 404, headers: privateHeaders });
  }
}
