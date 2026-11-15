import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema as uuid } from "@/server/audit/security-values";

export class StaffSubmissionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Staff submission request failed");
    this.name = "StaffSubmissionError";
  }
}

// securityUuidSchema lowercases every identifier.
const utcTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const cursorSchema = z.strictObject({ submittedAt: utcTime, intakeId: uuid });

export const staffSubmissionQueueInputSchema = z.strictObject({
  after: cursorSchema.optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
});
export const openStaffCaseInputSchema = z.strictObject({
  intakeId: uuid, correlationId: uuid, idempotencyKey: uuid,
});

const itemSchema = z.strictObject({
  intakeId: uuid, organizationId: uuid,
  organizationName: z.string().min(1).max(200),
  status: z.enum(["submitted", "under_review"]),
  submittedAt: utcTime,
  callerHasAccess: z.boolean(),
  staffWithAccess: z.number().int().min(0).max(10_000),
});
const pageSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(itemSchema).max(50),
  nextCursor: cursorSchema.nullable(),
});
const openResultSchema = z.strictObject({
  intakeId: uuid, organizationId: uuid, grantId: uuid.nullable(),
  outcomeCode: z.enum(["opened", "existing", "replayed"]), correlationId: uuid,
});

export type StaffSubmission = z.output<typeof itemSchema>;
export type StaffSubmissionPage = { items: StaffSubmission[]; nextCursor: z.output<typeof cursorSchema> | null };

function databaseError(code: string | undefined): never {
  if (code === "42501") throw new AuthorizationError();
  if (code === "22023") throw new StaffSubmissionError("INVALID_INPUT");
  throw new StaffSubmissionError("UNAVAILABLE");
}

async function staffContext(options: AuthorizationOptions) {
  const context = await requirePermission("admin.access", { kind: "platform" }, options);
  if (context.scope.kind !== "platform" || context.assurance !== "aal2") throw new AuthorizationError();
  return context;
}

/** Lists submitted customer intakes from every customer organization, newest first. */
export async function getStaffSubmissionQueue(
  input: z.input<typeof staffSubmissionQueueInputSchema>, options: AuthorizationOptions = {},
): Promise<StaffSubmissionPage> {
  const parsed = staffSubmissionQueueInputSchema.safeParse(input);
  if (!parsed.success) throw new StaffSubmissionError("INVALID_INPUT");
  const value = parsed.data;
  const context = await staffContext(options);
  const payload = { limit: value.pageSize, ...(value.after ? { after: value.after } : {}) };
  let response;
  try { response = await context.supabase.rpc("mmhr_get_staff_submission_queue", { payload }); }
  catch { throw new StaffSubmissionError("UNAVAILABLE"); }
  if (!response || response.error) databaseError(response?.error?.code);
  const result = pageSchema.safeParse(response.data);
  if (!result.success) throw new StaffSubmissionError("INVALID_RESPONSE");
  const { items, nextCursor } = result.data;
  const last = items.at(-1);
  if (nextCursor && (items.length !== value.pageSize || !last
    || nextCursor.intakeId !== last.intakeId || nextCursor.submittedAt !== last.submittedAt)) {
    throw new StaffSubmissionError("INVALID_RESPONSE");
  }
  return { items, nextCursor };
}

/** Gives the verified staff caller audited access to the intake's customer workspace. */
export async function openStaffCase(input: z.input<typeof openStaffCaseInputSchema>, options: AuthorizationOptions = {}) {
  const parsed = openStaffCaseInputSchema.safeParse(input);
  if (!parsed.success) throw new StaffSubmissionError("INVALID_INPUT");
  const value = parsed.data;
  const context = await staffContext({ ...options, correlationId: value.correlationId });
  let response;
  try {
    response = await context.supabase.rpc("mmhr_open_staff_case", {
      payload: { intakeId: value.intakeId },
      correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
    });
  } catch { throw new StaffSubmissionError("UNAVAILABLE"); }
  if (!response || response.error) databaseError(response?.error?.code);
  const result = openResultSchema.safeParse(response.data);
  if (!result.success || result.data.intakeId !== value.intakeId
    || result.data.correlationId !== value.correlationId) {
    throw new StaffSubmissionError("INVALID_RESPONSE");
  }
  return result.data;
}
