import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { permissionKeys, permissionRegistry, rolePermissionDefaults } from "./permission-registry";
import { createPermissionFixtures, type PermissionPrincipal } from "./permission-test-fixtures";

const fixtures = createPermissionFixtures();
const { owner } = fixtures;
let superAdmin: PermissionPrincipal;
let platformAdmin: PermissionPrincipal;
let staff: PermissionPrincipal;
let orgAdmin: PermissionPrincipal;
let contributor: PermissionPrincipal;
let viewer: PermissionPrincipal;
let outsider: PermissionPrincipal;
let customerId: string;
let vendorId: string;
let internalId: string;

async function authorize(client: SupabaseClient, permission: string, organizationId: string | null = null) {
  const result = await client.rpc("mmhr_authorize", {
    permission_key: permission, organization_id: organizationId,
  });
  expect(result.error).toBeNull();
  return result.data as Array<{ identity_id: string; authorized_organization_id: string | null; assurance: string }>;
}

function aal2(principal: PermissionPrincipal) {
  if (!principal.elevated) throw new Error("This permission fixture requires an AAL2 client");
  return principal.elevated;
}

describe("R1.4 real-token permission evaluation", () => {
  beforeAll(async () => {
    superAdmin = await fixtures.createPrincipal({ platformRole: "super_admin", mfa: true });
    platformAdmin = await fixtures.createPrincipal({ platformRole: "admin", mfa: true });
    staff = await fixtures.createPrincipal({ platformRole: "staff", mfa: true });
    orgAdmin = await fixtures.createPrincipal({ mfa: true });
    contributor = await fixtures.createPrincipal({ mfa: true });
    viewer = await fixtures.createPrincipal({ mfa: true });
    outsider = await fixtures.createPrincipal();
    customerId = await fixtures.createOrganization("customer");
    vendorId = await fixtures.createOrganization("vendor");
    internalId = await fixtures.createOrganization("internal");
    await fixtures.addMembership(orgAdmin, customerId, "organization_admin");
    await fixtures.addMembership(contributor, customerId, "contributor");
    await fixtures.addMembership(viewer, customerId, "viewer");
    await fixtures.addMembership(viewer, vendorId, "viewer");
    await fixtures.addMembership(superAdmin, customerId, "viewer");
    await fixtures.addMembership(superAdmin, internalId, "viewer");
    await fixtures.addMembership(platformAdmin, internalId, "viewer");
    await fixtures.addMembership(staff, internalId, "viewer");
    await fixtures.addPortal(customerId, "customer", superAdmin);
    await fixtures.addPortal(vendorId, "vendor", superAdmin);
  }, 60_000);

  afterAll(() => fixtures.close(), 60_000);

  test("database definitions match all 34 registry keys and metadata exactly", async () => {
    const definitions = await owner`
      SELECT key, kind, platform_scope, organization_scope, minimum_assurance,
        internal_only, required_portal, description, active, retired_at
      FROM public.permission_definitions ORDER BY key
    `;
    expect(permissionKeys).toHaveLength(34);
    const expected = permissionKeys.map((key) => {
      const definition = permissionRegistry[key];
      return {
        key, kind: definition.kind, platform_scope: definition.platformScope,
        organization_scope: definition.organizationScope,
        minimum_assurance: definition.minimumAssurance, internal_only: definition.internalOnly,
        required_portal: definition.requiredPortal, description: definition.description,
        active: true, retired_at: null,
      };
    }).sort((a, b) => a.key.localeCompare(b.key));
    expect([...definitions]).toEqual(expected);
  });

  test("active defaults match the registry and preserve prior role versions", async () => {
    const definitions = await owner`
      SELECT stable_key, version, state FROM public.role_definitions ORDER BY stable_key, version
    `;
    expect([...definitions]).toEqual(Object.keys(rolePermissionDefaults).sort().flatMap((stableKey) => {
      if (stableKey === "super_admin") {
        return [
          { stable_key: stableKey, version: 1, state: "approved" },
          { stable_key: stableKey, version: 2, state: "approved" },
          { stable_key: stableKey, version: 3, state: "approved" },
          { stable_key: stableKey, version: 4, state: "approved" },
          { stable_key: stableKey, version: 5, state: "active" },
        ];
      }
      if (stableKey === "organization_admin" || stableKey === "contributor") {
        return [
          { stable_key: stableKey, version: 1, state: "approved" },
          { stable_key: stableKey, version: 2, state: "approved" },
          { stable_key: stableKey, version: 3, state: "active" },
        ];
      }
      return [
        { stable_key: stableKey, version: 1, state: "approved" },
        { stable_key: stableKey, version: 2, state: "active" },
      ];
    }));
    const defaults = await owner`
      SELECT role.stable_key, permission.permission_key, permission.effect
      FROM public.role_definitions role
      JOIN public.role_permission_defaults permission ON permission.role_definition_id = role.id
      WHERE role.state = 'active' ORDER BY role.stable_key, permission.permission_key
    `;
    const expected = Object.entries(rolePermissionDefaults).flatMap(([role, keys]) =>
      keys.map((permission) => ({ stable_key: role, permission_key: permission, effect: "allow" })),
    ).sort((a, b) => a.stable_key.localeCompare(b.stable_key) || a.permission_key.localeCompare(b.permission_key));
    expect(expected).toHaveLength(66);
    expect([...defaults]).toEqual(expected);
    const prior = await owner`
      SELECT permission.id FROM public.role_permission_defaults permission
      JOIN public.role_definitions role ON role.id = permission.role_definition_id WHERE role.version = 1
    `;
    expect(prior).toHaveLength(0);
  });

  test("all platform role defaults enforce their configured permission and scope", async () => {
    for (const [role, principal] of [["super_admin", superAdmin], ["admin", platformAdmin], ["staff", staff]] as const) {
      const allowed = new Set<string>(rolePermissionDefaults[role]);
      for (const key of permissionKeys) {
        const rows = await authorize(aal2(principal), key);
        const expected = permissionRegistry[key].platformScope && allowed.has(key);
        expect(rows, `${role}: ${key}`).toEqual(expected ? [{
          identity_id: principal.identityId, authorized_organization_id: null, assurance: "aal2",
        }] : []);
      }
    }
  }, 60_000);

  test("all organization role defaults enforce scope and portal type", async () => {
    for (const [role, principal] of [["organization_admin", orgAdmin], ["contributor", contributor], ["viewer", viewer]] as const) {
      const allowed = new Set<string>(rolePermissionDefaults[role]);
      for (const key of permissionKeys) {
        const definition = permissionRegistry[key];
        const expected = definition.organizationScope && !definition.internalOnly &&
          definition.requiredPortal !== "vendor" && allowed.has(key);
        expect(await authorize(aal2(principal), key, customerId), `${role}: ${key}`).toEqual(expected ? [{
          identity_id: principal.identityId, authorized_organization_id: customerId, assurance: "aal2",
        }] : []);
      }
    }
  }, 60_000);

  test("AAL1 can read its workspace but cannot use any privileged permission", async () => {
    expect(await authorize(superAdmin.client, "workspace.access")).toHaveLength(1);
    expect(await authorize(orgAdmin.client, "org.name.read", customerId)).toHaveLength(1);
    for (const key of permissionKeys) {
      if (permissionRegistry[key].minimumAssurance !== "aal2") continue;
      expect(await authorize(superAdmin.client, key)).toEqual([]);
      expect(await authorize(orgAdmin.client, key, customerId)).toEqual([]);
    }
  }, 60_000);

  test("unknown keys, missing memberships, forged IDs, and unassigned identities deny access", async () => {
    for (const key of ["unknown.permission", "", "workspace.access ", "WORKSPACE.ACCESS"]) {
      expect(await authorize(aal2(superAdmin), key)).toEqual([]);
    }
    expect(await authorize(outsider.client, "workspace.access")).toEqual([]);
    expect(await authorize(outsider.client, "workspace.access", customerId)).toEqual([]);
    expect(await authorize(viewer.client, "workspace.access", randomUUID())).toEqual([]);
    expect(await authorize(viewer.client, "org.name.read", internalId)).toEqual([]);
    const forged = await aal2(viewer).rpc("mmhr_authorize", {
      permission_key: "admin.access", actor_id: superAdmin.identityId,
    });
    expect(forged.error).not.toBeNull();
    expect(forged.data).toBeNull();
  });

  test("organization overrides cannot create platform access or bypass internal-only rules", async () => {
    const grants = [
      await fixtures.addOverride(viewer, superAdmin, "admin.access", "allow", customerId),
      await fixtures.addOverride(viewer, superAdmin, "admin.access", "allow", null),
      await fixtures.addOverride(viewer, superAdmin, "portal.access.grant", "allow", customerId),
      await fixtures.addOverride(outsider, superAdmin, "workspace.access", "allow", customerId),
    ];
    try {
      expect(await authorize(aal2(viewer), "admin.access")).toEqual([]);
      expect(await authorize(aal2(viewer), "admin.access", customerId)).toEqual([]);
      expect(await authorize(aal2(viewer), "portal.access.grant", customerId)).toEqual([]);
      expect(await authorize(outsider.client, "workspace.access", customerId)).toEqual([]);
    } finally { await fixtures.removeOverrides(grants); }
  });

  test("matching platform or organization denies take precedence over allows", async () => {
    for (const [denyScope, allowScope] of [[null, customerId], [customerId, null]]) {
      const grants = [
        await fixtures.addOverride(viewer, superAdmin, "permissions.view", "deny", denyScope!),
        await fixtures.addOverride(viewer, superAdmin, "permissions.view", "allow", allowScope!),
      ];
      try { expect(await authorize(aal2(viewer), "permissions.view", customerId)).toEqual([]); }
      finally { await fixtures.removeOverrides(grants); }
    }
  });

  test("finance authority requires internal status, MFA, and scoped membership", async () => {
    expect(await authorize(aal2(superAdmin), "finance.manage", internalId)).toHaveLength(1);
    expect(await authorize(superAdmin.client, "finance.manage", internalId)).toEqual([]);
    // Internal staff need an explicit workspace grant for external organizations.
    expect(await authorize(aal2(superAdmin), "finance.manage", customerId)).toEqual([]);
    expect(await authorize(aal2(superAdmin), "finance.manage", vendorId)).toEqual([]);
    expect(await authorize(aal2(platformAdmin), "finance.manage", internalId)).toEqual([]);
    expect(await authorize(aal2(staff), "finance.manage", internalId)).toEqual([]);
    const grants = [
      await fixtures.addOverride(viewer, superAdmin, "finance.manage", "allow", customerId),
      await fixtures.addOverride(platformAdmin, superAdmin, "finance.manage", "allow", internalId),
    ];
    try {
      expect(await authorize(aal2(viewer), "finance.manage", customerId)).toEqual([]);
      expect(await authorize(aal2(platformAdmin), "finance.manage", internalId)).toHaveLength(1);
      expect(await authorize(aal2(platformAdmin), "finance.manage", customerId)).toEqual([]);
    } finally { await fixtures.removeOverrides(grants); }
  });

  test("an explicit allow can grant an absent default only within its organization", async () => {
    const id = await fixtures.addOverride(viewer, superAdmin, "permissions.view", "allow", customerId);
    try {
      expect(await authorize(aal2(viewer), "permissions.view", customerId)).toHaveLength(1);
      expect(await authorize(aal2(viewer), "permissions.view", vendorId)).toEqual([]);
      expect(await authorize(aal2(viewer), "permissions.view")).toEqual([]);
    } finally { await fixtures.removeOverrides([id]); }
  });

  test("expired allows and denies do not affect authorization with the same token", async () => {
    const expired = new Date(Date.now() - 1_000);
    const ids = [
      await fixtures.addOverride(viewer, superAdmin, "permissions.view", "allow", customerId, expired),
      await fixtures.addOverride(viewer, superAdmin, "org.name.read", "deny", customerId, expired),
    ];
    try {
      expect(await authorize(aal2(viewer), "permissions.view", customerId)).toEqual([]);
      expect(await authorize(viewer.client, "org.name.read", customerId)).toHaveLength(1);
    } finally { await fixtures.removeOverrides(ids); }
  });

  test("private SQL evaluation rejects metadata drift and the exact expiry boundary", async () => {
    const result = await fixtures.privateExpiryAndDriftResults(viewer, superAdmin, customerId);
    expect(result).toEqual({ allow: [true, false, false], deny: [false, true, true], metadataDrift: false });
  });

  test("revoking an active override removes access without a JWT refresh", async () => {
    const id = await fixtures.addOverride(viewer, superAdmin, "permissions.view", "allow", customerId,
      new Date(Date.now() + 60_000));
    try {
      expect(await authorize(aal2(viewer), "permissions.view", customerId)).toHaveLength(1);
      await owner`UPDATE public.user_permission_overrides SET state = 'revoked', revoked_at = now(),
        revoked_by_identity_id = ${superAdmin.identityId}, revocation_reason = 'Fixture revocation' WHERE id = ${id}`;
      expect(await authorize(aal2(viewer), "permissions.view", customerId)).toEqual([]);
    } finally { await fixtures.removeOverrides([id]); }
  });

  test("field denies apply to every organization and membership read RPC", async () => {
    const ids = [
      await fixtures.addOverride(orgAdmin, superAdmin, "org.name.read", "deny", customerId),
      await fixtures.addOverride(orgAdmin, superAdmin, "member.role.read", "deny", customerId),
    ];
    try {
      const organization = await orgAdmin.client.rpc("mmhr_get_organization", { organization_id: customerId });
      expect(organization.error).toBeNull();
      expect(organization.data).toEqual([{ id: customerId, name: null, type: "customer", status: "active" }]);
      const memberships = await orgAdmin.client.rpc("mmhr_get_my_memberships");
      expect(memberships.error).toBeNull();
      expect(memberships.data).toEqual([expect.objectContaining({
        organization_id: customerId, organization_name: null, role_key: null,
      })]);
      const members = await aal2(orgAdmin).rpc("mmhr_get_organization_members", { organization_id: customerId });
      expect(members.error).toBeNull();
      expect(members.data.length).toBeGreaterThan(0);
      expect(members.data.every((row: { role_key: string | null }) => row.role_key === null)).toBe(true);
      expect(await authorize(aal2(orgAdmin), "member.role.read", customerId)).toEqual([]);
    } finally { await fixtures.removeOverrides(ids); }
  });

  test("member and audit reads reject AAL1 and permit authorized AAL2", async () => {
    const lowMembers = await orgAdmin.client.rpc("mmhr_get_organization_members", { organization_id: customerId });
    expect(lowMembers.error).toBeNull();
    expect(lowMembers.data).toEqual([]);
    const members = await aal2(orgAdmin).rpc("mmhr_get_organization_members", { organization_id: customerId });
    expect(members.error).toBeNull();
    expect(members.data.length).toBeGreaterThan(0);
    const lowAudit = await superAdmin.client.rpc("mmhr_get_audit_events", { organization_id: null });
    expect(lowAudit.error).toBeNull();
    expect(lowAudit.data).toEqual([]);
    const audit = await aal2(superAdmin).rpc("mmhr_get_audit_events", { organization_id: null });
    expect(audit.error).toBeNull();
    expect(audit.data.length).toBeGreaterThan(0);
    const unscoped = await owner<{ id: string }[]>`SELECT id FROM public.audit_events WHERE organization_id IS NULL`;
    const permitted = new Set(unscoped.map((row) => row.id));
    for (const row of audit.data) {
      expect(permitted.has(row.id)).toBe(true);
      expect(Object.keys(row).sort()).toEqual(["action", "entity_id", "entity_type", "id", "occurred_at"]);
    }
  });

  test("a workspace-only organization deny blocks member and audit reads", async () => {
    const id = await fixtures.addOverride(orgAdmin, superAdmin, "workspace.access", "deny", customerId);
    try {
      for (const permission of ["org.members.view", "audit.view"]) {
        expect(await authorize(aal2(orgAdmin), permission, customerId)).toEqual([]);
      }
      for (const [client, name, input] of [
        [orgAdmin.client, "mmhr_get_organization", { organization_id: customerId }],
        [orgAdmin.client, "mmhr_get_my_memberships", {}],
        [aal2(orgAdmin), "mmhr_get_organization_members", { organization_id: customerId }],
        [aal2(orgAdmin), "mmhr_get_audit_events", { organization_id: customerId }],
      ] as const) {
        const result = await client.rpc(name, input);
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
      }
    } finally { await fixtures.removeOverrides([id]); }
  });

  test.each(["workspace.access", "admin.access"])("a platform %s deny blocks privileged actions and audit", async (permission) => {
    const client = aal2(superAdmin);
    const before = await client.rpc("mmhr_get_audit_events", { organization_id: null });
    expect(before.error).toBeNull();
    expect(before.data.length).toBeGreaterThan(0);
    const id = await fixtures.addOverride(superAdmin, orgAdmin, permission, "deny", null);
    try {
      for (const key of ["admin.access", "identity.status.change", "audit.view"]) {
        expect(await authorize(client, key)).toEqual([]);
      }
      const audit = await client.rpc("mmhr_get_audit_events", { organization_id: null });
      expect(audit.error).toBeNull();
      expect(audit.data).toEqual([]);
    } finally { await fixtures.removeOverrides([id]); }
  });

  test("internal access to a customer requires a separate scoped workspace grant", async () => {
    expect(await authorize(aal2(superAdmin), "workspace.access", customerId)).toEqual([]);
    const id = await fixtures.addOverride(superAdmin, orgAdmin, "workspace.access", "allow", customerId);
    try {
      expect(await authorize(aal2(superAdmin), "workspace.access", customerId)).toHaveLength(1);
      expect(await authorize(aal2(superAdmin), "org.name.read", customerId)).toHaveLength(1);
      expect(await authorize(aal2(superAdmin), "workspace.access", vendorId)).toEqual([]);
    } finally { await fixtures.removeOverrides([id]); }
    expect(await authorize(aal2(superAdmin), "org.name.read", customerId)).toEqual([]);
  });

  test("portal access requires the matching organization type and active grant", async () => {
    const organizationId = await fixtures.createOrganization("customer");
    await fixtures.addMembership(viewer, organizationId, "viewer");
    expect(await authorize(viewer.client, "portal.customer.access", organizationId)).toEqual([]);
    const grantId = await fixtures.addPortal(organizationId, "customer", superAdmin);
    expect(await authorize(viewer.client, "portal.customer.access", organizationId)).toHaveLength(1);
    expect(await authorize(viewer.client, "portal.vendor.access", organizationId)).toEqual([]);
    await owner`UPDATE public.portal_access_grants SET state = 'revoked', revoked_at = now(),
      revoked_by_identity_id = ${superAdmin.identityId}, revocation_reason = 'Fixture revocation' WHERE id = ${grantId}`;
    expect(await authorize(viewer.client, "portal.customer.access", organizationId)).toEqual([]);
  });

  test.each(["suspended", "recovery_pending", "archived"] as const)("%s identities lose old-token access", async (status) => {
    const principal = await fixtures.createPrincipal({ mfa: true });
    await fixtures.addMembership(principal, customerId, "organization_admin");
    const client = aal2(principal);
    expect(await authorize(client, "workspace.access", customerId)).toHaveLength(1);
    expect(await authorize(client, "org.members.view", customerId)).toHaveLength(1);
    try {
      await owner`UPDATE public.identities SET status = ${status},
        suspended_at = ${status === "suspended" ? new Date() : null},
        archived_at = ${status === "archived" ? new Date() : null} WHERE id = ${principal.identityId}`;
      expect(await authorize(client, "workspace.access", customerId)).toEqual([]);
      expect(await authorize(client, "org.members.view", customerId)).toEqual([]);
      const identity = await client.rpc("mmhr_get_my_identity");
      expect(identity.error).toBeNull();
      expect(identity.data).toEqual([]);
    } finally {
      if (status !== "archived") {
        await owner`UPDATE public.identities SET status = 'active', suspended_at = NULL,
          archived_at = NULL WHERE id = ${principal.identityId}`;
      }
    }
  });

  test("pending identities and missing synchronized email verification deny access", async () => {
    const principal = await fixtures.createPrincipal({ pending: true });
    const setup = await principal.client.rpc("mmhr_get_my_account_setup");
    expect(setup.error).toBeNull();
    expect(setup.data).toHaveLength(1);
    expect(setup.data[0]).toMatchObject({ id: principal.identityId, status: "pending" });
    expect(Object.keys(setup.data[0]).sort()).toEqual(["email_verified_at", "id", "status"]);
    await fixtures.addMembership(principal, customerId, "viewer");
    expect(await authorize(principal.client, "workspace.access", customerId)).toEqual([]);
    try {
      await owner`UPDATE public.identities SET email_verified_at = NULL WHERE id = ${viewer.identityId}`;
      expect(await authorize(viewer.client, "workspace.access", customerId)).toEqual([]);
    } finally {
      await owner`UPDATE public.identities SET email_verified_at = now() WHERE id = ${viewer.identityId}`;
    }
  });

  test.each(["suspended", "archived"] as const)("%s organizations deny an existing token", async (status) => {
    const organizationId = await fixtures.createOrganization("customer");
    await fixtures.addMembership(viewer, organizationId, "viewer");
    expect(await authorize(viewer.client, "workspace.access", organizationId)).toHaveLength(1);
    await owner`UPDATE public.orgs SET status = ${status},
      suspended_at = ${status === "suspended" ? new Date() : null},
      archived_at = ${status === "archived" ? new Date() : null} WHERE id = ${organizationId}`;
    expect(await authorize(viewer.client, "workspace.access", organizationId)).toEqual([]);
    const result = await viewer.client.rpc("mmhr_get_organization", { organization_id: organizationId });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  test("pending organizations and suspended or revoked memberships deny access", async () => {
    const pendingOrg = await fixtures.createOrganization("customer", true);
    await fixtures.addMembership(viewer, pendingOrg, "viewer");
    expect(await authorize(viewer.client, "workspace.access", pendingOrg)).toEqual([]);
    const organizationId = await fixtures.createOrganization("customer");
    const memberId = await fixtures.addMembership(viewer, organizationId, "viewer");
    expect(await authorize(viewer.client, "workspace.access", organizationId)).toHaveLength(1);
    await owner`UPDATE public.org_members SET status = 'suspended', suspended_at = now() WHERE id = ${memberId}`;
    expect(await authorize(viewer.client, "workspace.access", organizationId)).toEqual([]);
    await owner`UPDATE public.org_members SET status = 'revoked', revoked_at = now(),
      revoked_by_identity_id = ${superAdmin.identityId}, revoked_reason = 'Fixture revocation' WHERE id = ${memberId}`;
    expect(await authorize(viewer.client, "workspace.access", organizationId)).toEqual([]);
  });

  test("revoking a platform assignment removes access from existing AAL1 and AAL2 tokens", async () => {
    const principal = await fixtures.createPrincipal({ platformRole: "staff", mfa: true });
    await fixtures.addMembership(principal, customerId, "viewer");
    expect(await authorize(principal.client, "workspace.access")).toHaveLength(1);
    expect(await authorize(aal2(principal), "admin.access")).toHaveLength(1);
    expect(await authorize(principal.client, "workspace.access", customerId)).toEqual([]);
    await owner`UPDATE public.platform_role_assignments SET state = 'revoked', revoked_at = now(),
      revoked_by_identity_id = ${superAdmin.identityId}, revocation_reason = 'Fixture revocation'
      WHERE identity_id = ${principal.identityId}`;
    expect(await authorize(principal.client, "workspace.access")).toEqual([]);
    expect(await authorize(aal2(principal), "admin.access")).toEqual([]);
    expect(await authorize(principal.client, "workspace.access", customerId)).toEqual([]);
    expect(await authorize(aal2(principal), "org.name.read", customerId)).toEqual([]);
  });

  test("a deactivated platform role cannot convert its holder into an external member", async () => {
    await fixtures.addMembership(staff, customerId, "viewer");
    expect(await authorize(staff.client, "workspace.access", customerId)).toEqual([]);
    await fixtures.withInactivePlatformRole("staff", async () => {
      expect(await authorize(aal2(staff), "admin.access")).toEqual([]);
      expect(await authorize(staff.client, "workspace.access", customerId)).toEqual([]);
      expect(await authorize(aal2(staff), "org.name.read", customerId)).toEqual([]);
    });
    expect(await authorize(aal2(staff), "admin.access")).toHaveLength(1);
  });

  test.each(["retired", "drifted"] as const)("%s workspace metadata blocks direct scoped reads", async (mode) => {
    const id = await fixtures.addOverride(superAdmin, orgAdmin, "workspace.access", "allow", customerId);
    try {
      expect(await authorize(aal2(superAdmin), "org.members.view", customerId)).toHaveLength(1);
      expect(await authorize(aal2(superAdmin), "audit.view", customerId)).toHaveLength(1);
      await fixtures.withInvalidWorkspaceDefinition(mode, async () => {
        for (const key of ["workspace.access", "org.members.view", "audit.view"]) {
          expect(await authorize(aal2(superAdmin), key, customerId)).toEqual([]);
        }
        for (const name of ["mmhr_get_organization", "mmhr_get_organization_members", "mmhr_get_audit_events"]) {
          const result = await aal2(superAdmin).rpc(name, { organization_id: customerId });
          expect(result.error).toBeNull();
          expect(result.data).toEqual([]);
        }
      });
      expect(await authorize(aal2(superAdmin), "org.members.view", customerId)).toHaveLength(1);
    } finally { await fixtures.removeOverrides([id]); }
  });

  test("an admin feature deny blocks internal organization commands but preserves ordinary scoped reads", async () => {
    const workspace = await fixtures.addOverride(superAdmin, orgAdmin, "workspace.access", "allow", customerId);
    try {
      expect(await authorize(aal2(superAdmin), "portal.access.grant", customerId)).toHaveLength(1);
      const deny = await fixtures.addOverride(superAdmin, orgAdmin, "admin.access", "deny", null);
      try {
        expect(await authorize(aal2(superAdmin), "org.name.read", customerId)).toHaveLength(1);
        for (const key of ["portal.access.grant", "portal.access.revoke", "permissions.delegate"]) {
          expect(await authorize(aal2(superAdmin), key, customerId)).toEqual([]);
        }
      } finally { await fixtures.removeOverrides([deny]); }
    } finally { await fixtures.removeOverrides([workspace]); }
  });

  test("anonymous callers and the restricted worker cannot execute authorization RPCs", async () => {
    const anonymous = await fixtures.anonymous.rpc("mmhr_authorize", { permission_key: "workspace.access" });
    expect(anonymous.error).not.toBeNull();
    expect(anonymous.data).toBeNull();
    await expect(fixtures.worker`SELECT * FROM public.mmhr_authorize('workspace.access', NULL)`).rejects.toMatchObject({ code: "42501" });
    const claims = JSON.stringify({ sub: superAdmin.userId, role: "authenticated", aal: "aal2" });
    let claimsSet = false;
    await expect(fixtures.worker.begin(async (transaction) => {
      await transaction`SELECT set_config('request.jwt.claims', ${claims}, true)`;
      claimsSet = true;
      await transaction`SELECT * FROM public.mmhr_authorize('workspace.access', NULL)`;
    })).rejects.toMatchObject({ code: "42501" });
    expect(claimsSet).toBe(true);
    await expect(fixtures.worker`SELECT * FROM public.permission_definitions`).rejects.toMatchObject({ code: "42501" });
    const [properties] = await fixtures.worker`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(properties).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
