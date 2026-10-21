import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import {
  EvaluationPublicationError, getEvaluationPublication, prepareEvaluationPublication,
  prepareEvaluationPublicationSchema, publishEvaluationPublication, publishEvaluationPublicationSchema,
  readEvaluationPublicationSchema, reviewEvaluationPublication, revokeEvaluationPublication,
  revokeEvaluationPublicationSchema,
} from "@/server/commands/evaluation-publication";
import {
  EvaluationSelectionError, selectInitialEvaluationOptions, selectInitialEvaluationOptionsSchema,
  getInitialEvaluationSelections, getInitialEvaluationSelectionsSchema,
} from "@/server/commands/evaluation-selection";
import { permissionProcedure, router } from "../trpc";
import { currentEvaluationPublicationSchema, getCurrentEvaluationPublication } from "@/server/commands/current-evaluation-publication";
import {
  EvaluationDisclosureError, evaluationDisclosureReviewInputSchema, evaluationDisclosuresInputSchema,
  recordEvaluationDisclosureInputSchema, getEvaluationDisclosureReview, getEvaluationDisclosures,
  recordEvaluationDisclosure,
} from "@/server/commands/evaluation-disclosure";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });

async function result<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthorizationError ||
      ((error instanceof EvaluationPublicationError || error instanceof EvaluationSelectionError || error instanceof EvaluationDisclosureError) && error.code === "REJECTED")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Evaluation is not available" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Evaluation request failed" });
  }
}

export const evaluationsRouter = router({
  disclosureReview: permissionProcedure({ permission: "evaluation.disclose", input: evaluationDisclosureReviewInputSchema, resolveScope })
    .query(({ ctx, input }) => result(() => getEvaluationDisclosureReview(input, { supabase: ctx.supabase }))),
  disclosures: permissionProcedure({ permission: "portal.customer.access", input: evaluationDisclosuresInputSchema, resolveScope })
    .query(({ ctx, input }) => result(() => getEvaluationDisclosures(input, { supabase: ctx.supabase }))),
  disclose: permissionProcedure({ permission: "evaluation.disclose", input: recordEvaluationDisclosureInputSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => recordEvaluationDisclosure(input, { supabase: ctx.supabase }))),
  current: permissionProcedure({ permission: "portal.customer.access", input: currentEvaluationPublicationSchema, resolveScope })
    .query(({ ctx, input }) => result(() => getCurrentEvaluationPublication(input, { supabase: ctx.supabase }))),
  select: permissionProcedure({ permission: "evaluation.select", input: selectInitialEvaluationOptionsSchema, resolveScope })
    .mutation(({ ctx, input }) => result(() => selectInitialEvaluationOptions(input, { supabase: ctx.supabase }))),
  selections: permissionProcedure({ permission: "portal.customer.access", input: getInitialEvaluationSelectionsSchema, resolveScope })
    .query(({ ctx, input }) => result(() => getInitialEvaluationSelections(input, { supabase: ctx.supabase }))),
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
