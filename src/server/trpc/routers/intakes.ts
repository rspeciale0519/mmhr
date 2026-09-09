import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import { CustomerIntakeSaveError, customerIntakeSaveSchema, saveCustomerIntake } from "@/server/commands/customer-intake-save";
import { CustomerRequirementSaveError, customerRequirementSaveSchema, saveCustomerIntakeRequirement } from "@/server/commands/customer-requirement-save";
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
  saveDraft: permissionProcedure({ permission: "intake.draft.save", input: customerIntakeSaveSchema, resolveScope })
    .mutation(async ({ ctx, input }) => {
      try { return await saveCustomerIntake(input, { supabase: ctx.supabase }); } catch (error) {
        if (error instanceof AuthorizationError || (error instanceof CustomerIntakeSaveError && error.code === "REJECTED")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Intake not available" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Intake could not be saved" });
      }
    }),
  saveRequirement: permissionProcedure({ permission: "intake.requirement.save", input: customerRequirementSaveSchema, resolveScope })
    .mutation(async ({ ctx, input }) => {
      try { return await saveCustomerIntakeRequirement(input, { supabase: ctx.supabase }); } catch (error) {
        if (error instanceof AuthorizationError || (error instanceof CustomerRequirementSaveError && error.code === "REJECTED")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Requirement not available" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Requirement could not be saved" });
      }
    }),
  requirements: permissionProcedure({ permission: "workspace.access", input: requirementPageInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntakeRequirementsPage(input, { supabase: ctx.supabase }), "requirements")),
  list: permissionProcedure({ permission: "workspace.access", input: intakePageInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntakesPage(input, { supabase: ctx.supabase }))),
  get: permissionProcedure({ permission: "workspace.access", input: intakeReadInputSchema, resolveScope })
    .query(({ ctx, input }) => readResult(() => getIntake(input, { supabase: ctx.supabase }))),
});
