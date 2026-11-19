import { RFP_UPLOAD_MAX_BYTES } from "@/lib/rfp-vendor-form";
import { hasTrustedMutationOrigin } from "@/server/auth/server-action-request";
import { addPublicRfpFile } from "@/server/commands/rfp-vendor-form-public";

/**
 * Upload endpoint for the vendor's RFP web form.
 *
 * The form posts one file here at a time. The vendor is not signed in: the
 * private link token in the address decides which form receives the file.
 * The file's size and real type are checked before anything is stored.
 */

/** Never let a browser or proxy keep a copy of these answers. */
const noStore = { "Cache-Control": "no-store" };

function answer(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: noStore });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // Only our own pages may post here.
  if (!hasTrustedMutationOrigin(request.headers.get("origin"))) return answer({ error: "request_rejected" }, 403);

  // Refuse oversized requests early, before reading the body. The extra
  // 64 KB allows for the form fields that travel with the file.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > RFP_UPLOAD_MAX_BYTES + 64 * 1024) return answer({ error: "too_large" }, 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return answer({ error: "invalid" }, 400); }
  const file = form.get("file");
  const documentKey = form.get("documentKey");
  if (!(file instanceof File) || typeof documentKey !== "string") return answer({ error: "invalid" }, 400);
  if (file.size > RFP_UPLOAD_MAX_BYTES) return answer({ error: "too_large" }, 413);

  const { token } = await params;
  const result = await addPublicRfpFile(token, {
    documentKey, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (result.ok) return answer({ stored: true }, 200);
  // Map each reason to the closest standard status code.
  const status = result.reason === "invalid" ? 400 : result.reason === "unavailable" ? 503 : 409;
  return answer({ error: result.reason }, status);
}
