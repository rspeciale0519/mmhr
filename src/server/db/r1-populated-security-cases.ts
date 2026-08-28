import { expect } from "vitest";

import {
  insertLegacyAuthUser,
  type RehearsalContext,
} from "./r1-migration-rehearsal";

export async function seedPopulatedBaseline(
  context: RehearsalContext,
  futureTime: string,
  pastTime: string,
) {
  const adminUserId = await insertLegacyAuthUser(
    context,
    "Admin.Person@Example.COM",
  );
  const contributorUserId = await insertLegacyAuthUser(
    context,
    "contributor@example.com",
  );
  const viewerUserId = await insertLegacyAuthUser(
    context,
    "viewer@example.com",
    false,
  );

  const [organization] = await context.client<{ id: string }[]>`
    INSERT INTO orgs (name)
    VALUES ('Legacy Organization')
    RETURNING id
  `;
  const organizationId = organization!.id;
  const members = await context.client<{ id: string; role: string }[]>`
    INSERT INTO org_members (org_id, user_id, role)
    VALUES
      (${organizationId}, ${adminUserId}, 'admin'),
      (${organizationId}, ${contributorUserId}, 'contributor'),
      (${organizationId}, ${viewerUserId}, 'viewer')
    RETURNING id, role
  `;
  const contributorMemberId = members.find(
    (member) => member.role === "contributor",
  )!.id;

  await context.client`
    INSERT INTO invitations (org_id, email, role, expires_at, accepted_at)
    VALUES
      (${organizationId}, 'Future@Example.com', 'admin', ${futureTime}, NULL),
      (${organizationId}, ' future@example.com ', 'contributor', ${futureTime}, NULL),
      (${organizationId}, 'accepted@example.com', 'viewer', ${futureTime}, ${pastTime}),
      (${organizationId}, 'expired@example.com', 'contributor', ${pastTime}, NULL),
      (${organizationId}, '   ', 'viewer', ${pastTime}, NULL)
  `;
  await context.client`
    INSERT INTO leads (
      full_name, company, work_email, phone, source, consent_at
    )
    VALUES (
      'Legacy Lead',
      'Legacy Company',
      'lead@example.com',
      '555-0100',
      'migration-test',
      ${pastTime}
    )
  `;
  await context.client`
    INSERT INTO audit_log (
      actor_id, action, entity, entity_id, before, after, created_at
    )
    VALUES (
      ${adminUserId},
      'legacy.update',
      'organization',
      ${organizationId},
      '{"status":"before"}'::jsonb,
      '{"status":"after"}'::jsonb,
      ${pastTime}
    )
  `;

  return {
    organizationId,
    adminUserId,
    contributorUserId,
    viewerUserId,
    contributorMemberId,
  };
}

export async function verifyAuditProtection(context: RehearsalContext) {
  const [legacy] = await context.client<
    { action: string; format_version: string; frozen_at: Date | null }[]
  >`SELECT action, format_version, frozen_at FROM audit_log`;
  expect(legacy).toMatchObject({
    action: "legacy.update",
    format_version: "legacy_snapshot_v1",
  });
  expect(legacy!.frozen_at).not.toBeNull();

  await expect(
    context.client`
      INSERT INTO audit_log (action, entity) VALUES ('blocked', 'test')
    `,
  ).rejects.toThrow();
  await expect(
    context.client`UPDATE audit_log SET action = 'blocked'`,
  ).rejects.toThrow();
  await expect(context.client`DELETE FROM audit_log`).rejects.toThrow();
  await expect(context.client`TRUNCATE audit_log`).rejects.toThrow();

  const [event] = await context.client<{ id: string }[]>`
    INSERT INTO audit_events (
      actor_type,
      actor_reference,
      command,
      action,
      entity_type,
      entity_id,
      reason,
      correlation_id,
      after_summary
    )
    VALUES (
      'migration',
      'r1.2-test',
      'audit.test',
      'audit.test',
      'test',
      'safe-event',
      'Verify append-only audit behavior.',
      gen_random_uuid(),
      '{"status":"active"}'::jsonb
    )
    RETURNING id
  `;
  await expect(
    context.client`
      UPDATE audit_events SET reason = 'blocked' WHERE id = ${event!.id}
    `,
  ).rejects.toThrow();
  await expect(
    context.client`DELETE FROM audit_events WHERE id = ${event!.id}`,
  ).rejects.toThrow();
  await expect(context.client`TRUNCATE audit_events`).rejects.toThrow();
  await expect(
    context.client`
      INSERT INTO audit_events (
        actor_type,
        actor_reference,
        command,
        action,
        entity_type,
        entity_id,
        reason,
        correlation_id,
        after_summary
      )
      VALUES (
        'migration',
        'r1.2-test',
        'audit.test',
        'audit.secret.reject',
        'test',
        'blocked-event',
        'Reject a sensitive summary.',
        gen_random_uuid(),
        '{"accessToken":"blocked"}'::jsonb
      )
    `,
  ).rejects.toThrow();
  await expect(
    context.client`
      INSERT INTO audit_events (
        actor_type,
        actor_reference,
        command,
        action,
        entity_type,
        entity_id,
        reason,
        correlation_id,
        after_summary
      )
      VALUES (
        'migration',
        'r1.2-test',
        'audit.test',
        'audit.neutral_key.reject',
        'test',
        'blocked-neutral-event',
        'Reject a summary key outside the R1.2 allowlist.',
        gen_random_uuid(),
        '{"note":"blocked"}'::jsonb
      )
    `,
  ).rejects.toThrow();
}

