import { z } from "zod";

export const vendorCatalogReadSchema = z.strictObject({ organizationId: z.uuid(), profileId: z.uuid() });
export const vendorCatalogApprovalSchema = vendorCatalogReadSchema.extend({
  expectedRevision: z.number().int().positive().max(2147483647),
  reason: z.string().trim().min(1).max(500),
  approvalReference: z.string().trim().min(1).max(200),
  idempotencyKey: z.uuid(),
});
export const vendorCatalogProfileSchema = vendorCatalogReadSchema.extend({
  revision: z.number().int().positive(),
  status: z.enum(["prospect", "active", "paused", "archived"]),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type VendorCatalogProfile = z.output<typeof vendorCatalogProfileSchema>;
