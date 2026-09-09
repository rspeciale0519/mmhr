import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import { getIntake, getIntakesPage, IntakeReadError, intakePageInputSchema, intakeReadInputSchema } from "@/server/commands/intake-read";
import { getIntakeRequirementsPage, RequirementReadError, requirementPageInputSchema } from "@/server/commands/requirement-read";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function readResult<T>(operation: () => Promise<T>, resource: "intake" | "requirements" = "intake"): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthorizationError ||
      ((error instanceof IntakeReadError || error instanceof RequirementReadError) && error.code === "REJECTED")) {
      throw new TRPCError({ code: "NOT_FOUND", message: resource === "requirements" ? "Requirements not available" : "Intake not available" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: resource === "requirements" ? "Requirements could not be loaded" : "Intakes could not be loaded" });
  }
}

export const intakesRouter = router({
  requirements: permissionProcedure({ permission: "workspace.access", input: requirementPageInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntakeRequirementsPage(input, { supabase: ctx.supabase }), "requirements")),
  list: permissionProcedure({ permission: "workspace.access", input: intakePageInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntakesPage(input, { supabase: ctx.supabase }))),
  get: permissionProcedure({ permission: "workspace.access", input: intakeReadInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntake(input, { supabase: ctx.supabase }))),
});
