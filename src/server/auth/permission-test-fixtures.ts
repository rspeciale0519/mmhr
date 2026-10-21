import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { assertRestrictedRehearsal, type RestrictedRehearsal } from "@/server/db/r1-migration-rehearsal";

type PlatformRole = "super_admin" | "admin" | "staff";
type OrganizationRole = "organization_admin" | "contributor" | "viewer";
type OrganizationType = "internal" | "customer" | "vendor";

export type PermissionPrincipal = {
  userId: string;
  identityId: string;
  client: SupabaseClient;
  elevated: SupabaseClient | null;
};

function requireLocalUrl(value: string | undefined, port: string): string {
  if (!value) throw new Error("The local permission test environment is incomplete");
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("The local permission test URL is invalid"); }
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.port !== port
  ) {
    throw new Error("Permission fixtures require the validated local MMHR stack");
  }
  return value;
}

function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replace(/=+$/, "")) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("The test factor has an invalid encoding");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [],
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function enrollTestTotp(client: SupabaseClient): Promise<{ factorId: string; secret: string }> {
  const enrollment = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `R1.4 local test ${randomUUID()}`,
  });
  if (enrollment.error || !enrollment.data) {
    throw new Error("The local MFA test could not enroll its factor");
  }
  const challenge = await client.auth.mfa.challenge({ factorId: enrollment.data.id });
  if (challenge.error || !challenge.data) {
    throw new Error("The local MFA test could not create its challenge");
  }
  const verification = await client.auth.mfa.verify({
    factorId: enrollment.data.id,
    challengeId: challenge.data.id,
    code: totpCode(enrollment.data.totp.secret),
  });
  if (verification.error) throw new Error("The local MFA test could not verify its challenge");
  const claims = await client.auth.getClaims();
  if (claims.error || claims.data?.claims.aal !== "aal2") {
    throw new Error("The local MFA test did not obtain verified AAL2 claims");
  }
  return { factorId: enrollment.data.id, secret: enrollment.data.totp.secret };
}

export async function verifyTestTotp(
  client: SupabaseClient,
  factorId: string,
  secret: string,
): Promise<string> {
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    throw new Error("The local MFA test could not create its challenge");
  }
  const verification = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: totpCode(secret),
  });
  if (verification.error || !verification.data?.access_token) {
    throw new Error("The local MFA test could not verify its challenge");
  }
  const claims = await client.auth.getClaims();
  if (claims.error || claims.data?.claims.aal !== "aal2") {
    throw new Error("The local MFA test did not obtain verified AAL2 claims");
  }
  return verification.data.access_token;
}

