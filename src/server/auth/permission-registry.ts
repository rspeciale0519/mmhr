import { z } from "zod";

export const assuranceLevels = ["aal1", "aal2"] as const;
export type AssuranceLevel = (typeof assuranceLevels)[number];
export const assuranceLevelSchema = z.enum(assuranceLevels);

export const permissionKeys = [
  "workspace.access",
  "admin.access",
  "portal.customer.access",
  "portal.vendor.access",
  "org.members.view",
  "org.members.invite",
  "org.members.change_role",
  "org.members.revoke",
  "org.members.status.change",
  "identity.status.change",
  "identity.relink",
  "identity.recovery.request",
  "identity.recovery.approve",
  "org.status.change",
  "org.type.change",
  "platform_roles.assign",
  "platform_roles.revoke",
  "role_versions.activate",
  "permissions.view",
  "permissions.grant",
  "permissions.revoke",
  "permissions.delegate",
  "portal.access.grant",
  "portal.access.revoke",
  "audit.view",
  "audit.export",
  "org.name.read",
  "member.role.read",
  "member.role.update",
  "audit.change_summary.read",
  "finance.manage",
  "rfp.approve",
  "rfp.distribute",
  "intake.draft.save",
  "intake.requirement.save",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];
export const permissionKeySchema = z.enum(permissionKeys);

export type PermissionDefinition = {
  kind: "feature" | "action" | "field";
  platformScope: boolean;
  organizationScope: boolean;
  minimumAssurance: AssuranceLevel;
  internalOnly: boolean;
  requiredPortal: "customer" | "vendor" | null;
  description: string;
};

export const permissionRegistry = {
  "workspace.access": {
    kind: "feature", platformScope: true, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: null,
    description: "Access an authorized workspace.",
  },
  "admin.access": {
    kind: "feature", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Access the internal administration workspace.",
  },
  "portal.customer.access": {
    kind: "feature", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: "customer",
    description: "Access an authorized customer portal.",
  },
  "portal.vendor.access": {
    kind: "feature", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: "vendor",
    description: "Access an authorized vendor portal.",
  },
  "org.members.view": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Read authorized organization members.",
  },
  "org.members.invite": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Invite members to an authorized organization.",
  },
  "org.members.change_role": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Change an authorized organization membership role.",
  },
  "org.members.revoke": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Revoke an authorized organization membership.",
  },
  "org.members.status.change": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Activate or suspend an authorized organization membership.",
  },
  "identity.status.change": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Change identity status through an audited command.",
  },
  "identity.relink": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Request an approved two-person identity relink.",
  },
  "identity.recovery.request": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Request approved identity recovery.",
  },
  "identity.recovery.approve": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Approve identity recovery within the named recovery pair.",
  },
  "org.status.change": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Change organization status through an audited command.",
  },
  "org.type.change": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Change organization type through an audited command.",
  },
  "platform_roles.assign": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Assign an authorized platform role.",
  },
  "platform_roles.revoke": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Revoke an authorized platform role.",
  },
  "role_versions.activate": {
    kind: "action", platformScope: true, organizationScope: false,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Activate an approved role version.",
  },
  "permissions.view": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Read permissions within the active delegation ceiling.",
  },
  "permissions.grant": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Grant permissions within the active delegation ceiling.",
  },
  "permissions.revoke": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Revoke permissions within the active delegation ceiling.",
  },
  "permissions.delegate": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Delegate permissions within the active delegation ceiling.",
  },
  "portal.access.grant": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Grant access to an authorized organization portal.",
  },
  "portal.access.revoke": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Revoke access to an authorized organization portal.",
  },
  "audit.view": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Read authorized audit event metadata.",
  },
  "audit.export": {
    kind: "action", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Export authorized audit events through an audited command.",
  },
  "org.name.read": {
    kind: "field", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: null,
    description: "Read an authorized organization name.",
  },
  "member.role.read": {
    kind: "field", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: null,
    description: "Read an authorized membership role.",
  },
  "member.role.update": {
    kind: "field", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Update an authorized membership role field.",
  },
  "audit.change_summary.read": {
    kind: "field", platformScope: true, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: false, requiredPortal: null,
    description: "Read an authorized redacted audit change summary.",
  },
  "finance.manage": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Manage authorized organization finance records.",
  },
  "rfp.approve": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Approve organization RFP versions after MMHR review.",
  },
  "rfp.distribute": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal2", internalOnly: true, requiredPortal: null,
    description: "Distribute organization RFP versions with MMHR approval.",
  },
  "intake.draft.save": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: "customer",
    description: "Save draft intake answers in an authorized customer portal.",
  },
  "intake.requirement.save": {
    kind: "action", platformScope: false, organizationScope: true,
    minimumAssurance: "aal1", internalOnly: false, requiredPortal: "customer",
    description: "Save intake requirements in an authorized customer portal.",
  },
} as const satisfies Record<PermissionKey, PermissionDefinition>;

