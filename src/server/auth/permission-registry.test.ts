import { describe, expect, expectTypeOf, test } from "vitest";

import {
  assuranceLevelSchema,
  isPermissionKey,
  isPermissionScopeAllowed,
  parsePermissionScope,
  permissionKeySchema,
  permissionKeys,
  permissionRegistry,
  permissionScopeSchema,
  rolePermissionDefaults,
  type PermissionKey,
  type PermissionScope,
} from "./permission-registry";

const organizationId = "abcdef01-2345-4678-9abc-def012345678";

const expectedKeys = [
  "workspace.access", "admin.access", "portal.customer.access", "portal.vendor.access",
  "org.members.view", "org.members.invite", "org.members.change_role", "org.members.revoke",
  "org.members.status.change", "identity.status.change", "identity.relink",
  "identity.recovery.request", "identity.recovery.approve", "org.status.change", "org.type.change",
  "platform_roles.assign", "platform_roles.revoke", "role_versions.activate",
  "permissions.view", "permissions.grant", "permissions.revoke", "permissions.delegate",
  "portal.access.grant", "portal.access.revoke", "audit.view", "audit.export",
  "org.name.read", "member.role.read", "member.role.update", "audit.change_summary.read",
  "finance.manage",
  "rfp.approve", "rfp.distribute",
];

