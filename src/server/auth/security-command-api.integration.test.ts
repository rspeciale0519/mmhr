import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { changeIdentityStatus, changeMembershipRole, changeMembershipStatus } from "@/server/commands/security";
import { authorizePermission } from "./authorization";
import {
  apiCommandMetadata, createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims,
  type SecurityCommandApiFixtures,
} from "./security-command-api-fixtures";

let fixtures: SecurityCommandApiFixtures | undefined;

function current() {
  if (!fixtures) throw new Error("The disposable security API fixture is not ready");
  return fixtures;
}

function identityArgs(targetId: string) {
  const metadata = apiCommandMetadata();
  return {
    target_identity_id: targetId, status: "suspended", reason: metadata.reason,
    correlation_id: randomUUID(), idempotency_key: metadata.idempotencyKey,
  };
}

describe("R1.4 security commands through real disposable Auth sessions", () => {
  beforeAll(async () => { fixtures = await createSecurityCommandApiFixtures(); }, 240_000);
  afterAll(async () => { if (fixtures) await fixtures.close(); }, 180_000);

  test("bootstraps only the two confirmed scratch identities with real AAL2 sessions", async () => {
    const { owner, pair, projectId, isolation } = current();
    expect(projectId).toMatch(/^mmhr-r1-commandapi-[0-9a-f]{8}$/);
    expect(isolation.apiLoopbackOnly).toBe(true);
    expect(new Set([isolation.apiPort, isolation.databasePort]).size).toBe(2);
    expect([isolation.apiPort, isolation.databasePort]).not.toContain(57021);
    expect([isolation.apiPort, isolation.databasePort]).not.toContain(57022);
    const [bootstrap] = await owner`
      SELECT state, target_identity_id, second_target_identity_id FROM public.security_bootstrap_state
    `;
    expect(bootstrap).toEqual({
      state: "consumed", target_identity_id: pair[0].identityId, second_target_identity_id: pair[1].identityId,
    });
    for (const principal of pair) {
      expect(principal.identityId).not.toBe(principal.subjectId);
      const claims = await verifiedApiClaims(elevatedClient(principal), "aal2");
      expect(claims.subjectId).toBe(principal.subjectId);
      const [stored] = await owner`
        SELECT i.status, a.role_key, s.aal, f.status AS factor_status,
          u.email_confirmed_at IS NOT NULL AS email_confirmed
        FROM public.identities i
        JOIN public.platform_role_assignments a ON a.identity_id = i.id AND a.state = 'active'
        JOIN auth.users u ON u.id = i.auth_user_id
        JOIN auth.sessions s ON s.user_id = u.id AND s.id = ${claims.sessionId}::uuid
        JOIN auth.mfa_factors f ON f.id = s.factor_id AND f.user_id = u.id
        WHERE i.id = ${principal.identityId}::uuid
      `;
      expect(stored).toEqual({ status: "active", role_key: "super_admin", aal: "aal2", factor_status: "verified", email_confirmed: true });
    }
  });

  test("denies anonymous commands at the actual Data API", async () => {
    const { anonymous, identityTarget, owner } = current();
    const result = await anonymous.rpc("mmhr_change_identity_status", identityArgs(identityTarget.identityId));
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("42501");
    const [identity] = await owner`SELECT status FROM public.identities WHERE id = ${identityTarget.identityId}::uuid`;
    expect(identity!.status).toBe("active");
  });

  test("denies an AAL1 session even when its identity has the Super Admin role", async () => {
    const { pair, identityTarget } = current();
    await verifiedApiClaims(pair[0].aal1, "aal1");
    expect(await authorizePermission("identity.status.change", { kind: "platform" }, { supabase: pair[0].aal1 })).toBeNull();
    const result = await pair[0].aal1.rpc("mmhr_change_identity_status", identityArgs(identityTarget.identityId));
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("42501");
    await expect(changeIdentityStatus({ ...apiCommandMetadata(), targetIdentityId: identityTarget.identityId, status: "suspended" },
      { supabase: pair[0].aal1 })).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  test("changes identity status with one audit event and one stable idempotent receipt", async () => {
    const { pair, identityTarget, owner } = current();
    const metadata = apiCommandMetadata();
    const options = { supabase: elevatedClient(pair[0]), correlationId: randomUUID() };
    const input = { ...metadata, targetIdentityId: identityTarget.identityId, status: "suspended" as const };
    const first = await changeIdentityStatus(input, options);
    const replay = await changeIdentityStatus(input, { ...options, correlationId: randomUUID() });
    expect(replay).toEqual(first);
    expect(first).toEqual({ receiptId: expect.any(String), entityId: identityTarget.identityId, action: "identity.status.change" });
    const receipts = await owner`
      SELECT r.id, r.actor_identity_id, r.entity_id, a.correlation_id, a.before_summary, a.after_summary
      FROM public.security_command_receipts r JOIN public.audit_events a ON a.id = r.audit_event_id
      WHERE r.idempotency_key = ${metadata.idempotencyKey}::uuid
    `;
    expect([...receipts]).toEqual([{
      id: first.receiptId, actor_identity_id: pair[0].identityId, entity_id: identityTarget.identityId,
      correlation_id: options.correlationId, before_summary: { status: "active" }, after_summary: { status: "suspended" },
    }]);
    const [events] = await owner`SELECT count(*)::integer AS count FROM public.audit_events WHERE idempotency_key = ${metadata.idempotencyKey}`;
    expect(events!.count).toBe(1);
    await expect(changeIdentityStatus({ ...input, status: "active" }, options)).rejects.toMatchObject({ code: "REJECTED" });
    const [identity] = await owner`SELECT status FROM public.identities WHERE id = ${identityTarget.identityId}::uuid`;
    expect(identity!.status).toBe("suspended");
  });

  test("changes membership role through the organization administrator's real AAL2 client", async () => {
    const { organizationAdmin, organizationId, targetMembershipId, owner } = current();
    const client = elevatedClient(organizationAdmin);
    const permission = await authorizePermission("org.members.change_role", { kind: "organization", organizationId }, { supabase: client });
    expect(permission?.identityId).toBe(organizationAdmin.identityId);
    const input = { ...apiCommandMetadata(), organizationId, membershipId: targetMembershipId, roleKey: "contributor" as const };
    const receipt = await changeMembershipRole(input, { supabase: client });
    expect(await changeMembershipRole(input, { supabase: client })).toEqual(receipt);
    expect(receipt.action).toBe("membership.role.change");
    const [member] = await owner`SELECT role, role_key FROM public.org_members WHERE id = ${targetMembershipId}::uuid`;
    expect(member).toEqual({ role: "contributor", role_key: "contributor" });
    const [audit] = await owner`
      SELECT actor_identity_id, organization_id, before_summary, after_summary
      FROM public.audit_events WHERE idempotency_key = ${input.idempotencyKey}
    `;
    expect(audit).toEqual({
      actor_identity_id: organizationAdmin.identityId, organization_id: organizationId,
      before_summary: { stable_key: "viewer" }, after_summary: { stable_key: "contributor" },
    });
  });

  test("suspends and restores one membership without changing its role", async () => {
    const { organizationAdmin, organizationId, targetMembershipId, owner } = current();
    for (const status of ["suspended", "active"] as const) {
      const receipt = await changeMembershipStatus({
        ...apiCommandMetadata(), organizationId, membershipId: targetMembershipId, status,
      }, { supabase: elevatedClient(organizationAdmin) });
      expect(receipt.action).toBe("membership.status.change");
      const [stored] = await owner`SELECT status, role_key FROM public.org_members WHERE id = ${targetMembershipId}::uuid`;
      expect(stored).toEqual({ status, role_key: "contributor" });
    }
  });

  test("denies a forged organization context without changing membership", async () => {
    const { organizationAdmin, targetMembershipId, owner } = current();
    await expect(changeMembershipRole({
      ...apiCommandMetadata(), organizationId: randomUUID(), membershipId: targetMembershipId, roleKey: "viewer",
    }, { supabase: elevatedClient(organizationAdmin) })).rejects.toMatchObject({ name: "AuthorizationError" });
    const [stored] = await owner`SELECT role_key FROM public.org_members WHERE id = ${targetMembershipId}::uuid`;
    expect(stored!.role_key).toBe("contributor");
  });

  test("keeps raw command receipts unreadable for anonymous and authenticated users", async () => {
    const { anonymous, pair } = current();
    for (const client of [anonymous, elevatedClient(pair[0])]) {
      const rows = await client.from("security_command_receipts").select("id,request_digest,audit_event_id");
      expect(rows.data).toBeNull();
      expect(rows.error?.code).toBe("42501");
      const count = await client.from("security_command_receipts").select("id", { count: "exact", head: true });
      expect(count.count).toBeNull();
      expect(count.error).not.toBeNull();
    }
  });

  test("cannot invoke owner bootstrap helpers through the Data API", async () => {
    const { pair } = current();
    const response = await elevatedClient(pair[0]).schema("mmhr_private").rpc("r1_prepare_super_admin_bootstrap", {
      first_target: pair[0].identityId, second_target: pair[1].identityId,
      product_reference: `product:${randomUUID()}`, security_reference: `security:${randomUUID()}`, correlation_id: randomUUID(),
    });
    expect(response.data).toBeNull();
    expect(response.error).not.toBeNull();
  });

  test("denies stale AAL2 authorization, reads, and mutations after session deletion with factors still verified", async () => {
    const { organizationAdmin, organizationId, targetMembershipId, owner } = current();
    const client = elevatedClient(organizationAdmin);
    const claims = await verifiedApiClaims(client, "aal2");
    const before = await client.rpc("mmhr_get_organization_members", { organization_id: organizationId });
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(2);
    const [factorsBefore] = await owner`
      SELECT count(*)::integer AS count FROM auth.mfa_factors
      WHERE user_id = ${organizationAdmin.subjectId}::uuid AND status = 'verified'
    `;
    expect(factorsBefore!.count).toBeGreaterThan(0);
    const deleted = await owner`
      DELETE FROM auth.sessions WHERE id = ${claims.sessionId}::uuid
        AND user_id = ${organizationAdmin.subjectId}::uuid RETURNING id
    `;
    expect([...deleted]).toEqual([{ id: claims.sessionId }]);
    const [factorsAfter] = await owner`
      SELECT count(*)::integer AS count FROM auth.mfa_factors
      WHERE user_id = ${organizationAdmin.subjectId}::uuid AND status = 'verified'
    `;
    expect(factorsAfter!.count).toBe(factorsBefore!.count);

    const authorization = await client.rpc("mmhr_authorize", {
      permission_key: "org.members.change_role", organization_id: organizationId,
    });
    expect(authorization.error).toBeNull();
    expect(authorization.data).toEqual([]);
    expect(await authorizePermission("org.members.change_role", { kind: "organization", organizationId }, { supabase: client })).toBeNull();
    for (const [rpc, args] of [
      ["mmhr_get_my_identity", {}], ["mmhr_get_my_memberships", {}],
      ["mmhr_get_organization", { organization_id: organizationId }],
      ["mmhr_get_organization_members", { organization_id: organizationId }],
      ["mmhr_get_audit_events", { organization_id: organizationId }],
    ] as const) {
      const read = await client.rpc(rpc, args);
      expect(read.error, rpc).toBeNull();
      expect(read.data, rpc).toEqual([]);
    }
    const metadata = apiCommandMetadata();
    const mutation = await client.rpc("mmhr_change_membership_role", {
      organization_id: organizationId, membership_id: targetMembershipId, role_key: "viewer",
      reason: metadata.reason, correlation_id: randomUUID(), idempotency_key: metadata.idempotencyKey,
    });
    expect(mutation.data).toBeNull();
    expect(mutation.error?.code).toBe("42501");
    await expect(changeMembershipRole({ ...metadata, organizationId, membershipId: targetMembershipId, roleKey: "viewer" },
      { supabase: client })).rejects.toMatchObject({ name: "AuthorizationError" });
    const [member] = await owner`SELECT role_key FROM public.org_members WHERE id = ${targetMembershipId}::uuid`;
    expect(member!.role_key).toBe("contributor");
    const [receipt] = await owner`SELECT count(*)::integer AS count FROM public.security_command_receipts
      WHERE idempotency_key = ${metadata.idempotencyKey}::uuid`;
    expect(receipt!.count).toBe(0);
  });
});
