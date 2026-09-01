import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const description = z.string().trim().max(2_000).nullable();

export const customerStatuses = ["prospect", "active", "paused", "closed", "archived"] as const;
export const vendorStatuses = ["prospect", "active", "paused", "archived"] as const;
export const productStatuses = ["draft", "active", "retired", "archived"] as const;
export const contactStatuses = ["active", "inactive", "archived"] as const;
export const relationshipStatuses = ["active", "paused", "ended", "archived"] as const;

const auditFields = {
  revision: z.number().int().positive(),
  correlationId: uuid,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

function withAuditOrder<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((record, context) => {
    const value = record as { createdAt?: string; updatedAt?: string };
    if (value.createdAt && value.updatedAt && Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
      context.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
    }
  });
}

export const customerProfileSchema = withAuditOrder(z.strictObject({
  profileId: uuid,
  organizationId: uuid,
  status: z.enum(customerStatuses),
  businessContext: description,
  currentSoftware: description,
  purchaseHistory: z.array(z.string().trim().min(1).max(500)).max(100).nullable(),
  contractStartAt: timestamp.nullable(),
  contractEndAt: timestamp.nullable(),
  renewalWindowStartAt: timestamp.nullable(),
  renewalWindowEndAt: timestamp.nullable(),
  ...auditFields,
}).superRefine((record, context) => {
  if (record.contractStartAt && record.contractEndAt && Date.parse(record.contractEndAt) < Date.parse(record.contractStartAt)) {
    context.addIssue({ code: "custom", path: ["contractEndAt"], message: "Contract end cannot precede start" });
  }
  if (record.renewalWindowStartAt && record.renewalWindowEndAt && Date.parse(record.renewalWindowEndAt) < Date.parse(record.renewalWindowStartAt)) {
    context.addIssue({ code: "custom", path: ["renewalWindowEndAt"], message: "Renewal end cannot precede start" });
  }
}));
export type CustomerProfile = Readonly<z.output<typeof customerProfileSchema>>;

export const vendorProfileSchema = withAuditOrder(z.strictObject({
  profileId: uuid,
  organizationId: uuid,
  status: z.enum(vendorStatuses),
  description,
  approvedCommercialMetadata: z.record(z.string().trim().min(1).max(100), z.string().trim().max(500)).nullable(),
  approvedAt: timestamp.nullable(),
  approvedByIdentityId: uuid.nullable(),
  ...auditFields,
}).superRefine((record, context) => {
  const hasApproval = record.approvedAt !== null && record.approvedByIdentityId !== null;
  const hasPartialApproval = record.approvedAt !== null || record.approvedByIdentityId !== null;
  if (hasPartialApproval && !hasApproval) {
    context.addIssue({ code: "custom", path: ["approvedAt"], message: "Vendor approval evidence must be complete" });
  }
  if (record.status === "active" && !hasApproval) {
    context.addIssue({ code: "custom", path: ["status"], message: "Active vendors require approval evidence" });
  }
  if (record.approvedCommercialMetadata !== null && !hasApproval) {
    context.addIssue({ code: "custom", path: ["approvedCommercialMetadata"], message: "Commercial metadata requires approval" });
  }
}));
export type VendorProfile = Readonly<z.output<typeof vendorProfileSchema>>;

export const productSchema = withAuditOrder(z.strictObject({
  productId: uuid,
  organizationId: uuid,
  vendorOrganizationId: uuid,
  stableKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/),
  name: z.string().trim().min(1).max(200),
  description,
  status: z.enum(productStatuses),
  ...auditFields,
}).superRefine((record, context) => {
  if (record.organizationId === record.vendorOrganizationId) {
    context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "Owning and vendor organizations must differ" });
  }
}));
export type Product = Readonly<z.output<typeof productSchema>>;

export const contactSchema = withAuditOrder(z.strictObject({
  contactId: uuid,
  organizationId: uuid,
  identityId: uuid.nullable(),
  fullName: z.string().trim().min(1).max(200),
  normalizedEmail: z.string().trim().email().transform((value) => value.toLowerCase()).nullable(),
  phone: z.string().trim().max(50).nullable(),
  title: z.string().trim().max(200).nullable(),
  status: z.enum(contactStatuses),
  ...auditFields,
}));
export type Contact = Readonly<z.output<typeof contactSchema>>;

const endpointSchema = z.union([
  z.strictObject({ organizationId: uuid, contactId: z.null() }),
  z.strictObject({ organizationId: z.null(), contactId: uuid }),
]);

export const relationshipSchema = withAuditOrder(z.strictObject({
  relationshipId: uuid,
  organizationId: uuid,
  relationshipType: z.enum(["customer_vendor", "customer_contact", "vendor_contact", "partner", "other"]),
  subject: endpointSchema,
  related: endpointSchema,
  ownerIdentityId: uuid.nullable(),
  influence: z.enum(["unknown", "low", "medium", "high"]),
  preference: z.string().trim().max(500).nullable(),
  status: z.enum(relationshipStatuses),
  ...auditFields,
})).superRefine((record, context) => {
  if (record.subject.organizationId !== null && record.related.organizationId !== null
    && record.subject.organizationId === record.related.organizationId) {
    context.addIssue({ code: "custom", path: ["related", "organizationId"], message: "Relationship organizations must differ" });
  }
  if (record.subject.contactId !== null && record.related.contactId !== null
    && record.subject.contactId === record.related.contactId) {
    context.addIssue({ code: "custom", path: ["related", "contactId"], message: "Relationship contacts must differ" });
  }
});
export type Relationship = Readonly<z.output<typeof relationshipSchema>>;

export function parseCustomerProfile(input: unknown): CustomerProfile {
  const result = customerProfileSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid customer profile");
  return deepFreeze(result.data);
}

export function parseVendorProfile(input: unknown): VendorProfile {
  const result = vendorProfileSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid vendor profile");
  return deepFreeze(result.data);
}

export function parseProduct(input: unknown): Product {
  const result = productSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid product");
  return deepFreeze(result.data);
}

export function parseContact(input: unknown): Contact {
  const result = contactSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid contact");
  return deepFreeze(result.data);
}

export function parseRelationship(input: unknown): Relationship {
  const result = relationshipSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid relationship");
  return deepFreeze(result.data);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
