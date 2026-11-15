import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema as uuid } from "@/server/audit/security-values";

export class StaffVendorError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Staff vendor request failed");
    this.name = "StaffVendorError";
  }
}

const utcTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
// Same rule as the SQL command: trimmed, 1 to 200 characters, no control characters.
const vendorName = z.string().trim().min(1).max(200).refine((value) => !/\p{Cc}/u.test(value));
// Same rule as mmhr_create_invitation and the staff invite RPC.
const inviteEmail = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

export const createStaffVendorInputSchema = z.strictObject({
  name: vendorName, correlationId: uuid, idempotencyKey: uuid,
});
export const enableStaffVendorPortalInputSchema = z.strictObject({
  organizationId: uuid, correlationId: uuid, idempotencyKey: uuid,
});
export const inviteStaffVendorAdminInputSchema = z.strictObject({
  organizationId: uuid, email: inviteEmail, correlationId: uuid, idempotencyKey: uuid,
});

const invitationSchema = z.strictObject({
  invitationId: uuid, email: z.string().min(3).max(254), expiresAt: utcTime, expired: z.boolean(),
});
const vendorSchema = z.strictObject({
  organizationId: uuid,
  name: z.string().min(1).max(200),
  status: z.enum(["pending", "active", "suspended"]),
  profileStatus: z.enum(["prospect", "active", "paused", "archived"]).nullable(),
  portalOn: z.boolean(),
  activeMembers: z.number().int().min(0).max(100_000),
  pendingInvitations: z.array(invitationSchema).max(20),
});
const directorySchema = z.strictObject({
  version: z.literal(1), items: z.array(vendorSchema).max(200), truncated: z.boolean(),
});
const createResultSchema = z.strictObject({
  organizationId: uuid, profileId: uuid, outcomeCode: z.enum(["created", "replayed"]), correlationId: uuid,
});
const portalResultSchema = z.strictObject({
  organizationId: uuid, grantId: uuid, outcomeCode: z.enum(["enabled", "existing", "replayed"]), correlationId: uuid,
});
const inviteResultSchema = z.strictObject({
  organizationId: uuid, invitationId: uuid, email: z.string().min(3).max(254), expiresAt: utcTime,
  outcomeCode: z.enum(["invited", "existing", "replayed"]), correlationId: uuid,
});

export type StaffVendor = z.output<typeof vendorSchema>;
export type StaffVendorDirectory = { items: StaffVendor[]; truncated: boolean };

function databaseError(code: string | undefined): never {
  if (code === "42501") throw new AuthorizationError();
  if (code === "22023") throw new StaffVendorError("INVALID_INPUT");
  if (code === "23505") throw new StaffVendorError("CONFLICT");
  throw new StaffVendorError("UNAVAILABLE");
}

async function staffContext(options: AuthorizationOptions) {
  const context = await requirePermission("admin.access", { kind: "platform" }, options);
  if (context.scope.kind !== "platform" || context.assurance !== "aal2") throw new AuthorizationError();
  return context;
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, options: AuthorizationOptions) {
  const context = await staffContext(options);
  let response;
  try { response = await context.supabase.rpc(name, args); }
  catch { throw new StaffVendorError("UNAVAILABLE"); }
  if (!response || response.error) databaseError(response?.error?.code);
  const result = schema.safeParse(response.data);
  if (!result.success) throw new StaffVendorError("INVALID_RESPONSE");
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new StaffVendorError("INVALID_INPUT");
  return parsed.data;
}

/** Lists vendor organizations with portal, member, and pending invitation state. */
export async function getStaffVendorDirectory(options: AuthorizationOptions = {}): Promise<StaffVendorDirectory> {
  const { items, truncated } = await call("mmhr_get_staff_vendor_directory", { payload: {} }, directorySchema, options);
  return { items, truncated };
}

/** Adds a pending vendor organization with its prospect vendor profile. */
export async function createStaffVendor(input: z.input<typeof createStaffVendorInputSchema>, options: AuthorizationOptions = {}) {
  const value = parse(createStaffVendorInputSchema, input);
  const result = await call("mmhr_create_staff_vendor", {
    payload: { name: value.name }, correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
  }, createResultSchema, { ...options, correlationId: value.correlationId });
  if (result.correlationId !== value.correlationId) throw new StaffVendorError("INVALID_RESPONSE");
  return result;
}

/** Turns on the vendor portal for one vendor organization. */
export async function enableStaffVendorPortal(
  input: z.input<typeof enableStaffVendorPortalInputSchema>, options: AuthorizationOptions = {},
) {
  const value = parse(enableStaffVendorPortalInputSchema, input);
  const result = await call("mmhr_enable_staff_vendor_portal", {
    payload: { organizationId: value.organizationId },
    correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
  }, portalResultSchema, { ...options, correlationId: value.correlationId });
  if (result.organizationId !== value.organizationId || result.correlationId !== value.correlationId) {
    throw new StaffVendorError("INVALID_RESPONSE");
  }
  return result;
}

/** Invites one organization administrator. No email is sent. */
export async function inviteStaffVendorAdmin(
  input: z.input<typeof inviteStaffVendorAdminInputSchema>, options: AuthorizationOptions = {},
) {
  const value = parse(inviteStaffVendorAdminInputSchema, input);
  const result = await call("mmhr_invite_staff_vendor_admin", {
    payload: { organizationId: value.organizationId, email: value.email },
    correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
  }, inviteResultSchema, { ...options, correlationId: value.correlationId });
  if (result.organizationId !== value.organizationId || result.email !== value.email
    || result.correlationId !== value.correlationId) {
    throw new StaffVendorError("INVALID_RESPONSE");
  }
  return result;
}
