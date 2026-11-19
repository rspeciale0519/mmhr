import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rfpQuestionKeys } from "@/lib/rfp-form-library";
import { RFP_DOCUMENT_KEYS, RFP_UPLOAD_MAX_BYTES, RFP_UPLOAD_TYPES, rfpAnswerSchema, type RfpAnswers } from "@/lib/rfp-vendor-form";
import { isRfpFormToken, rfpFormTokenHash } from "@/server/workflows/rfp-vendor-form-link";

/**
 * Vendor commands for the RFP web form. The vendor is NOT signed in.
 *
 * The private link token is the only key. Each function turns the token
 * into its hash and hands that to a SQL function from migration 0180, which
 * finds the one form it belongs to. A wrong or unknown token finds nothing.
 */

/** Any Supabase client. Tests pass a fake one. */
type Client = Pick<Awaited<ReturnType<typeof createClient>>, "rpc">;
export type PublicFormOptions = { supabase?: Client };

const date = z.iso.datetime({ offset: true });
const publicFileSchema = z.strictObject({
  fileId: z.uuid(), documentKey: z.string(), fileName: z.string(), byteSize: z.number().int().positive(), uploadedAt: date,
});

/** Everything the form page needs to draw itself. */
const publicFormSchema = z.strictObject({
  state: z.enum(["sent", "submitted", "replied", "declined", "no_response"]),
  editable: z.boolean(), dueAt: date, submittedAt: date.nullable(), vendorName: z.string(),
  rfpTitle: z.string(), rfpIntroduction: z.string(), clientOverview: z.record(z.string(), z.string()),
  tabKeys: z.array(z.string()), libraryVersion: z.number().int().positive(),
  answers: z.record(z.string(), rfpAnswerSchema), respondentName: z.string().nullable(), respondentEmail: z.string().nullable(),
  files: z.array(publicFileSchema),
});
export type PublicRfpForm = z.output<typeof publicFormSchema>;

/** Runs one vendor SQL function. Returns null on any failure. */
async function call(name: string, args: Record<string, unknown>, options: PublicFormOptions): Promise<unknown | null> {
  try {
    const supabase = options.supabase ?? await createClient();
    const response = await supabase.rpc(name, args);
    return response.error ? null : (response.data as unknown);
  } catch {
    return null;
  }
}

/** Loads the form for a link. Returns null when the link is not valid. */
export async function readPublicRfpForm(token: string, options: PublicFormOptions = {}): Promise<PublicRfpForm | null> {
  if (!isRfpFormToken(token)) return null;
  const parsed = publicFormSchema.safeParse(await call("mmhr_vendor_rfp_form_read", { p_token_hash: rfpFormTokenHash(token) }, options));
  return parsed.success ? parsed.data : null;
}

/** What a save, submit, or upload ended as. */
export type PublicFormResult = { ok: true } | { ok: false; reason: "invalid" | "locked" | "unavailable" | "too_many" };

/**
 * Saves some answers. `tabKeys` are the tabs on this vendor's form: an
 * answer for a question that is not on the form is refused.
 */
export async function savePublicRfpAnswers(
  token: string, answers: unknown, tabKeys: readonly string[], options: PublicFormOptions = {},
): Promise<PublicFormResult> {
  const parsed = z.record(z.string(), rfpAnswerSchema).safeParse(answers);
  if (!isRfpFormToken(token) || !parsed.success) return { ok: false, reason: "invalid" };
  const allowed = new Set(rfpQuestionKeys(tabKeys));
  const entries = Object.entries(parsed.data);
  if (entries.length === 0 || entries.some(([key]) => !allowed.has(key))) return { ok: false, reason: "invalid" };
  // Store an empty comment as "no comment" (null), not as an empty string.
  const clean: RfpAnswers = Object.fromEntries(entries.map(([key, item]) =>
    [key, { answer: item.answer, comment: item.comment?.trim() ? item.comment : null }]));
  const result = z.strictObject({ saved: z.boolean(), state: z.string() }).safeParse(
    await call("mmhr_vendor_rfp_form_save", { p_token_hash: rfpFormTokenHash(token), p_answers: clean }, options));
  if (!result.success) return { ok: false, reason: "unavailable" };
  return result.data.saved ? { ok: true } : { ok: false, reason: "locked" };
}

const submitSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
});

/** Submits the form. After this the vendor can read it but not change it. */
export async function submitPublicRfpForm(token: string, input: unknown, options: PublicFormOptions = {}): Promise<PublicFormResult> {
  const parsed = submitSchema.safeParse(input);
  if (!isRfpFormToken(token) || !parsed.success) return { ok: false, reason: "invalid" };
  const result = z.strictObject({ submitted: z.boolean(), state: z.string() }).safeParse(await call("mmhr_vendor_rfp_form_submit",
    { p_token_hash: rfpFormTokenHash(token), p_name: parsed.data.name, p_email: parsed.data.email }, options));
  if (!result.success) return { ok: false, reason: "unavailable" };
  return result.data.submitted ? { ok: true } : { ok: false, reason: "locked" };
}

/**
 * Checks that a file really is what its name says.
 * Every file type starts with a known "signature" (its first bytes). A PDF
 * starts with "%PDF", Office files are ZIP archives starting with "PK", and
 * so on. A renamed program would fail this check.
 */
export function detectUploadType(fileName: string, bytes: Uint8Array): string | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const type = RFP_UPLOAD_TYPES[extension];
  if (!type) return null;
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const matches =
    extension === "pdf" ? starts(0x25, 0x50, 0x44, 0x46) // %PDF
    : extension === "png" ? starts(0x89, 0x50, 0x4e, 0x47) // .PNG
    : extension === "jpg" || extension === "jpeg" ? starts(0xff, 0xd8, 0xff)
    : starts(0x50, 0x4b, 0x03, 0x04); // PK.. (docx, xlsx, pptx are ZIP files)
  return matches ? type : null;
}

/** Stores one uploaded document on the vendor's form. */
export async function addPublicRfpFile(
  token: string, input: { documentKey: string; fileName: string; bytes: Uint8Array }, options: PublicFormOptions = {},
): Promise<PublicFormResult> {
  // Keep only the last part of the name and drop characters the database refuses.
  const fileName = (input.fileName.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  if (!isRfpFormToken(token) || !RFP_DOCUMENT_KEYS.includes(input.documentKey) || fileName.length === 0
    || input.bytes.byteLength === 0 || input.bytes.byteLength > RFP_UPLOAD_MAX_BYTES) return { ok: false, reason: "invalid" };
  const contentType = detectUploadType(fileName, input.bytes);
  if (!contentType) return { ok: false, reason: "invalid" };
  const result = z.object({ stored: z.boolean(), reason: z.string().optional() }).safeParse(await call("mmhr_vendor_rfp_form_file_add", {
    p_token_hash: rfpFormTokenHash(token), p_document_key: input.documentKey, p_file_name: fileName,
    p_content_type: contentType, p_content_base64: Buffer.from(input.bytes).toString("base64"),
  }, options));
  if (!result.success) return { ok: false, reason: "unavailable" };
  if (result.data.stored) return { ok: true };
  return { ok: false, reason: result.data.reason === "too_many" ? "too_many" : "locked" };
}

/** Removes one uploaded document while the form is still open. */
export async function removePublicRfpFile(token: string, fileId: string, options: PublicFormOptions = {}): Promise<PublicFormResult> {
  if (!isRfpFormToken(token) || !z.uuid().safeParse(fileId).success) return { ok: false, reason: "invalid" };
  const result = z.object({ removed: z.boolean() }).safeParse(
    await call("mmhr_vendor_rfp_form_file_remove", { p_token_hash: rfpFormTokenHash(token), p_file_id: fileId }, options));
  if (!result.success) return { ok: false, reason: "unavailable" };
  return result.data.removed ? { ok: true } : { ok: false, reason: "locked" };
}
