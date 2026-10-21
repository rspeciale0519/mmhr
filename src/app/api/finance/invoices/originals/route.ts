import { managedInvoiceOriginalRequestSchema } from "@/lib/managed-invoice-original";
import { AuthorizationError } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { hasTrustedMutationOrigin } from "@/server/auth/server-action-request";
import { downloadManagedInvoiceOriginal, ManagedInvoiceOriginalAccessExpiredError } from "@/server/commands/managed-invoice-original";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || !request.body) throw new Error("Invalid request");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 2048) { await reader.cancel(); throw new Error("Invalid request"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "Invoice original request failed" }, { status: 403, headers: privateHeaders });
  }
  try {
    const organizationId = await readSelectedOrganizationId();
    if (!organizationId) throw new AuthorizationError();
    const input = managedInvoiceOriginalRequestSchema.parse(await boundedJson(request));
    if (input.organizationId !== organizationId) throw new AuthorizationError();
    const { manifest, bytes, reviewedAccessId } = await downloadManagedInvoiceOriginal(input);
    if (await readSelectedOrganizationId() !== organizationId) throw new AuthorizationError();
    const encodedName = encodeURIComponent(manifest.fileName).replace(/['()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(bytes, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength),
      "Content-Security-Policy": "sandbox; default-src 'none'", "X-MMHR-Reviewed-Access-Id": reviewedAccessId,
      "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodedName}` } });
  } catch (error) {
    return Response.json({ error: "Invoice original request failed" }, {
      status: error instanceof ManagedInvoiceOriginalAccessExpiredError ? 410 : 404, headers: privateHeaders });
  }
}
