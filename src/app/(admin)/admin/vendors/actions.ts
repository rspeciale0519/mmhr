"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { securityUuidSchema } from "@/server/audit/security-values";
import { AuthorizationError } from "@/server/auth/authorization";
import { organizationContextCookie } from "@/server/auth/page-guards";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import {
  createStaffVendor, enableStaffVendorPortal, inviteStaffVendorAdmin, listStaffVendor, openStaffVendorWorkspace,
  StaffVendorError,
} from "@/server/commands/staff-vendors";

export type VendorActionState =
  | { status: "success"; message: string; email?: string; expiresAt?: string }
  | { status: "error"; message: string; field?: "name" | "email" | "reason"; value?: string }
  | null;

/** Shown when listing is refused. The SQL command needs Super Admin authority and AAL2. */
const listRefused ="Listing was refused. Only a Super Admin can list a vendor, and this session needs two-step sign-in. Set it up at /mfa, sign in again, then reload to check that the vendor is still not listed.";

const refused = "This action was refused. You need staff access with two-step sign-in, and the vendor must be pending or active. Reload the page to check its state.";
const uncertain = "We could not confirm the result. Submit the same form again, or reload the page to check the saved state.";
const invalid = "Check the field and try again.";

function single(formData: FormData, name: string) {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function key(formData: FormData, name: string) {
  const parsed = securityUuidSchema.safeParse(single(formData, name));
  return parsed.success && parsed.data !== "00000000-0000-0000-0000-000000000000" ? parsed.data : null;
}

function failure(error: unknown, conflict: string, field?: "name" | "email", value?: string): VendorActionState {
  if (error instanceof AuthorizationError) return { status: "error", message: refused };
  if (error instanceof StaffVendorError && error.code === "CONFLICT") return { status: "error", message: conflict, field, value };
  if (error instanceof StaffVendorError && error.code === "INVALID_INPUT") return { status: "error", message: invalid, field, value };
  return { status: "error", message: uncertain, field, value };
}

/** Adds a pending vendor organization and its vendor profile. */
export async function createVendorAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const name = single(formData, "name") ?? "";
  const idempotencyKey = key(formData, "idempotencyKey");
  if (!idempotencyKey) return { status: "error", message: uncertain, field: "name", value: name };
  if (name.trim().length === 0 || name.trim().length > 200) {
    return { status: "error", message: "Enter a vendor name of 1 to 200 characters.", field: "name", value: name };
  }
  try {
    await createStaffVendor({ name, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    return failure(error, "A vendor with this name already exists. Use the existing vendor in the list.", "name", name);
  }
  revalidatePath("/admin/vendors");
  return { status: "success", message: `${name.trim()} was added. List it for customer comparisons, then open its workspace to add products.` };
}

/** Turns on the vendor portal for one vendor organization. */
export async function enableVendorPortalAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const organizationId = key(formData, "organizationId");
  const idempotencyKey = key(formData, "idempotencyKey");
  if (!organizationId || !idempotencyKey) return { status: "error", message: uncertain };
  try {
    await enableStaffVendorPortal({ organizationId, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    return failure(error, uncertain);
  }
  revalidatePath("/admin/vendors");
  return { status: "success", message: "The vendor portal is on." };
}

/** Invites the first organization administrator. No email is sent. */
export async function inviteVendorAdminAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const organizationId = key(formData, "organizationId");
  const idempotencyKey = key(formData, "idempotencyKey");
  const email = single(formData, "email") ?? "";
  if (!organizationId || !idempotencyKey) return { status: "error", message: uncertain, field: "email", value: email };
  let result;
  try {
    result = await inviteStaffVendorAdmin({ organizationId, email, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    if (error instanceof StaffVendorError && error.code === "INVALID_INPUT") {
      return { status: "error", message: "Enter a valid email address, for example name@company.com.", field: "email", value: email };
    }
    return failure(error, "This person is already a member of this vendor.", "email", email);
  }
  revalidatePath("/admin/vendors");
  return {
    status: "success",
    message: result.outcomeCode === "existing" ? "This person already has a pending invitation." : "Invitation saved. No email was sent.",
    email: result.email, expiresAt: result.expiresAt,
  };
}

/** Lists one pending vendor for customer comparisons. Super Admin with two-step sign-in only. */
export async function listVendorAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const organizationId = key(formData, "organizationId");
  const idempotencyKey = key(formData, "idempotencyKey");
  const reason = single(formData, "reason") ?? "";
  if (!organizationId || !idempotencyKey) return { status: "error", message: uncertain, field: "reason", value: reason };
  if (reason.trim().length === 0 || reason.trim().length > 500) {
    return { status: "error", message: "Enter a reason of 1 to 500 characters.", field: "reason", value: reason };
  }
  try {
    await listStaffVendor({ organizationId, reason, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    if (error instanceof AuthorizationError) return { status: "error", message: listRefused, field: "reason", value: reason };
    if (error instanceof StaffVendorError && error.code === "INVALID_INPUT") {
      return { status: "error", message: "Use plain text for the reason, without tokens or keys.", field: "reason", value: reason };
    }
    return { status: "error", message: uncertain, field: "reason", value: reason };
  }
  revalidatePath("/admin/vendors");
  return { status: "success", message: "The vendor is listed. Customer comparisons can use its approved products." };
}

/** Opens the vendor workspace for the verified staff caller, selects it, then shows vendor evidence. */
export async function openVendorWorkspaceAction(formData: FormData): Promise<void> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const organizationId = key(formData, "organizationId");
  const idempotencyKey = key(formData, "idempotencyKey");
  if (!organizationId || !idempotencyKey) forbidden();

  let result;
  try {
    result = await openStaffVendorWorkspace({ organizationId, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/admin/vendors?notice=denied");
    throw error;
  }
  (await cookies()).set(organizationContextCookie, result.organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  redirect("/admin/vendor-evidence");
}
