import { describe, expect, test, vi } from "vitest";

import * as schemas from "./security-inputs";

vi.mock("server-only", () => ({}));

const id = "abcdef01-2345-4678-9abc-def012345678";
const metadata = { reason: "Approved access review", idempotencyKey: id };
const override = {
  ...metadata, targetIdentityId: id, permissionKey: "workspace.access", organizationId: null,
  effect: "allow", expiresAt: null, sourceDelegationId: null,
};
const delegation = {
  ...metadata, granteeIdentityId: id, permissionKey: "workspace.access", organizationId: null,
  canView: false, canGrant: false, canRevoke: false, canDelegate: false, expiresAt: null, parentGrantId: null,
};

const cases = [
  { name: "assignPlatformRole", schema: schemas.assignPlatformRoleSchema, valid: { ...metadata, targetIdentityId: id, roleKey: "staff" } },
  { name: "revokePlatformRole", schema: schemas.revokePlatformRoleSchema, valid: { ...metadata, assignmentId: id } },
  { name: "activateRoleVersion", schema: schemas.activateRoleVersionSchema, valid: { ...metadata, roleDefinitionId: id } },
  { name: "setPermissionOverride", schema: schemas.setPermissionOverrideSchema, valid: override },
  { name: "revokePermissionOverride", schema: schemas.revokePermissionOverrideSchema, valid: { ...metadata, overrideId: id, expectedEffect: "allow" } },
  { name: "setDelegation", schema: schemas.setDelegationSchema, valid: delegation },
  { name: "revokeDelegation", schema: schemas.revokeDelegationSchema, valid: { ...metadata, grantId: id } },
  { name: "changeIdentityStatus", schema: schemas.changeIdentityStatusSchema, valid: { ...metadata, targetIdentityId: id, status: "active" } },
  { name: "changeOrganizationStatus", schema: schemas.changeOrganizationStatusSchema, valid: { ...metadata, organizationId: id, status: "active" } },
  { name: "changeOrganizationType", schema: schemas.changeOrganizationTypeSchema, valid: { ...metadata, organizationId: id, type: "customer" } },
  { name: "changeMembershipStatus", schema: schemas.changeMembershipStatusSchema, valid: { ...metadata, organizationId: id, membershipId: id, status: "active" } },
  { name: "changeMembershipRole", schema: schemas.changeMembershipRoleSchema, valid: { ...metadata, organizationId: id, membershipId: id, roleKey: "viewer" } },
  { name: "grantPortalAccess", schema: schemas.grantPortalAccessSchema, valid: { ...metadata, organizationId: id, portal: "customer" } },
  { name: "revokePortalAccess", schema: schemas.revokePortalAccessSchema, valid: { ...metadata, organizationId: id, grantId: id } },
];

describe("security command inputs", () => {
  test.each(cases)("validates a complete $name request", ({ schema, valid }) => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  test.each(cases)("rejects unknown $name fields and forged actors", ({ schema, valid }) => {
    for (const extra of [{ actorId: id }, { actor_id: id }, { actorIdentityId: id }, { correlationId: id }, { unexpected: true }]) {
      expect(schema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  test.each(cases)("requires valid metadata for $name", ({ schema, valid }) => {
    for (const invalid of [
      { reason: "" }, { reason: " " }, { reason: "x".repeat(501) }, { reason: null }, { reason: undefined },
      { reason: "Review https://example.com" }, { idempotencyKey: "not-a-uuid" }, { idempotencyKey: undefined },
    ]) expect(schema.safeParse({ ...valid, ...invalid }).success).toBe(false);
  });

  test("normalizes UUIDs without converting arbitrary values", () => {
    const result = schemas.assignPlatformRoleSchema.parse({ ...metadata, targetIdentityId: id.toUpperCase(), roleKey: "admin" });
    expect(result.targetIdentityId).toBe(id);
    expect(schemas.assignPlatformRoleSchema.safeParse({ ...metadata, targetIdentityId: 123, roleKey: "admin" }).success).toBe(false);
  });

  test.each([
    { permissionKey: "org.name.read", organizationId: null },
    { permissionKey: "admin.access", organizationId: id },
    { permissionKey: "unknown.permission", organizationId: null },
    { permissionKey: "workspace.access", organizationId: "invalid" },
  ])("rejects unsupported override and delegation scopes: %j", (scope) => {
    expect(schemas.setPermissionOverrideSchema.safeParse({ ...override, ...scope }).success).toBe(false);
    expect(schemas.setDelegationSchema.safeParse({ ...delegation, ...scope }).success).toBe(false);
  });

  test.each([
    { permissionKey: "workspace.access", organizationId: null },
    { permissionKey: "workspace.access", organizationId: id },
    { permissionKey: "org.name.read", organizationId: id },
    { permissionKey: "admin.access", organizationId: null },
  ])("keeps platform and exact organization target scopes distinct: %j", (scope) => {
    expect(schemas.setPermissionOverrideSchema.safeParse({ ...override, ...scope }).success).toBe(true);
    expect(schemas.setDelegationSchema.safeParse({ ...delegation, ...scope }).success).toBe(true);
  });

  test("requires all four independent delegation flags without truthy coercion", () => {
    for (const flag of ["canView", "canGrant", "canRevoke", "canDelegate"]) {
      for (const value of [undefined, null, 1, "true", "false"]) {
        expect(schemas.setDelegationSchema.safeParse({ ...delegation, [flag]: value }).success).toBe(false);
      }
    }
  });

  test("does not accept generic recovery or pending-state transitions", () => {
    expect(schemas.changeIdentityStatusSchema.safeParse({ ...metadata, targetIdentityId: id, status: "recovery_pending" }).success).toBe(false);
    expect(schemas.changeOrganizationStatusSchema.safeParse({ ...metadata, organizationId: id, status: "pending" }).success).toBe(false);
    expect(schemas.changeMembershipStatusSchema.safeParse({ ...metadata, organizationId: id, membershipId: id, status: "invited" }).success).toBe(false);
  });

  test("rejects a platform role supplied as a membership role", () => {
    expect(schemas.changeMembershipRoleSchema.safeParse({ ...metadata, organizationId: id, membershipId: id, roleKey: "super_admin" }).success).toBe(false);
  });

  test.each([undefined, "invalid", "2026-08-30", "2026-08-30T12:00:00", "2026-02-30T12:00:00Z"])(
    "requires an explicit expiry or null: %s", (expiresAt) => {
      expect(schemas.setPermissionOverrideSchema.safeParse({ ...override, expiresAt }).success).toBe(false);
      expect(schemas.setDelegationSchema.safeParse({ ...delegation, expiresAt }).success).toBe(false);
    },
  );

  test("requires the expected stored override effect on revocation", () => {
    expect(schemas.revokePermissionOverrideSchema.safeParse({ ...metadata, overrideId: id }).success).toBe(false);
    expect(schemas.revokePermissionOverrideSchema.safeParse({ ...metadata, overrideId: id, expectedEffect: "unknown" }).success).toBe(false);
  });
});
