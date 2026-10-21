import { commandInput, type SecuritySql } from "./r1-security-command-fixtures";
import type { SecurityReceipt } from "./r1-security-command-permission-fixtures";

export async function assignPlatformRole(sql: SecuritySql, identityId: string, role: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_assign_platform_role(${identityId}::uuid, ${role}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function revokePlatformRole(sql: SecuritySql, assignmentId: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_revoke_platform_role(${assignmentId}::uuid, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function activateRoleVersion(sql: SecuritySql, roleId: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_activate_role_version(${roleId}::uuid, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function changeOrganizationStatus(sql: SecuritySql, organizationId: string, status: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_change_organization_status(${organizationId}::uuid, ${status}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function changeOrganizationType(sql: SecuritySql, organizationId: string, type: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_change_organization_type(${organizationId}::uuid, ${type}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function changeMembershipRole(
  sql: SecuritySql, organizationId: string, membershipId: string, role: string, input = commandInput(),
) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_change_membership_role(${organizationId}::uuid, ${membershipId}::uuid, ${role},
      ${input.reason}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function grantPortalAccess(sql: SecuritySql, organizationId: string, portal: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_grant_portal_access(${organizationId}::uuid, ${portal}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function revokePortalAccess(sql: SecuritySql, organizationId: string, grantId: string, input = commandInput()) {
  const [row] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_revoke_portal_access(${organizationId}::uuid, ${grantId}::uuid, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid) AS receipt
  `;
  return row!.receipt;
}

export async function prepareRoleVersion(
  sql: SecuritySql,
  stableKey: string,
  omittedPermission: string | null = null,
  deniedPermission: string | null = null,
) {
  const [previous] = await sql<{ id: string }[]>`
    SELECT id FROM public.role_definitions WHERE stable_key = ${stableKey} AND state = 'active'
  `;
  const [created] = await sql<{ id: string; version: number }[]>`
    INSERT INTO public.role_definitions (stable_key, version, kind, display_name)
    SELECT ${stableKey}, (SELECT max(version) + 1 FROM public.role_definitions WHERE stable_key = ${stableKey}),
      kind, 'Isolated approved role fixture' FROM public.role_definitions WHERE id = ${previous!.id}::uuid
    RETURNING id, version
  `;
  await sql`
    INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
    SELECT ${created!.id}::uuid, permission_key, effect FROM public.role_permission_defaults
    WHERE role_definition_id = ${previous!.id}::uuid
      AND (${omittedPermission}::text IS NULL OR permission_key <> ${omittedPermission})
  `;
  if (deniedPermission) {
    await sql`INSERT INTO public.role_permission_defaults (role_definition_id, permission_key, effect)
      VALUES (${created!.id}::uuid, ${deniedPermission}, 'deny')`;
  }
  await sql`UPDATE public.role_definitions SET state = 'approved', approved_at = clock_timestamp()
    WHERE id = ${created!.id}::uuid`;
  return { id: created!.id, version: created!.version, previousId: previous!.id };
}
