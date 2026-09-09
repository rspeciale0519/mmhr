import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import {
  EvaluationPublicationError, getEvaluationPublication, prepareEvaluationPublication,
  prepareEvaluationPublicationSchema, publishEvaluationPublication, publishEvaluationPublicationSchema,
  readEvaluationPublicationSchema, reviewEvaluationPublication, revokeEvaluationPublication,
  revokeEvaluationPublicationSchema,
} from "@/server/commands/evaluation-publication";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });

async function result<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthorizationError || (error instanceof EvaluationPublicationError && error.code === "REJECTED")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Evaluation is not available" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Evaluation request failed" });
  }
}

export const evaluationsRouter = router({
  prepare: permissionProcedure({ permission: "evaluation.publish", input: prepareEvaluationPublicationSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => prepareEvaluationPublication(input, { supabase: ctx.supabase }))),
  publish: permissionProcedure({ permission: "evaluation.publish", input: publishEvaluationPublicationSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => publishEvaluationPublication(input, { supabase: ctx.supabase }))),
  revoke: permissionProcedure({ permission: "evaluation.publish", input: revokeEvaluationPublicationSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => revokeEvaluationPublication(input, { supabase: ctx.supabase }))),
  review: permissionProcedure({ permission: "evaluation.publish", input: readEvaluationPublicationSchema, resolveScope })
    .query(({ ctx, input }) => result(() => reviewEvaluationPublication(input, { supabase: ctx.supabase }))),
  get: permissionProcedure({ permission: "portal.customer.access", input: readEvaluationPublicationSchema, resolveScope })
    .query(({ ctx, input }) => result(() => getEvaluationPublication(input, { supabase: ctx.supabase }))),
});
