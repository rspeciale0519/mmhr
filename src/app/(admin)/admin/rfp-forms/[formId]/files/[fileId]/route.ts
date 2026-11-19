import { AuthorizationError } from "@/server/auth/authorization";
import { getRfpVendorFormFile, RfpVendorFormError } from "@/server/commands/rfp-vendor-forms";

/**
 * Staff download of one file a vendor uploaded on an RFP form.
 * The command checks staff access with two-step sign-in before any byte is read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ formId: string; fileId: string }> }) {
  const { fileId } = await params;
  try {
    const file = await getRfpVendorFormFile(fileId);
    // Keep the name safe for a header: plain characters only, plus an
    // encoded copy so accents and other letters still show correctly.
    const plainName = file.fileName.replace(/[^A-Za-z0-9._ -]/g, "_");
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        // "attachment" makes the browser save the file instead of opening it
        // inside our site, where a harmful file could do more damage.
        "Content-Disposition": `attachment; filename="${plainName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Do not reveal whether a file exists to someone who may not see it.
    const status = error instanceof AuthorizationError || (error instanceof RfpVendorFormError && error.code === "INVALID_INPUT") ? 404 : 503;
    return Response.json({ error: status === 404 ? "not_found" : "unavailable" }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
