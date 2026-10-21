"use server";

import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { authorizePermission } from "@/server/auth/authorization";
import { organizationContextCookie } from "@/server/auth/page-guards";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { securityUuidSchema } from "@/server/audit/security-values";

/** Selects an existing workspace; every later request still rechecks its authority. */
export async function selectOrganizationAction(formData: FormData): Promise<void> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const values = formData.getAll("organizationId");
  const parsed = securityUuidSchema.safeParse(values.length === 1 ? values[0] : null);
  if (!parsed.success || parsed.data === "00000000-0000-0000-0000-000000000000") forbidden();

  const access = await authorizePermission("workspace.access", {
    kind: "organization", organizationId: parsed.data,
  });
  if (!access) forbidden();

  (await cookies()).set(organizationContextCookie, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  redirect("/home");
}
