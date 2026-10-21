import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { demoCoordinationCommandSchema, demoCoordinationReadSchema, demoHistoryReadSchema } from "@/lib/demo-coordination";
import { AuthorizationError } from "@/server/auth/authorization";
import { getDemoCoordination, getDemoCoordinationHistory, recordDemoCoordination } from "@/server/commands/demo-coordination";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function resolve<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "Demo request failed" });
  }
}
export const demosRouter = router({
  customerHistory: permissionProcedure({ permission: "portal.customer.access", input: demoHistoryReadSchema.extend({ view: z.literal("customer") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordinationHistory(input, { supabase: ctx.supabase }))),
  vendorHistory: permissionProcedure({ permission: "portal.vendor.access", input: demoHistoryReadSchema.extend({ view: z.literal("vendor") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordinationHistory(input, { supabase: ctx.supabase }))),
  staffHistory: permissionProcedure({ permission: "rfp.approve", input: demoHistoryReadSchema.extend({ view: z.literal("staff") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordinationHistory(input, { supabase: ctx.supabase }))),
  customer: permissionProcedure({ permission: "portal.customer.access", input: demoCoordinationReadSchema.extend({ view: z.literal("customer") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordination(input, { supabase: ctx.supabase }))),
  vendor: permissionProcedure({ permission: "portal.vendor.access", input: demoCoordinationReadSchema.extend({ view: z.literal("vendor") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordination(input, { supabase: ctx.supabase }))),
  staff: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationReadSchema.extend({ view: z.literal("staff") }), resolveScope })
    .query(({ ctx, input }) => resolve(() => getDemoCoordination(input, { supabase: ctx.supabase }))),
  create: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[0], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  customerAvailability: permissionProcedure({ permission: "portal.customer.access", input: demoCoordinationCommandSchema.options[1], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  vendorAvailability: permissionProcedure({ permission: "portal.vendor.access", input: demoCoordinationCommandSchema.options[2], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  confirm: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[3], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  reopen: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[4], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  complete: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[5], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  cancel: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[6], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
  noShow: permissionProcedure({ permission: "rfp.approve", input: demoCoordinationCommandSchema.options[7], resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDemoCoordination(input, { supabase: ctx.supabase }))),
});