export const permissionScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("platform") }),
  z.strictObject({
    kind: z.literal("organization"),
    organizationId: z.uuid().transform((value) => value.toLowerCase()),
  }),
]);

export type PermissionScope = z.infer<typeof permissionScopeSchema>;

export function isPermissionKey(value: unknown): value is PermissionKey {
  return permissionKeySchema.safeParse(value).success;
}

export function parsePermissionScope(value: unknown): PermissionScope | null {
  const result = permissionScopeSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isPermissionScopeAllowed(
  permission: PermissionKey,
  scope: PermissionScope,
): boolean {
  if (!isPermissionKey(permission)) return false;
  const parsedScope = parsePermissionScope(scope);
  if (!parsedScope) return false;
  const definition = permissionRegistry[permission];
  return parsedScope.kind === "platform"
    ? definition.platformScope
    : definition.organizationScope;
}

export type RoleKey =
  | "super_admin" | "admin" | "staff"
  | "organization_admin" | "contributor" | "viewer";

// These are explicit versioned defaults, not a runtime wildcard. Database
// authorization still checks current role versions, overrides, and scope.
export const rolePermissionDefaults = {
  super_admin: [
    "workspace.access",
    "admin.access",
    "portal.customer.access",
    "portal.vendor.access",
    "org.members.view",
    "org.members.invite",
    "org.members.change_role",
    "org.members.revoke",
    "org.members.status.change",
    "identity.status.change",
    "identity.relink",
    "identity.recovery.request",
    "identity.recovery.approve",
    "org.status.change",
    "org.type.change",
    "platform_roles.assign",
    "platform_roles.revoke",
    "role_versions.activate",
    "permissions.view",
    "permissions.grant",
    "permissions.revoke",
    "permissions.delegate",
    "portal.access.grant",
    "portal.access.revoke",
    "audit.view",
    "audit.export",
    "org.name.read",
    "member.role.read",
    "member.role.update",
    "audit.change_summary.read",
    "finance.manage",
    "rfp.approve",
    "rfp.distribute",
    "intake.draft.save",
    "intake.requirement.save",
  ],
  admin: [
    "workspace.access",
    "admin.access",
    "org.name.read",
    "member.role.read",
  ],
  staff: [
    "workspace.access",
    "admin.access",
    "org.name.read",
    "member.role.read",
  ],
  organization_admin: [
    "workspace.access",
    "portal.customer.access",
    "portal.vendor.access",
    "org.members.view",
    "org.members.invite",
    "org.members.change_role",
    "org.members.revoke",
    "org.members.status.change",
    "org.name.read",
    "member.role.read",
    "member.role.update",
    "audit.view",
    "intake.draft.save",
    "intake.requirement.save",
  ],
  contributor: [
    "workspace.access",
    "portal.customer.access",
    "portal.vendor.access",
    "org.name.read",
    "member.role.read",
    "intake.draft.save",
    "intake.requirement.save",
  ],
  viewer: [
    "workspace.access",
    "portal.customer.access",
    "portal.vendor.access",
    "org.name.read",
    "member.role.read",
  ],
} as const satisfies Record<RoleKey, readonly PermissionKey[]>;