describe("R1 permission registry", () => {
  test("defines exactly the 33 current permissions", () => {
    expect(permissionKeys).toEqual(expectedKeys);
    expect(Object.keys(permissionRegistry)).toEqual(expectedKeys);
    expect(new Set(permissionKeys).size).toBe(33);
    for (const key of expectedKeys) {
      expect(isPermissionKey(key)).toBe(true);
      expect(permissionKeySchema.parse(key)).toBe(key);
    }
  });

  test("preserves strict permission and scope types", () => {
    expectTypeOf<PermissionKey>().extract<"workspace.access">().toEqualTypeOf<"workspace.access">();
    expectTypeOf<PermissionKey>().extract<"unknown.permission">().toEqualTypeOf<never>();
    expectTypeOf<PermissionScope>().extract<{ kind: "platform" }>().toEqualTypeOf<{ kind: "platform" }>();
    expectTypeOf<PermissionScope>().extract<{ kind: "organization" }>().toEqualTypeOf<{
      kind: "organization";
      organizationId: string;
    }>();
  });

  test.each([
    "", "*", "identity.*", "unknown.permission", "Workspace.access",
    "workspace.access ", "__proto__", "constructor", "toString", null, undefined, 1,
  ])("rejects an unknown permission: %s", (key) => {
    expect(isPermissionKey(key)).toBe(false);
    expect(permissionKeySchema.safeParse(key).success).toBe(false);
  });

  test.each([
    ["workspace.access", "feature", true, true, "aal1", false, null],
    ["admin.access", "feature", true, false, "aal2", true, null],
    ["portal.customer.access", "feature", false, true, "aal1", false, "customer"],
    ["portal.vendor.access", "feature", false, true, "aal1", false, "vendor"],
    ["org.members.view", "action", false, true, "aal2", false, null],
    ["org.members.invite", "action", false, true, "aal2", false, null],
    ["org.members.change_role", "action", false, true, "aal2", false, null],
    ["org.members.revoke", "action", false, true, "aal2", false, null],
    ["org.members.status.change", "action", false, true, "aal2", false, null],
    ["identity.status.change", "action", true, false, "aal2", true, null],
    ["identity.relink", "action", true, false, "aal2", true, null],
    ["identity.recovery.request", "action", true, false, "aal2", true, null],
    ["identity.recovery.approve", "action", true, false, "aal2", true, null],
    ["org.status.change", "action", true, false, "aal2", true, null],
    ["org.type.change", "action", true, false, "aal2", true, null],
    ["platform_roles.assign", "action", true, false, "aal2", true, null],
    ["platform_roles.revoke", "action", true, false, "aal2", true, null],
    ["role_versions.activate", "action", true, false, "aal2", true, null],
    ["permissions.view", "action", true, true, "aal2", false, null],
    ["permissions.grant", "action", true, true, "aal2", false, null],
    ["permissions.revoke", "action", true, true, "aal2", false, null],
    ["permissions.delegate", "action", true, true, "aal2", true, null],
    ["portal.access.grant", "action", false, true, "aal2", true, null],
    ["portal.access.revoke", "action", false, true, "aal2", true, null],
    ["audit.view", "action", true, true, "aal2", false, null],
    ["audit.export", "action", true, true, "aal2", false, null],
    ["org.name.read", "field", false, true, "aal1", false, null],
    ["member.role.read", "field", false, true, "aal1", false, null],
    ["member.role.update", "field", false, true, "aal2", false, null],
    ["audit.change_summary.read", "field", true, true, "aal2", false, null],
    ["finance.manage", "action", false, true, "aal2", true, null],
    ["rfp.approve", "action", false, true, "aal2", true, null],
    ["rfp.distribute", "action", false, true, "aal2", true, null],
  ] as const)("declares scope, assurance, and boundaries for %s", (
    key, kind, platformScope, organizationScope, minimumAssurance, internalOnly, requiredPortal,
  ) => {
    expect(permissionRegistry[key]).toEqual({
      kind, platformScope, organizationScope, minimumAssurance, internalOnly, requiredPortal,
      description: expect.any(String),
    });
    expect(permissionRegistry[key].description.trim().length).toBeGreaterThan(0);
    expect(isPermissionScopeAllowed(key, { kind: "platform" })).toBe(platformScope);
    expect(isPermissionScopeAllowed(key, { kind: "organization", organizationId })).toBe(organizationScope);
  });

  test("accepts only declared assurance levels", () => {
    expect(assuranceLevelSchema.parse("aal1")).toBe("aal1");
    expect(assuranceLevelSchema.parse("aal2")).toBe("aal2");
    expect(assuranceLevelSchema.safeParse("aal3").success).toBe(false);
    expect(assuranceLevelSchema.safeParse(undefined).success).toBe(false);
  });

  test("parses platform scope and normalizes organization UUIDs", () => {
    expect(parsePermissionScope({ kind: "platform" })).toEqual({ kind: "platform" });
    expect(parsePermissionScope({
      kind: "organization", organizationId: organizationId.toUpperCase(),
    })).toEqual({ kind: "organization", organizationId });
  });

  test.each([
    { value: null }, { value: undefined }, { value: [] }, { value: "platform" }, { value: {} },
    { value: { kind: "platform", organizationId } },
    { value: { kind: "organization" } },
    { value: { kind: "organization", organizationId: "invalid" } },
    { value: { kind: "organization", organizationId: 1 } },
    { value: { kind: "organization", organizationId, actorId: organizationId } },
    { value: { kind: "organization", organizationId, supabase: {} } },
    { value: { kind: "resource", organizationId } },
  ])("rejects malformed or undeclared scope fields: $value", ({ value }) => {
    expect(parsePermissionScope(value)).toBeNull();
    expect(permissionScopeSchema.safeParse(value).success).toBe(false);
    expect(isPermissionScopeAllowed("workspace.access", value as PermissionScope)).toBe(false);
  });

  test("does not allow unknown keys through the scope check", () => {
    expect(isPermissionScopeAllowed("unknown.permission" as PermissionKey, { kind: "platform" })).toBe(false);
  });

  test("uses explicit Super Admin defaults and bounded organization defaults", () => {
    expect(rolePermissionDefaults.super_admin).toEqual(expectedKeys);
    const internalReads = ["workspace.access", "admin.access", "org.name.read", "member.role.read"];
    expect(rolePermissionDefaults.admin).toEqual(internalReads);
    expect(rolePermissionDefaults.staff).toEqual(internalReads);
    expect(rolePermissionDefaults.organization_admin).toEqual([
      "workspace.access", "portal.customer.access", "portal.vendor.access", "org.members.view",
      "org.members.invite", "org.members.change_role", "org.members.revoke", "org.members.status.change",
      "org.name.read", "member.role.read", "member.role.update", "audit.view",
    ]);
    const externalReads = [
      "workspace.access", "portal.customer.access", "portal.vendor.access", "org.name.read", "member.role.read",
    ];
    expect(rolePermissionDefaults.contributor).toEqual(externalReads);
    expect(rolePermissionDefaults.viewer).toEqual(externalReads);
    expect(Object.keys(rolePermissionDefaults)).toEqual([
      "super_admin", "admin", "staff", "organization_admin", "contributor", "viewer",
    ]);
    for (const defaults of Object.values(rolePermissionDefaults)) {
      expect(new Set(defaults).size).toBe(defaults.length);
      expect(defaults.every(isPermissionKey)).toBe(true);
    }
  });
});
