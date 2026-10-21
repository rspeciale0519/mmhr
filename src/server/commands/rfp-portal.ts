import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import type { PermissionKey } from "@/server/auth/permission-registry";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const correlation = { organizationId: uuid, correlationId: uuid };
export const rfpWorkflowInputSchema = z.strictObject({ ...correlation, intakeId: uuid });
export const vendorRfpsInputSchema = z.strictObject({ ...correlation, afterId: uuid.optional() });
export const rfpQuestionnaireInputSchema = z.strictObject({ ...correlation, intakeId: uuid, rfpId: uuid,
  sourceRevision: z.number().int().positive(), title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(10).max(30000), idempotencyKey: uuid });
export const rfpPortalDeliveryInputSchema = z.strictObject({ ...correlation, rfpId: uuid,
  version: z.number().int().positive(), deadlineAt: z.iso.datetime({ offset: true }),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: uuid });
const date = z.iso.datetime({ offset: true });
const rfpSchema = z.strictObject({ rfpId: uuid, version: z.number().int().positive(), title: z.string().min(1).max(200),
  content: z.string().min(10).max(30000), status: z.enum(["draft","review","approved","distributed","closed","archived"]),
  createdByIdentityId: uuid, approvedByIdentityId: uuid.nullable(), approvedAt: date.nullable(),
  recipientCount: z.number().int().nonnegative(), deliveryDigest: z.string().regex(/^[a-f0-9]{64}$/) });
export const rfpWorkflowResultSchema = z.strictObject({ ...correlation, intakeId: uuid, rfps: z.array(rfpSchema),
  requiresSeparateApproval: z.boolean(), readyToDeliver: z.boolean(), selectedCount: z.number().int().nonnegative() });
export const vendorRfpsResultSchema = z.strictObject({ ...correlation, items: z.array(z.strictObject({
  recipientId: uuid, title: z.string().min(1).max(200), content: z.string().min(10).max(30000),
  version: z.number().int().positive(), sentAt: date, deadlineAt: date,
})).max(25), nextCursor: uuid.nullable() });
const commandResultSchema = z.strictObject({ ...correlation, rfpId: uuid,
  status: z.enum(["draft","review","approved","distributed","closed","archived"]) });
export type RfpWorkflow = z.output<typeof rfpWorkflowResultSchema>;

async function rpc(name: string, permission: PermissionKey, input: { organizationId: string; correlationId: string; idempotencyKey?: string }, options: AuthorizationOptions) {
  const { correlationId, idempotencyKey, ...payload } = input;
  const ctx = await requirePermission(permission, { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId });
  if (ctx.scope.kind !== "organization" || ctx.scope.organizationId !== input.organizationId || ctx.correlationId !== correlationId) throw new AuthorizationError();
  const response = await ctx.supabase.rpc(name, { payload, correlation_id: correlationId, ...(idempotencyKey && { idempotency_key: idempotencyKey }) });
  if (response.error) {
    if (response.error.code === "42501") throw new AuthorizationError();
    throw new Error("RFP request failed");
  }
  return response.data as unknown;
}
function bound<T extends { organizationId: string; correlationId: string }>(result: T, input: { organizationId: string; correlationId: string }): T {
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId) throw new Error("Invalid RFP response");
  return result;
}
export async function getRfpWorkflow(value: unknown, options: AuthorizationOptions = {}) {
  const input = rfpWorkflowInputSchema.parse(value);
  const result = bound(rfpWorkflowResultSchema.parse(await rpc("mmhr_get_rfp_workflow","workspace.access",input,options)),input);
  if (result.intakeId !== input.intakeId || new Set(result.rfps.map((r) => r.rfpId)).size !== result.rfps.length) throw new Error("Invalid RFP response");
  return result;
}
export async function getVendorRfps(value: unknown, options: AuthorizationOptions = {}) {
  const input = vendorRfpsInputSchema.parse(value);
  const result = bound(vendorRfpsResultSchema.parse(await rpc("mmhr_get_vendor_rfps","portal.vendor.access",input,options)),input);
  let previous = input.afterId;
  for (const row of result.items) {
    if (previous && row.recipientId <= previous) throw new Error("Invalid RFP page");
    previous = row.recipientId;
  }
  if (result.nextCursor && (result.items.length !== 25 || result.nextCursor !== previous)) throw new Error("Invalid RFP page");
  return result;
}
export async function createRfpQuestionnaire(value: unknown, options: AuthorizationOptions = {}) {
  const input = rfpQuestionnaireInputSchema.parse(value);
  const result = bound(commandResultSchema.parse(await rpc("mmhr_create_rfp_questionnaire","rfp.approve",input,options)),input);
  if (result.rfpId !== input.rfpId) throw new Error("Invalid RFP response");
  return result;
}
export async function deliverRfpToPortals(value: unknown, options: AuthorizationOptions = {}) {
  const input = rfpPortalDeliveryInputSchema.parse(value);
  const result = bound(commandResultSchema.parse(await rpc("mmhr_deliver_rfp_to_portals","rfp.distribute",input,options)),input);
  if (result.rfpId !== input.rfpId || result.status !== "distributed") throw new Error("Invalid RFP response");
  return result;
}
