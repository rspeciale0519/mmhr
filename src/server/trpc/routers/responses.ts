import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import { getPortalResponses, portalResponseReadSchema, portalResponseSubmitSchema, submitPortalResponse } from "@/server/commands/rfp-portal-response";
import { reviewRfpResponseNormalization, rfpResponseReviewSchema } from "@/server/commands/rfp-response-review";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function result<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "Response request failed" });
  }
}
const reviewInput = rfpResponseReviewSchema.options[0].omit({ actorIdentityId: true });
const approveInput = rfpResponseReviewSchema.options[1].omit({ actorIdentityId: true });
const rejectInput = rfpResponseReviewSchema.options[2].omit({ actorIdentityId: true });
export const responsesRouter = router({
  vendor: permissionProcedure({ permission: "portal.vendor.access", input: portalResponseReadSchema.options[0], resolveScope })
    .query(({ ctx, input }) => result(() => getPortalResponses(input, { supabase: ctx.supabase }))),
  staff: permissionProcedure({ permission: "rfp.approve", input: portalResponseReadSchema.options[1], resolveScope })
    .query(({ ctx, input }) => result(() => getPortalResponses(input, { supabase: ctx.supabase }))),
  customer: permissionProcedure({ permission: "portal.customer.access", input: portalResponseReadSchema.options[2], resolveScope })
    .query(({ ctx, input }) => result(() => getPortalResponses(input, { supabase: ctx.supabase }))),
  submit: permissionProcedure({ permission: "portal.vendor.access", input: portalResponseSubmitSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => submitPortalResponse(input, { supabase: ctx.supabase }))),
  review: permissionProcedure({ permission: "rfp.approve", input: reviewInput, resolveScope })
    .mutation(({ ctx, input }) => result(() => reviewRfpResponseNormalization({ ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase }))),
  approve: permissionProcedure({ permission: "rfp.approve", input: approveInput, resolveScope })
    .mutation(({ ctx, input }) => result(() => reviewRfpResponseNormalization({ ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase }))),
  reject: permissionProcedure({ permission: "rfp.approve", input: rejectInput, resolveScope })
    .mutation(({ ctx, input }) => result(() => reviewRfpResponseNormalization({ ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase }))),
});
