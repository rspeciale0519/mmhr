import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  applyBaselineMigration,
  insertLegacyAuthUser,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";
import {
  seedPopulatedBaseline,
  verifyAuditProtection,
  verifyLegacyInvitationTokenProtection,
  verifyRoleHistoryProtection,
} from "./r1-populated-security-cases";

const futureTime = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1_000,
).toISOString();
const pastTime = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1_000,
).toISOString();

describe.sequential("R1.2 populated database migration", () => {
  let context: RehearsalContext | undefined;
  let organizationId: string;
  let adminUserId: string;
  let contributorUserId: string;
  let contributorMemberId: string;

  beforeAll(async () => {
    context = await startRehearsal("populated");
    await applyBaselineMigration(context);
    ({
      organizationId,
      adminUserId,
      contributorUserId,
      contributorMemberId,
    } = await seedPopulatedBaseline(context, futureTime, pastTime));

    await applyAllMigrations(context);
  }, 300_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("reconciles every legacy source row", async () => {
    const counts = await context!.client<{ name: string; count: number }[]>`
      SELECT 'auth_users' AS name, count(*)::integer AS count FROM auth.users
      UNION ALL SELECT 'identities', count(*)::integer FROM identities
      UNION ALL SELECT 'orgs', count(*)::integer FROM orgs
      UNION ALL SELECT 'org_members', count(*)::integer FROM org_members
      UNION ALL SELECT 'invitations', count(*)::integer FROM invitations
      UNION ALL SELECT 'leads', count(*)::integer FROM leads
      UNION ALL SELECT 'audit_log', count(*)::integer FROM audit_log
      ORDER BY name
    `;
    expect(Object.fromEntries(counts.map((item) => [item.name, item.count]))).toEqual({
      audit_log: 1,
      auth_users: 3,
      identities: 3,
      invitations: 5,
      leads: 1,
      org_members: 3,
      orgs: 1,
    });

    const identities = await context!.client<
      {
        auth_user_id: string;
        normalized_email: string;
        email_verified_at: Date | null;
        status: string;
        synchronized_at: Date | null;
        migration_review_required: boolean;
      }[]
    >`
      SELECT
        auth_user_id,
        normalized_email,
        email_verified_at,
        status,
        synchronized_at,
        migration_review_required
      FROM identities
      ORDER BY normalized_email
    `;
    expect(
      identities.map((identity) => ({
        email: identity.normalized_email,
        verified: identity.email_verified_at !== null,
        status: identity.status,
        synchronized: identity.synchronized_at !== null,
        review: identity.migration_review_required,
      })),
    ).toEqual([
      {
        email: "admin.person@example.com",
        verified: true,
        status: "pending",
        synchronized: true,
        review: true,
      },
      {
        email: "contributor@example.com",
        verified: true,
        status: "pending",
        synchronized: true,
        review: true,
      },
      {
        email: "viewer@example.com",
        verified: false,
        status: "pending",
        synchronized: true,
        review: true,
      },
    ]);
  });

  test("maps roles and inventories every legacy invitation", async () => {
    const members = await context!.client<
      { role: string; role_key: string; migration_review_required: boolean }[]
    >`
      SELECT role, role_key, migration_review_required
      FROM org_members
      WHERE org_id = ${organizationId}
      ORDER BY role
    `;
    expect(members).toEqual([
      { role: "admin", role_key: "organization_admin", migration_review_required: true },
      { role: "contributor", role_key: "contributor", migration_review_required: false },
      { role: "viewer", role_key: "viewer", migration_review_required: false },
    ]);

    const invitations = await context!.client<
      {
        email: string;
        normalized_email: string;
        status: string;
        role_key: string;
        token: string | null;
        migration_review_required: boolean;
      }[]
    >`
      SELECT
        email,
        normalized_email,
        status,
        role_key,
        token,
        migration_review_required
      FROM invitations
      ORDER BY email
    `;
    expect(
      invitations.map((invitation) => ({
        email: invitation.email,
        normalized: invitation.normalized_email,
        status: invitation.status,
        role: invitation.role_key,
        tokenPreserved: invitation.token !== null,
        review: invitation.migration_review_required,
      })),
    ).toEqual([
      {
        email: "   ",
        normalized: "",
        status: "expired",
        role: "viewer",
        tokenPreserved: true,
        review: true,
      },
      {
        email: " future@example.com ",
        normalized: "future@example.com",
        status: "pending",
        role: "contributor",
        tokenPreserved: true,
        review: true,
      },
      {
        email: "accepted@example.com",
        normalized: "accepted@example.com",
        status: "accepted",
        role: "viewer",
        tokenPreserved: true,
        review: true,
      },
      {
        email: "expired@example.com",
        normalized: "expired@example.com",
        status: "expired",
        role: "contributor",
        tokenPreserved: true,
        review: false,
      },
      {
        email: "Future@Example.com",
        normalized: "future@example.com",
        status: "pending",
        role: "organization_admin",
        tokenPreserved: true,
        review: true,
      },
    ]);
    await verifyLegacyInvitationTokenProtection(
      context!,
      organizationId,
      futureTime,
    );
  });

  test("enforces identity, invitation, and membership uniqueness", async () => {
    const [contributorIdentity] = await context!.client<{ id: string }[]>`
      SELECT id FROM identities WHERE auth_user_id = ${contributorUserId}
    `;

    await expect(
      context!.client`
        INSERT INTO identities (auth_user_id)
        VALUES (${contributorUserId})
      `,
    ).rejects.toThrow();
    await expect(
      context!.client`
        INSERT INTO identities (normalized_email, email_verified_at)
        VALUES ('contributor@example.com', now())
      `,
    ).rejects.toThrow();
    await expect(
      context!.client`
        INSERT INTO org_members (org_id, identity_id)
        VALUES (${organizationId}, ${contributorIdentity!.id})
      `,
    ).rejects.toThrow();

    const [newInvitation] = await context!.client<
      { token: string | null; role: string; role_key: string; status: string }[]
    >`
      INSERT INTO invitations (org_id, email, normalized_email, expires_at)
      VALUES (
        ${organizationId},
        'new@example.com',
        'new@example.com',
        ${futureTime}
      )
      RETURNING token, role, role_key, status
    `;
    expect(newInvitation).toEqual({
      token: null,
      role: "contributor",
      role_key: "contributor",
      status: "pending",
    });
    await expect(
      context!.client`
        INSERT INTO invitations (org_id, email, normalized_email, expires_at)
        VALUES (
          ${organizationId},
          'NEW@example.com',
          'new@example.com',
          ${futureTime}
        )
      `,
    ).rejects.toThrow();
    await expect(
      context!.client`
        INSERT INTO invitations (org_id, email, normalized_email, expires_at)
        VALUES (
          ${organizationId},
          'bound-address@example.com',
          'different-address@example.com',
          ${futureTime}
        )
      `,
    ).rejects.toThrow(/invitations_normalized_email_ck/);
    await expect(
      context!.client`
        INSERT INTO invitations (org_id, email, normalized_email, expires_at)
        VALUES (${organizationId}, '   ', '', ${futureTime})
      `,
    ).rejects.toThrow();
  });

  test("rejects an invitation with a non-normalized email binding", async () => {
    await expect(
      context!.client`
        INSERT INTO invitations (org_id, email, normalized_email, expires_at)
        VALUES (
          ${organizationId},
          'MixedCase-Bound@example.test',
          'different@example.test',
          ${futureTime}
        )
      `,
    ).rejects.toThrow(/invitations_normalized_email_ck/);
  });

  test("retains stable history when an Auth user is deleted and relinked", async () => {
    const [original] = await context!.client<{ id: string }[]>`
      SELECT id FROM identities WHERE auth_user_id = ${adminUserId}
    `;
    await context!.client`DELETE FROM auth.users WHERE id = ${adminUserId}`;

    const [retainedIdentity] = await context!.client<
      { id: string; auth_user_id: string | null }[]
    >`SELECT id, auth_user_id FROM identities WHERE id = ${original!.id}`;
    const [retainedMember] = await context!.client<
      { user_id: string | null; identity_id: string }[]
    >`
      SELECT user_id, identity_id
      FROM org_members
      WHERE identity_id = ${original!.id}
    `;
    expect(retainedIdentity).toEqual({ id: original!.id, auth_user_id: null });
    expect(retainedMember).toEqual({ user_id: null, identity_id: original!.id });

    const replacementUserId = await insertLegacyAuthUser(
      context!,
      "replacement@example.com",
    );
    await context!.client`
      UPDATE identities
      SET auth_user_id = ${replacementUserId}, synchronized_at = now(), updated_at = now()
      WHERE id = ${original!.id}
    `;
    await context!.client`
      UPDATE org_members
      SET user_id = ${replacementUserId}, updated_at = now()
      WHERE identity_id = ${original!.id}
    `;
    const [relinked] = await context!.client<
      { id: string; auth_user_id: string; user_id: string }[]
    >`
      SELECT identity.id, identity.auth_user_id, member.user_id
      FROM identities AS identity
      INNER JOIN org_members AS member ON member.identity_id = identity.id
      WHERE identity.id = ${original!.id}
    `;
    expect(relinked).toEqual({
      id: original!.id,
      auth_user_id: replacementUserId,
      user_id: replacementUserId,
    });
  });

  test("preserves revoked membership history and permits a safe rejoin", async () => {
    const [contributorIdentity] = await context!.client<{ id: string }[]>`
      SELECT id FROM identities WHERE auth_user_id = ${contributorUserId}
    `;
    await context!.client`
      UPDATE org_members
      SET
        status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'R1.2 populated rehearsal',
        updated_at = now()
      WHERE id = ${contributorMemberId}
    `;
    await expect(
      context!.client`
        UPDATE org_members
        SET status = 'active', revoked_at = NULL, revoked_reason = NULL
        WHERE id = ${contributorMemberId}
      `,
    ).rejects.toThrow();

    const [rejoined] = await context!.client<
      { role: string; role_key: string; status: string; user_id: string | null }[]
    >`
      INSERT INTO org_members (org_id, identity_id)
      VALUES (${organizationId}, ${contributorIdentity!.id})
      RETURNING role, role_key, status, user_id
    `;
    expect(rejoined).toEqual({
      role: "contributor",
      role_key: "contributor",
      status: "active",
      user_id: null,
    });

    const [history] = await context!.client<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM org_members
      WHERE org_id = ${organizationId}
        AND identity_id = ${contributorIdentity!.id}
    `;
    expect(history!.count).toBe(2);
  });

  test("enforces identity and organization state transitions", async () => {
    const [identity] = await context!.client<{ id: string }[]>`
      INSERT INTO identities (normalized_email)
      VALUES ('lifecycle@example.com')
      RETURNING id
    `;
    await expect(
      context!.client`
        UPDATE identities
        SET status = 'suspended', activated_at = now(), suspended_at = now()
        WHERE id = ${identity!.id}
      `,
    ).rejects.toThrow();
    await context!.client`
      UPDATE identities
      SET status = 'active', activated_at = now()
      WHERE id = ${identity!.id}
    `;
    await context!.client`
      UPDATE identities
      SET status = 'suspended', suspended_at = now()
      WHERE id = ${identity!.id}
    `;
    await context!.client`
      UPDATE identities
      SET status = 'archived', archived_at = now()
      WHERE id = ${identity!.id}
    `;
    await expect(
      context!.client`
        UPDATE identities
        SET status = 'active', suspended_at = NULL, archived_at = NULL
        WHERE id = ${identity!.id}
      `,
    ).rejects.toThrow();

    const [organization] = await context!.client<{ id: string }[]>`
      INSERT INTO orgs (name) VALUES ('Lifecycle Organization') RETURNING id
    `;
    await expect(
      context!.client`
        UPDATE orgs SET status = 'active', activated_at = now()
        WHERE id = ${organization!.id}
      `,
    ).rejects.toThrow();
    await context!.client`
      UPDATE orgs
      SET type = 'customer', status = 'active', activated_at = now()
      WHERE id = ${organization!.id}
    `;
    await expect(
      context!.client`
        UPDATE orgs
        SET type = NULL, status = 'pending', activated_at = NULL
        WHERE id = ${organization!.id}
      `,
    ).rejects.toThrow();

    await expect(
      context!.client`DELETE FROM orgs WHERE id = ${organizationId}`,
    ).rejects.toThrow();
    await expect(
      context!.client`
        DELETE FROM identities
        WHERE auth_user_id = ${contributorUserId}
      `,
    ).rejects.toThrow();
  });

  test("freezes legacy audit data and protects new audit summaries", async () => {
    await verifyAuditProtection(context!);
  });

  test("keeps approved role versions and defaults immutable", async () => {
    await verifyRoleHistoryProtection(context!);
  });
});
