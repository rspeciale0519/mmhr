"use server";

import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { securityUuidSchema } from "@/server/audit/security-values";
import { selectWorkspace, workspaceLandingPath } from "@/server/auth/workspace-entry";

/** Selects an existing workspace; every later request still rechecks its authority. */
export async function selectOrganizationAction(formData: FormData): Promise<void> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const values = formData.getAll("organizationId");
  const parsed = securityUuidSchema.safeParse(values.length === 1 ? values[0] : null);
  if (!parsed.success || parsed.data === "00000000-0000-0000-0000-000000000000") forbidden();

  if (!await selectWorkspace(parsed.data)) forbidden();
  redirect(await workspaceLandingPath(parsed.data));
}
