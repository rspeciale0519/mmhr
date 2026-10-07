import { TRPCError } from "@trpc/server";
import { taskCommandSchema, taskDetailReadSchema, taskHistoryReadSchema, taskQueueReadSchema, taskChoicesReadSchema } from "@/lib/deal-follow-up";
import { AuthorizationError } from "@/server/auth/authorization";
import { getDealFollowUp, getDealFollowUpChoices, getDealFollowUpHistory, getDealFollowUpQueue, recordDealFollowUp,
  TaskRevisionConflict, TaskInputError } from "@/server/commands/deal-follow-up";
import { permissionProcedure, router } from "../trpc";

async function resolve<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) { throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND"
    : error instanceof TaskRevisionConflict ? "CONFLICT" : error instanceof TaskInputError ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
    message: error instanceof TaskRevisionConflict || error instanceof TaskInputError ? error.message : "Task request failed" }); }
}
const resolveScope = () => ({ kind: "platform" as const });
export const tasksRouter = router({
  record: permissionProcedure({ permission: "admin.access", input: taskCommandSchema, resolveScope })
    .mutation(({ ctx, input }) => resolve(() => recordDealFollowUp(input, { supabase: ctx.supabase }))),
  queue: permissionProcedure({ permission: "admin.access", input: taskQueueReadSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getDealFollowUpQueue(input, { supabase: ctx.supabase }))),
  detail: permissionProcedure({ permission: "admin.access", input: taskDetailReadSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getDealFollowUp(input, { supabase: ctx.supabase }))),
  history: permissionProcedure({ permission: "admin.access", input: taskHistoryReadSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getDealFollowUpHistory(input, { supabase: ctx.supabase }))),
  choices: permissionProcedure({ permission: "admin.access", input: taskChoicesReadSchema, resolveScope })
    .query(({ ctx, input }) => resolve(() => getDealFollowUpChoices(input, { supabase: ctx.supabase }))),
});
