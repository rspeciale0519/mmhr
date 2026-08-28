import type { RehearsalContext } from "./r1-migration-rehearsal";
import { insertLegacyAuthUser } from "./r1-migration-rehearsal";

type Timestamp = Date | string;

type AuthUserRow = {
  id: string;
  instance_id: string;
  aud: string;
  role: string;
  email: string;
  encrypted_password: string;
  email_confirmed_at: Timestamp | null;
  raw_app_meta_data: unknown;
  raw_user_meta_data: unknown;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: Timestamp;
};

type MemberRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  created_at: Timestamp;
};

type InvitationRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  created_at: Timestamp;
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: Timestamp;
};

type LeadRow = {
  id: string;
  full_name: string;
  company: string;
  work_email: string;
  phone: string;
  source: string | null;
  status: string;
  consent_at: Timestamp;
  created_at: Timestamp;
};

export type LegacySnapshot = {
  authUsers: AuthUserRow[];
  organizations: OrganizationRow[];
  members: MemberRow[];
  invitations: InvitationRow[];
  auditRows: AuditRow[];
  leads: LeadRow[];
};

function timestamp(value: Timestamp | null) {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

export async function seedLegacySnapshot(context: RehearsalContext) {
  const createdAt = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const expiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const userId = await insertLegacyAuthUser(
    context,
    "rollback@example.com",
  );
  await context.client`
    UPDATE auth.users
    SET
      email_confirmed_at = ${createdAt},
      created_at = ${createdAt},
      updated_at = ${createdAt}
    WHERE id = ${userId}
  `;

  const [organization] = await context.client<{ id: string }[]>`
    INSERT INTO orgs (name, created_at)
    VALUES ('Rollback Organization', ${createdAt})
    RETURNING id
  `;
  await context.client`
    INSERT INTO org_members (org_id, user_id, created_at)
    VALUES (${organization!.id}, ${userId}, ${createdAt})
  `;
  await context.client`
    INSERT INTO invitations (
      org_id, email, expires_at, created_at
    )
    VALUES (
      ${organization!.id},
      'rollback-invite@example.com',
      ${expiresAt},
      ${createdAt}
    )
  `;
  await context.client`
    INSERT INTO audit_log (
      actor_id, action, entity, entity_id, before, after, created_at
    )
    VALUES (
      ${userId},
      'legacy.rollback',
      'organization',
      ${organization!.id},
      '{"status":"old"}'::jsonb,
      '{"status":"new"}'::jsonb,
      ${createdAt}
    )
  `;
  await context.client`
    INSERT INTO leads (
      full_name,
      company,
      work_email,
      phone,
      source,
      status,
      consent_at,
      created_at
    )
    VALUES (
      'Rollback Lead',
      'Rollback Company',
      'rollback-lead@example.com',
      '555-0101',
      'rollback-test',
      'qualified',
      ${createdAt},
      ${createdAt}
    )
  `;
}

export async function captureLegacySnapshot(
  context: RehearsalContext,
): Promise<LegacySnapshot> {
  const authUsers = await context.client<AuthUserRow[]>`
    SELECT
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    FROM auth.users
    ORDER BY id
  `;
  const organizations = await context.client<OrganizationRow[]>`
    SELECT id, name, created_at FROM orgs ORDER BY id
  `;
  const members = await context.client<MemberRow[]>`
    SELECT id, org_id, user_id, role, created_at
    FROM org_members
    ORDER BY id
  `;
  const invitations = await context.client<InvitationRow[]>`
    SELECT id, org_id, email, role, token, expires_at, accepted_at, created_at
    FROM invitations
    ORDER BY id
  `;
  const auditRows = await context.client<AuditRow[]>`
    SELECT id, actor_id, action, entity, entity_id, before, after, created_at
    FROM audit_log
    ORDER BY id
  `;
  const leads = await context.client<LeadRow[]>`
    SELECT
      id,
      full_name,
      company,
      work_email,
      phone,
      source,
      status,
      consent_at,
      created_at
    FROM leads
    ORDER BY id
  `;

  return { authUsers, organizations, members, invitations, auditRows, leads };
}

export async function restoreLegacySnapshot(
  context: RehearsalContext,
  snapshot: LegacySnapshot,
) {
  for (const row of snapshot.authUsers) {
    await context.client`
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      VALUES (
        ${row.id},
        ${row.instance_id},
        ${row.aud},
        ${row.role},
        ${row.email},
        ${row.encrypted_password},
        ${timestamp(row.email_confirmed_at)},
        ${json(row.raw_app_meta_data)}::jsonb,
        ${json(row.raw_user_meta_data)}::jsonb,
        ${timestamp(row.created_at)},
        ${timestamp(row.updated_at)}
      )
    `;
  }
  for (const row of snapshot.organizations) {
    await context.client`
      INSERT INTO orgs (id, name, created_at)
      VALUES (${row.id}, ${row.name}, ${timestamp(row.created_at)})
    `;
  }
  for (const row of snapshot.members) {
    await context.client`
      INSERT INTO org_members (id, org_id, user_id, role, created_at)
      VALUES (
        ${row.id},
        ${row.org_id},
        ${row.user_id},
        ${row.role},
        ${timestamp(row.created_at)}
      )
    `;
  }
  for (const row of snapshot.invitations) {
    await context.client`
      INSERT INTO invitations (
        id, org_id, email, role, token, expires_at, accepted_at, created_at
      )
      VALUES (
        ${row.id},
        ${row.org_id},
        ${row.email},
        ${row.role},
        ${row.token},
        ${timestamp(row.expires_at)},
        ${timestamp(row.accepted_at)},
        ${timestamp(row.created_at)}
      )
    `;
  }
  for (const row of snapshot.auditRows) {
    await context.client`
      INSERT INTO audit_log (
        id, actor_id, action, entity, entity_id, before, after, created_at
      )
      VALUES (
        ${row.id},
        ${row.actor_id},
        ${row.action},
        ${row.entity},
        ${row.entity_id},
        ${json(row.before)}::jsonb,
        ${json(row.after)}::jsonb,
        ${timestamp(row.created_at)}
      )
    `;
  }
  for (const row of snapshot.leads) {
    await context.client`
      INSERT INTO leads (
        id,
        full_name,
        company,
        work_email,
        phone,
        source,
        status,
        consent_at,
        created_at
      )
      VALUES (
        ${row.id},
        ${row.full_name},
        ${row.company},
        ${row.work_email},
        ${row.phone},
        ${row.source},
        ${row.status},
        ${timestamp(row.consent_at)},
        ${timestamp(row.created_at)}
      )
    `;
  }
}
