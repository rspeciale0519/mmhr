import { TRPCError } from "@trpc/server";
import { portalHandoffCommandSchema, portalHandoffHistoryReadSchema, portalHandoffReadSchema } from "@/lib/contract-handoff-portal";
import { AuthorizationError } from "@/server/auth/authorization";
import { getPortalContractHandoffHistory, getPortalContractHandoffs, recordPortalContractHandoff } from "@/server/commands/contract-handoff-portal";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function resolve<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) { throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "Contract handoff request failed" }); }
}
export const contractsRouter = router({
  customer: permissionProcedure({ permission: "portal.customer.access", input: portalHandoffReadSchema.options[0], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffs(input, { supabase: ctx.supabase }))),
  staff: permissionProcedure({ permission: "rfp.approve", input: portalHandoffReadSchema.options[1], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffs(input, { supabase: ctx.supabase }))),
  vendor: permissionProcedure({ permission: "portal.vendor.access", input: portalHandoffReadSchema.options[2], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffs(input, { supabase: ctx.supabase }))),
  customerHistory: permissionProcedure({ permission: "portal.customer.access", input: portalHandoffHistoryReadSchema.options[0], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffHistory(input, { supabase: ctx.supabase }))),
  staffHistory: permissionProcedure({ permission: "rfp.approve", input: portalHandoffHistoryReadSchema.options[1], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffHistory(input, { supabase: ctx.supabase }))),
  vendorHistory: permissionProcedure({ permission: "portal.vendor.access", input: portalHandoffHistoryReadSchema.options[2], resolveScope })
    .query(({ ctx, input }) => resolve(() => getPortalContractHandoffHistory(input, { supabase: ctx.supabase }))),
  select: permissionProcedure({ permission: "portal.customer.access", input: portalHandoffCommandSchema.options[0], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  withdraw: permissionProcedure({ permission: "portal.customer.access", input: portalHandoffCommandSchema.options[1], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  approve: permissionProcedure({ permission: "rfp.approve", input: portalHandoffCommandSchema.options[2], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  reject: permissionProcedure({ permission: "rfp.approve", input: portalHandoffCommandSchema.options[3], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  introduce: permissionProcedure({ permission: "rfp.approve", input: portalHandoffCommandSchema.options[4], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  transition: permissionProcedure({ permission: "rfp.approve", input: portalHandoffCommandSchema.options[5], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
  recordSigned: permissionProcedure({ permission: "rfp.approve", input: portalHandoffCommandSchema.options[6], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordPortalContractHandoff(input, { supabase: ctx.supabase }))),
});