export async function verifyLegacyInvitationTokenProtection(
  context: RehearsalContext,
  organizationId: string,
  futureTime: string,
) {
  const [legacyInvitation] = await context.client<{ id: string; token: string }[]>`
    SELECT id, token
    FROM invitations
    WHERE token IS NOT NULL
    ORDER BY created_at
    LIMIT 1
  `;
  expect(legacyInvitation).toBeTruthy();

  await expect(
    context.client`
      UPDATE invitations
      SET token = '00000000-0000-4000-8000-000000000001'
      WHERE id = ${legacyInvitation!.id}
    `,
  ).rejects.toThrow(/immutable/);
  await expect(
    context.client`
      INSERT INTO invitations (
        org_id, email, normalized_email, token, expires_at
      )
      VALUES (
        ${organizationId},
        'blocked-token@example.com',
        'blocked-token@example.com',
        '00000000-0000-4000-8000-000000000002',
        ${futureTime}
      )
    `,
  ).rejects.toThrow(/cannot store/);

  const [unchanged] = await context.client<{ token: string }[]>`
    SELECT token FROM invitations WHERE id = ${legacyInvitation!.id}
  `;
  expect(unchanged!.token).toBe(legacyInvitation!.token);
}

export async function verifyRoleHistoryProtection(context: RehearsalContext) {
  await expect(
    context.client`TRUNCATE role_definitions CASCADE`,
  ).rejects.toThrow();
  await expect(
    context.client`TRUNCATE role_permission_defaults`,
  ).rejects.toThrow();

  await expect(
    context.client`
      INSERT INTO role_definitions (
        stable_key, version, kind, display_name, state, approved_at, activated_at
      )
      VALUES ('blocked_active', 1, 'platform', 'Blocked', 'active', now(), now())
    `,
  ).rejects.toThrow();
  await expect(
    context.client`
      UPDATE role_definitions
      SET display_name = 'Changed'
      WHERE stable_key = 'contributor' AND version = 1
    `,
  ).rejects.toThrow();
  await expect(
    context.client`
      DELETE FROM role_definitions
      WHERE stable_key = 'contributor' AND version = 1
    `,
  ).rejects.toThrow();

  await context.client`
    INSERT INTO permission_definitions (key, kind, description)
    VALUES ('test.perform', 'action', 'Test permission for migration rehearsal.')
  `;
  const [activeRole] = await context.client<{ id: string }[]>`
    SELECT id FROM role_definitions
    WHERE stable_key = 'contributor' AND version = 1
  `;
  await expect(
    context.client`
      INSERT INTO role_permission_defaults (
        role_definition_id, permission_key, effect
      )
      VALUES (${activeRole!.id}, 'test.perform', 'allow')
    `,
  ).rejects.toThrow();

  const [draftRole] = await context.client<{ id: string }[]>`
    INSERT INTO role_definitions (stable_key, version, kind, display_name)
    VALUES ('rehearsal_role', 1, 'platform', 'Rehearsal Role')
    RETURNING id
  `;
  const [defaultRow] = await context.client<{ id: string }[]>`
    INSERT INTO role_permission_defaults (
      role_definition_id, permission_key, effect
    )
    VALUES (${draftRole!.id}, 'test.perform', 'allow')
    RETURNING id
  `;
  await context.client`
    UPDATE role_definitions
    SET state = 'approved', approved_at = now(), updated_at = now()
    WHERE id = ${draftRole!.id}
  `;
  await expect(
    context.client`
      UPDATE role_permission_defaults
      SET effect = 'deny'
      WHERE id = ${defaultRow!.id}
    `,
  ).rejects.toThrow();
}
