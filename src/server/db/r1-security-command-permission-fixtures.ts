import { expect } from "vitest";

import {
  asAuthenticated,
  commandInput,
  createSecurityPrincipal,
  denied,
  securitySnapshot,
  type SecurityCommandFixture,
  type SecurityCommandInput,
  type SecurityPrincipal,
  type SecuritySql,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

export type SecurityReceipt = { receipt_id: string; entity_id: string; action: string };
export type CeilingFlags = {
  canView: boolean;
  canGrant: boolean;
  canRevoke: boolean;
  canDelegate: boolean;
};
export type PermissionScope = {
  permissionKey: string;
  organizationId: string | null;
  expiresAt: string | null;
};
export type OverrideRequest = PermissionScope & {
  targetIdentityId: string;
  effect: "allow" | "deny";
  sourceDelegationId: string | null;
};
export type DelegationRequest = PermissionScope & CeilingFlags & {
  granteeIdentityId: string;
  parentGrantId: string | null;
};
export type PermissionCase = readonly [
  string,
  (sql: SecurityTransaction, fixture: SecurityCommandFixture) => Promise<void>,
];

export const noCeilings: CeilingFlags = {
  canView: false, canGrant: false, canRevoke: false, canDelegate: false,
};
export const allCeilings: CeilingFlags = {
  canView: true, canGrant: true, canRevoke: true, canDelegate: true,
};

export function overrideRequest(targetIdentityId: string): OverrideRequest {
  return {
    targetIdentityId, permissionKey: "audit.export", organizationId: null,
    effect: "allow", expiresAt: null, sourceDelegationId: null,
  };
}

export function delegationRequest(granteeIdentityId: string): DelegationRequest {
  return {
    granteeIdentityId, permissionKey: "audit.export", organizationId: null,
    expiresAt: null, parentGrantId: null, ...allCeilings,
  };
}

export async function setOverride(sql: SecuritySql, request: OverrideRequest, input = commandInput()) {
  const [result] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_set_permission_override(
      ${request.targetIdentityId}::uuid, ${request.permissionKey}, ${request.organizationId}::uuid,
      ${request.effect}, ${request.expiresAt}::timestamptz, ${request.sourceDelegationId}::uuid,
      ${input.reason}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function revokeOverride(
  sql: SecuritySql,
  overrideId: string,
  expectedEffect: "allow" | "deny",
  input = commandInput(),
) {
  const [result] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_revoke_permission_override(
      ${overrideId}::uuid, ${expectedEffect}, ${input.reason},
      ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function setDelegation(sql: SecuritySql, request: DelegationRequest, input = commandInput()) {
  const [result] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_set_delegation(
      ${request.granteeIdentityId}::uuid, ${request.permissionKey}, ${request.organizationId}::uuid,
      ${request.canView}, ${request.canGrant}, ${request.canRevoke}, ${request.canDelegate},
      ${request.expiresAt}::timestamptz, ${request.parentGrantId}::uuid,
      ${input.reason}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function revokeDelegation(sql: SecuritySql, grantId: string, input = commandInput()) {
  const [result] = await sql<{ receipt: SecurityReceipt }[]>`
    SELECT public.mmhr_revoke_delegation(
      ${grantId}::uuid, ${input.reason}, ${input.correlationId}::uuid, ${input.idempotencyKey}::uuid
    ) AS receipt
  `;
  return result!.receipt;
}

export async function readAdministration(
  sql: SecuritySql,
  permissionKey: string,
  organizationId: string | null = null,
  limit = 50,
  afterOverrideId: string | null = null,
  afterDelegationId: string | null = null,
) {
  const [result] = await sql<{
    result: { overrides: Record<string, unknown>[]; delegations: Record<string, unknown>[]; roles: unknown[] };
  }[]>`
    SELECT public.mmhr_read_permission_administration(
      ${permissionKey}, ${organizationId}::uuid, ${limit},
      ${afterOverrideId}::uuid, ${afterDelegationId}::uuid
    ) AS result
  `;
  return result!.result;
}

export async function createPermissionActor(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  withActionPermissions = true,
) {
  const principal = await createSecurityPrincipal(sql);
  await sql`
    INSERT INTO public.platform_role_assignments (identity_id, role_key, assigned_by_identity_id, assignment_reason)
    VALUES (${principal.identityId}::uuid, 'admin', ${fixture.pair[0].identityId}::uuid,
      'Isolated internal permission administrator')
  `;
  if (withActionPermissions) {
    for (const capability of ["view", "grant", "revoke", "delegate"]) {
      await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
        ...overrideRequest(principal.identityId), permissionKey: `permissions.${capability}`,
      }));
    }
  }
  return principal;
}

export async function requirePermissionUse(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  permissionKey: string,
  organizationId: string | null,
  allowed: boolean,
) {
  const rows = await asAuthenticated(sql, principal, (probe) => probe`
    SELECT * FROM public.mmhr_authorize(${permissionKey}, ${organizationId}::uuid)
  `);
  expect(rows).toHaveLength(allowed ? 1 : 0);
}

export async function assertDeniedWithoutWrite(sql: SecurityTransaction, invoke: () => Promise<unknown>) {
  const before = await securitySnapshot(sql);
  await expect(invoke()).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
}

export async function requireReceiptAudit(
  sql: SecuritySql,
  actor: SecurityPrincipal,
  receipt: SecurityReceipt,
  input: SecurityCommandInput,
  command: string,
) {
  const records = await sql<{
    id: string; entity_id: string; action: string; actor_identity_id: string;
    command: string; event_id: string; correlation_id: string; reason: string;
  }[]>`
    SELECT receipt.id, receipt.entity_id, receipt.action, receipt.actor_identity_id,
      receipt.command, event.id AS event_id, event.correlation_id, event.reason
    FROM public.security_command_receipts AS receipt
    JOIN public.audit_events AS event ON event.id = receipt.audit_event_id
      AND event.actor_identity_id = receipt.actor_identity_id
      AND event.command = receipt.command AND event.entity_id = receipt.entity_id::text
      AND event.idempotency_key = receipt.idempotency_key::text
    WHERE receipt.actor_identity_id = ${actor.identityId}::uuid
      AND receipt.command = ${command} AND receipt.idempotency_key = ${input.idempotencyKey}::uuid
  `;
  expect(records).toHaveLength(1);
  expect(records[0]).toEqual({
    id: receipt.receipt_id, entity_id: receipt.entity_id, action: receipt.action,
    actor_identity_id: actor.identityId, command, event_id: expect.any(String),
    correlation_id: input.correlationId, reason: input.reason,
  });
  const events = await sql<{ id: string }[]>`
    SELECT id FROM public.audit_events WHERE actor_identity_id = ${actor.identityId}::uuid
      AND command = ${command} AND idempotency_key = ${input.idempotencyKey}
  `;
  expect(events).toEqual([{ id: records[0]!.event_id }]);
}
