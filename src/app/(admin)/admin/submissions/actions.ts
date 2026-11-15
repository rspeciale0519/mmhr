"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { AuthorizationError } from "@/server/auth/authorization";
import { organizationContextCookie } from "@/server/auth/page-guards";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { securityUuidSchema } from "@/server/audit/security-values";
import { openStaffCase } from "@/server/commands/staff-submissions";

function single(formData: FormData, name: string) {
  const values = formData.getAll(name);
  const parsed = securityUuidSchema.safeParse(values.length === 1 ? values[0] : null);
  return parsed.success && parsed.data !== "00000000-0000-0000-0000-000000000000" ? parsed.data : null;
}

/** Opens the case for the verified staff caller, selects its workspace, then shows the review. */
export async function openStaffCaseAction(formData: FormData): Promise<void> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const intakeId = single(formData, "intakeId");
  const idempotencyKey = single(formData, "idempotencyKey");
  if (!intakeId || !idempotencyKey) forbidden();

  let result;
  try {
    result = await openStaffCase({ intakeId, idempotencyKey, correlationId: randomUUID() });
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/admin/submissions?notice=denied");
    throw error;
  }
  (await cookies()).set(organizationContextCookie, result.organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  redirect(`/admin/evaluations?intake=${result.intakeId}`);
}
