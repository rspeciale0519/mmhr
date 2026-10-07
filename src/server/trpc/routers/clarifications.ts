import { TRPCError } from "@trpc/server";
import { portalClarificationCommandSchema, portalClarificationReadSchema } from "@/lib/portal-clarification";
import { AuthorizationError } from "@/server/auth/authorization";
import { getPortalClarifications, recordPortalClarification } from "@/server/commands/portal-clarification";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function resolve<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "Clarification request failed" });
  }
}
export const clarificationsRouter = router({
  vendor: permissionProcedure({ permission: "portal.vendor.access", input: portalClarificationReadSchema.options[0], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalClarifications(input, { supabase: ctx.supabase }))),
  staff: permissionProcedure({ permission: "rfp.approve", input: portalClarificationReadSchema.options[1], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalClarifications(input, { supabase: ctx.supabase }))),
  customer: permissionProcedure({ permission: "portal.customer.access", input: portalClarificationReadSchema.options[2], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalClarifications(input, { supabase: ctx.supabase }))),
  ask: permissionProcedure({ permission: "rfp.approve", input: portalClarificationCommandSchema.options[0], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalClarification(input, { supabase: ctx.supabase }))),
  reply: permissionProcedure({ permission: "portal.vendor.access", input: portalClarificationCommandSchema.options[1], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalClarification(input, { supabase: ctx.supabase }))),
  decide: permissionProcedure({ permission: "rfp.approve", input: portalClarificationCommandSchema.options[2], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalClarification(input, { supabase: ctx.supabase }))),
});
