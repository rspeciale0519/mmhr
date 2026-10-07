import "server-only";
import { z } from "zod";
import { portalResponseContentSchema } from "@/lib/rfp-response";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const common = { organizationId: uuid, correlationId: uuid };
export const portalResponseSubmitSchema = z.strictObject({ ...common, recipientId: uuid,
  expectedRevision: z.number().int().min(0).max(9999), response: portalResponseContentSchema, idempotencyKey: uuid });
export const portalResponseReadSchema = z.discriminatedUnion("view", [
  z.strictObject({ ...common, view: z.literal("vendor"), recipientId: uuid, afterId: uuid.optional() }),
  z.strictObject({ ...common, view: z.literal("staff"), intakeId: uuid, afterId: uuid.optional() }),
  z.strictObject({ ...common, view: z.literal("customer"), intakeId: uuid, afterId: uuid.optional() }),
]);
const date = z.iso.datetime({ offset: true });
const rowSchema = z.strictObject({ submissionId: uuid, recipientId: uuid, normalizationId: uuid,
  rfpId: uuid, version: z.number().int().positive(), revision: z.number().int().positive(),
  providerName: z.string().min(1).max(200), response: portalResponseContentSchema,
  state: z.enum(["pending", "reviewed", "approved", "rejected"]), submittedAt: date, approvedAt: date.nullable(),
  reviewedByIdentityId: uuid.nullable(), canReview: z.boolean(), canApprove: z.boolean(), isLatest: z.boolean(), late: z.boolean() });
export const portalResponsePageSchema = z.strictObject({ ...common, items: z.array(rowSchema).max(25), nextCursor: uuid.nullable(),
  currentRevision: z.number().int().nonnegative().nullable(), request: z.strictObject({
    title: z.string().min(1).max(200), content: z.string().min(10).max(30000), version: z.number().int().positive(),
    deadlineAt: date, closed: z.boolean(),
  }).nullable() });
export type PortalResponsePage = z.infer<typeof portalResponsePageSchema>;
const resultSchema = z.strictObject({ ...common, recipientId: uuid, normalizationId: uuid,
  revision: z.number().int().positive(), outcomeCode: z.enum(["submitted", "replayed"]) });

async function request(name: string, input: z.output<typeof portalResponseReadSchema> | z.output<typeof portalResponseSubmitSchema>, options: AuthorizationOptions) {
  const permission = "view" in input && input.view !== "vendor"
    ? input.view === "staff" ? "rfp.approve" : "portal.customer.access" : "portal.vendor.access";
  const ctx = await requirePermission(permission, { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId: input.correlationId });
  if (ctx.scope.kind !== "organization" || ctx.scope.organizationId !== input.organizationId || ctx.correlationId !== input.correlationId) throw new AuthorizationError();
  const { correlationId, ...rest } = input;
  const { idempotencyKey, ...payload } = rest as typeof rest & { idempotencyKey?: string };
  const result = await ctx.supabase.rpc(name, { payload, correlation_id: correlationId, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
  if (result.error?.code === "42501") throw new AuthorizationError();
  if (result.error) throw new Error("Response request failed");
  return result.data as unknown;
}
export async function submitPortalResponse(value: unknown, options: AuthorizationOptions = {}) {
  const input = portalResponseSubmitSchema.parse(value);
  const result = resultSchema.parse(await request("mmhr_submit_portal_response", input, options));
  if (result.organizationId !== input.organizationId || result.recipientId !== input.recipientId || result.correlationId !== input.correlationId || result.revision !== input.expectedRevision + 1) throw new Error("Invalid response result");
  return result;
}
export async function getPortalResponses(value: unknown, options: AuthorizationOptions = {}): Promise<PortalResponsePage> {
  const input = portalResponseReadSchema.parse(value);
  const result = portalResponsePageSchema.parse(await request("mmhr_get_portal_responses", input, options));
  if (result.organizationId !== input.organizationId || result.correlationId !== input.correlationId ||
    (input.view === "vendor" ? !result.request || result.currentRevision === null : result.request !== null || result.currentRevision !== null)) throw new Error("Invalid response page");
  let previous = input.afterId;
  for (const row of result.items) {
    if ((previous && row.submissionId <= previous) || (input.view === "vendor" && row.recipientId !== input.recipientId) ||
      (input.view !== "staff" && (row.canReview || row.canApprove)) || (input.view === "customer" && row.state !== "approved")) throw new Error("Invalid response page");
    previous = row.submissionId;
  }
  if (result.nextCursor && (result.items.length !== 25 || result.nextCursor !== previous)) throw new Error("Invalid response cursor");
  return result;
}