export function createPermissionFixtures(rehearsal?: RestrictedRehearsal) {
  if (process.env.NODE_ENV !== "test") throw new Error("Permission fixtures are test-only");
  if (rehearsal) assertRestrictedRehearsal(rehearsal);
  const apiUrl = rehearsal?.context.api?.url ?? requireLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "57021");
  const migrationUrl = rehearsal?.context.databaseUrl ?? requireLocalUrl(process.env.TEST_MIGRATION_DATABASE_URL, "57022");
  const workerUrl = rehearsal?.workerUrl ?? requireLocalUrl(process.env.DATABASE_URL, "57022");
  const anonKey = rehearsal?.context.api?.publicKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = rehearsal?.context.api?.adminKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) throw new Error("Local permission test credentials are missing");

  const authOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(apiUrl, serviceKey, authOptions);
  const owner = postgres(migrationUrl, { max: 2, prepare: true });
  const worker = postgres(workerUrl, { max: 1, prepare: true });
  const userIds: string[] = [];
  const identityIds: string[] = [];
  const platformIdentityIds: string[] = [];
  const platformUserIds: string[] = [];
  const organizationIds: string[] = [];

  async function createPrincipal(options: {
    platformRole?: PlatformRole; mfa?: boolean; pending?: boolean;
  } = {}) {
    const email = `r14-${randomUUID()}@example.com`;
    const password = `R1.4-fixture-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Permission Auth fixture creation failed");
    const userId = created.data.user.id;
    userIds.push(userId);
    const [identity] = await owner<{ id: string }[]>`
      INSERT INTO public.identities
        (auth_user_id, normalized_email, email_verified_at, status, activated_at, migration_review_required)
      VALUES (${userId}, ${email}, now(), ${options.pending ? "pending" : "active"},
        ${options.pending ? null : new Date()}, false)
      RETURNING id
    `;
    if (!identity) throw new Error("Permission identity fixture creation failed");
    identityIds.push(identity.id);
    if (options.platformRole) {
      const assignedAt = new Date();
      const [assignment] = await owner<{ id: string }[]>`
        INSERT INTO public.platform_role_assignments
          (identity_id, role_key, assigned_at, assignment_reason)
        VALUES (${identity.id}, ${options.platformRole}, ${assignedAt}, 'Synthetic local permission test')
        RETURNING id
      `;
      const [role] = await owner<{ id: string }[]>`
        SELECT id FROM public.role_definitions
        WHERE stable_key = ${options.platformRole} AND kind = 'platform' AND state = 'active'
      `;
      if (!assignment || !role) throw new Error("Permission role authority fixture creation failed");
      await owner`
        INSERT INTO public.role_authority_records
          (record_kind, authority_kind, platform_assignment_id, role_definition_id,
           correlation_id, created_at)
        VALUES ('platform_assignment', 'reviewed_owner', ${assignment.id}, ${role.id},
          ${randomUUID()}, (SELECT assigned_at FROM public.platform_role_assignments WHERE id = ${assignment.id}))
      `;
      platformIdentityIds.push(identity.id);
      platformUserIds.push(userId);
    }
    async function signInWithSession() {
      const client = createClient(apiUrl, anonKey!, authOptions);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) throw new Error("Permission fixture sign-in failed");
      return { client, accessToken: signedIn.data.session.access_token };
    }
    async function signIn() {
      return (await signInWithSession()).client;
    }
    let client: SupabaseClient;
    let elevated: SupabaseClient | null = null;
    if (options.mfa) {
      // Enroll the factor before creating the two sessions used by tests.
      // Local GoTrue invalidates other sessions during factor enrollment.
      const enrollmentClient = await signIn();
      const factor = await enrollTestTotp(enrollmentClient);
      const session = await signInWithSession();
      const elevatedToken = await verifyTestTotp(session.client, factor.factorId, factor.secret);
      const accessToken = session.accessToken;
      client = createClient(apiUrl, anonKey!, {
        ...authOptions,
        global: {
          fetch: async (input, init = {}) => {
            const headers = new Headers(init.headers);
            headers.set("Authorization", `Bearer ${accessToken}`);
            return fetch(input, { ...init, headers });
          },
        },
      });
      elevated = createClient(apiUrl, anonKey!, {
        ...authOptions,
        global: {
          fetch: async (input, init = {}) => {
            const headers = new Headers(init.headers);
            headers.set("Authorization", `Bearer ${elevatedToken}`);
            return fetch(input, { ...init, headers });
          },
        },
      });
    } else {
      client = await signIn();
    }
    return { userId, identityId: identity.id, client, elevated } satisfies PermissionPrincipal;
  }

  async function createOrganization(type: OrganizationType, pending = false) {
    const [organization] = await owner<{ id: string }[]>`
      INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
      VALUES ('R1.4 synthetic organization', ${type}, ${pending ? "pending" : "active"},
        ${pending ? null : new Date()}, false)
      RETURNING id
    `;
    if (!organization) throw new Error("Permission organization fixture creation failed");
    organizationIds.push(organization.id);
    return organization.id;
  }

  async function addMembership(principal: PermissionPrincipal, organizationId: string, role: OrganizationRole) {
    const [membership] = await owner<{ id: string }[]>`
      INSERT INTO public.org_members
        (org_id, identity_id, user_id, role, role_key, migration_review_required)
      VALUES (${organizationId}, ${principal.identityId}, ${principal.userId},
        ${role === "organization_admin" ? "admin" : role}, ${role}, false)
      RETURNING id
    `;
    if (!membership) throw new Error("Permission membership fixture creation failed");
    return membership.id;
  }

  async function addOverride(
    principal: PermissionPrincipal,
    issuer: PermissionPrincipal,
    permissionKey: string,
    effect: "allow" | "deny",
    organizationId: string | null,
    expiresAt: Date | null = null,
  ) {
    const [override] = await owner<{ id: string }[]>`
      INSERT INTO public.user_permission_overrides
        (identity_id, permission_key, scope_kind, organization_id, scope_key,
         effect, expires_at, issued_by_identity_id, issue_reason)
      VALUES (${principal.identityId}, ${permissionKey},
        ${organizationId ? "organization" : "platform"}, ${organizationId},
        ${organizationId ? `organization:${organizationId}` : "platform"},
        ${effect}, ${expiresAt}, ${issuer.identityId}, 'Synthetic local permission test')
      RETURNING id
    `;
    if (!override) throw new Error("Permission override fixture creation failed");
    return override.id;
  }

  async function removeOverrides(ids: string[]) {
    if (ids.length) await owner`DELETE FROM public.user_permission_overrides WHERE id = ANY(${ids}::uuid[])`;
  }

  async function addPortal(organizationId: string, portal: "customer" | "vendor", issuer: PermissionPrincipal) {
    const [grant] = await owner<{ id: string }[]>`
      INSERT INTO public.portal_access_grants (organization_id, portal, issued_by_identity_id, issue_reason)
      VALUES (${organizationId}, ${portal}, ${issuer.identityId}, 'Synthetic local permission test')
      RETURNING id
    `;
    if (!grant) throw new Error("Permission portal fixture creation failed");
    return grant.id;
  }

  async function privateExpiryAndDriftResults(principal: PermissionPrincipal, issuer: PermissionPrincipal, organizationId: string) {
    const rollback = Symbol("rollback permission boundary fixture");
    let results: { allow: boolean[]; deny: boolean[]; metadataDrift: boolean } | undefined;
    try {
      await owner.begin(async (transaction) => {
        await transaction`
          INSERT INTO public.user_permission_overrides
            (identity_id, permission_key, scope_kind, organization_id, scope_key,
             effect, expires_at, issued_by_identity_id, issue_reason)
          VALUES (${principal.identityId}, 'permissions.view', 'organization', ${organizationId},
              ${`organization:${organizationId}`}, 'allow', '2030-01-01T00:00:00Z',
              ${issuer.identityId}, 'Rollback-only allow boundary fixture'),
            (${principal.identityId}, 'org.name.read', 'organization', ${organizationId},
              ${`organization:${organizationId}`}, 'deny', '2030-01-01T00:00:00Z',
              ${issuer.identityId}, 'Rollback-only deny boundary fixture')
        `;
        async function decision(identityId: string, permission: string, organization: string | null, assurance: string, offset: number) {
          const [row] = await transaction<{ allowed: boolean }[]>`
            SELECT mmhr_private.r1_has_permission_for_identity(${identityId}, ${permission},
              ${organization}, ${assurance}, '2030-01-01T00:00:00Z'::timestamptz +
                ${offset}::integer * interval '1 microsecond') AS allowed
          `;
          if (!row) throw new Error("The private permission fixture returned no decision");
          return row.allowed;
        }
        const allow: boolean[] = [];
        const deny: boolean[] = [];
        for (const offset of [-1, 0, 1]) {
          allow.push(await decision(principal.identityId, "permissions.view", organizationId, "aal2", offset));
          deny.push(await decision(principal.identityId, "org.name.read", organizationId, "aal1", offset));
        }
        await transaction`UPDATE public.permission_definitions SET minimum_assurance = 'aal1' WHERE key = 'audit.export'`;
        results = { allow, deny, metadataDrift: await decision(issuer.identityId, "audit.export", null, "aal2", 0) };
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    if (!results) throw new Error("The private permission fixture did not finish");
    return results;
  }

  async function withInactivePlatformRole(role: PlatformRole, assertion: () => Promise<void>) {
    const [original] = await owner<{ id: string; activated_at: string }[]>`
      SELECT id, activated_at::text FROM public.role_definitions
      WHERE stable_key = ${role} AND state = 'active'
    `;
    if (!original) throw new Error("The platform role fixture has no active version");
    try {
      await owner`UPDATE public.role_definitions SET state = 'approved', activated_at = NULL
        WHERE id = ${original.id}`;
      await assertion();
    } finally {
      const restored = await owner`UPDATE public.role_definitions SET state = 'active',
        activated_at = (SELECT activated_at FROM public.role_authority_records
          WHERE role_definition_id = ${original.id} AND record_kind = 'role_activation'
          ORDER BY id LIMIT 1)
        WHERE id = ${original.id} RETURNING id`;
      if (restored.length !== 1) throw new Error("The platform role fixture was not restored");
    }
  }

  async function withInvalidWorkspaceDefinition(mode: "retired" | "drifted", assertion: () => Promise<void>) {
    const [original] = await owner<{ active: boolean; retired_at: string | null; minimum_assurance: string }[]>`
      SELECT active, retired_at::text, minimum_assurance FROM public.permission_definitions
      WHERE key = 'workspace.access'
    `;
    if (!original) throw new Error("The workspace permission fixture is missing");
    // Integration files are sequential. Restore these shared fields even when the RPC assertion fails.
    try {
      if (mode === "retired") {
        await owner`UPDATE public.permission_definitions SET active = false, retired_at = now()
          WHERE key = 'workspace.access'`;
      } else {
        await owner`UPDATE public.permission_definitions SET minimum_assurance = 'aal2'
          WHERE key = 'workspace.access'`;
      }
      await assertion();
    } finally {
      const restored = await owner`UPDATE public.permission_definitions SET active = ${original.active},
        retired_at = ${original.retired_at}, minimum_assurance = ${original.minimum_assurance}
        WHERE key = 'workspace.access' RETURNING key`;
      if (restored.length !== 1) throw new Error("The workspace permission fixture was not restored");
    }
  }

  async function close() {
    const failures: string[] = [];
    async function attempt(label: string, action: () => Promise<unknown>) {
      try { await action(); } catch { failures.push(label); }
    }
    // Never remove audit events or immutable authority records.
    await attempt("override cleanup", async () => {
      if (identityIds.length) await owner`DELETE FROM public.user_permission_overrides WHERE identity_id = ANY(${identityIds}::uuid[])`;
    });
    await attempt("portal cleanup", async () => {
      if (organizationIds.length) await owner`DELETE FROM public.portal_access_grants WHERE organization_id = ANY(${organizationIds}::uuid[])`;
    });
    await attempt("assignment cleanup", async () => {
      // Authority rows are immutable. Retire synthetic assignments instead of
      // retaining active administrators after the test finishes.
      if (platformIdentityIds.length) await owner.begin(async (transaction) => {
        const retired = await transaction<{ id: string }[]>`
          UPDATE public.platform_role_assignments
          SET state = 'revoked', revoked_at = clock_timestamp(),
            revocation_reason = 'Retire completed synthetic local permission test'
          WHERE identity_id = ANY(${platformIdentityIds}::uuid[])
            AND assignment_reason = 'Synthetic local permission test' AND state = 'active'
          RETURNING id
        `;
        for (const assignment of retired) await transaction`
          INSERT INTO public.audit_events (actor_type, actor_reference, command, action,
            entity_type, entity_id, reason, correlation_id, before_summary, after_summary)
          VALUES ('system', 'local-permission-fixture', 'test.fixture.retire', 'platform_role.revoke',
            'platform_role_assignment', ${assignment.id},
            'Retire completed synthetic local permission test', ${randomUUID()},
            '{"state":"active"}'::jsonb, '{"state":"revoked"}'::jsonb)
        `;
      });
      const removable = identityIds.filter((id) => !platformIdentityIds.includes(id));
      if (removable.length) await owner`DELETE FROM public.platform_role_assignments WHERE identity_id = ANY(${removable}::uuid[])`;
    });
    await attempt("membership cleanup", async () => {
      if (organizationIds.length) await owner`DELETE FROM public.org_members WHERE org_id = ANY(${organizationIds}::uuid[])`;
    });
    await attempt("organization cleanup", async () => {
      if (organizationIds.length) await owner`DELETE FROM public.orgs WHERE id = ANY(${organizationIds}::uuid[])`;
    });
    await attempt("identity cleanup", async () => {
      const removable = identityIds.filter((id) => !platformIdentityIds.includes(id));
      if (removable.length) await owner`DELETE FROM public.identities WHERE id = ANY(${removable}::uuid[])`;
    });
    for (const id of userIds) {
      if (platformUserIds.includes(id)) continue;
      await attempt("Auth cleanup", async () => {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error) throw new Error("Auth fixture cleanup failed");
      });
    }
    await attempt("worker close", () => worker.end({ timeout: 5 }));
    await attempt("owner close", () => owner.end({ timeout: 5 }));
    if (failures.length) throw new Error(`Permission fixture cleanup failed: ${failures.join(", ")}`);
  }

  return {
    owner, worker, createPrincipal, createOrganization, addMembership,
    addOverride, removeOverrides, addPortal, privateExpiryAndDriftResults,
    withInactivePlatformRole, withInvalidWorkspaceDefinition, close,
    anonymous: createClient(apiUrl, anonKey, authOptions),
  };
}
