import { forbidden } from "next/navigation";
import { z } from "zod";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { securityUuidSchema } from "@/server/audit/security-values";
import { getIntake, getIntakesPage, IntakeReadError } from "@/server/commands/intake-read";
import { getIntakeRequirementsPage, RequirementReadError } from "@/server/commands/requirement-read";
import { CustomerFrame, IntakeDetails, IntakeList, IntakeNotice } from "./intake-views";
import { SavedRequirements } from "./requirement-views";
import { CustomerIntakeForm } from "./intake-form";
import { CustomerRequirementForm } from "./requirement-form";
import { CustomerIntakeSubmit } from "./intake-submit";

const querySchema = z.object({
  intake: securityUuidSchema.optional(),
  after: securityUuidSchema.optional(),
  requirementsAfter: securityUuidSchema.optional(),
  new: z.literal("1").optional(),
  edit: z.literal("1").optional(),
  newRequirement: z.literal("1").optional(),
  editRequirement: securityUuidSchema.optional(),
}).refine((query) => {
  if (query.newRequirement || query.editRequirement) {
    return !!query.intake && !query.new && !query.edit && !query.after &&
      !(query.newRequirement && query.editRequirement) && !(query.newRequirement && query.requirementsAfter);
  }
  if (query.new) return !query.intake && !query.after && !query.requirementsAfter && !query.edit;
  if (query.edit) return !!query.intake && !query.after && !query.requirementsAfter;
  return !(query.intake && query.after) && (!query.requirementsAfter || !!query.intake);
});

export default async function CustomerHome({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Pages and layouts can render independently. Never rely on the layout guard
  // to authorize this page's data fetch or use query parameters as authority.
  const { authorization } = await requirePortalPageAccess("customer");
  if (authorization.scope.kind !== "organization") forbidden();
  const organizationId = authorization.scope.organizationId;
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) {
    return <CustomerFrame><IntakeNotice title="This page link is not valid" /></CustomerFrame>;
  }

  let result:
    | { kind: "detail"; intake: Awaited<ReturnType<typeof getIntake>>;
        requirements: Awaited<ReturnType<typeof getIntakeRequirementsPage>> }
    | { kind: "list"; page: Awaited<ReturnType<typeof getIntakesPage>> }
    | { kind: "form"; intake?: Awaited<ReturnType<typeof getIntake>> }
    | { kind: "requirementForm"; intakeId: string;
        requirement?: Awaited<ReturnType<typeof getIntakeRequirementsPage>>["requirements"][number] }
    | { kind: "denied" }
    | { kind: "error" };
  let canSave = false;
  let canSaveRequirement = false;
  let canSubmit = false;
  try {
    const options = { supabase: authorization.supabase };
    const saveAuthorization = await authorizePermission("intake.draft.save", authorization.scope, options);
    canSave = saveAuthorization !== null && saveAuthorization.identityId === authorization.identityId &&
      saveAuthorization.scope.kind === "organization" && saveAuthorization.scope.organizationId === organizationId;
    if (query.data.intake && !query.data.edit) {
      const requirementAuthorization = await authorizePermission("intake.requirement.save", authorization.scope, options);
      canSaveRequirement = requirementAuthorization !== null && requirementAuthorization.identityId === authorization.identityId &&
        requirementAuthorization.scope.kind === "organization" && requirementAuthorization.scope.organizationId === organizationId;
    }
    if (query.data.intake && !query.data.edit && !query.data.newRequirement && !query.data.editRequirement) {
      const submissionAuthorization = await authorizePermission("intake.submit", authorization.scope, options);
      canSubmit = submissionAuthorization !== null && submissionAuthorization.identityId === authorization.identityId &&
        submissionAuthorization.scope.kind === "organization" && submissionAuthorization.scope.organizationId === organizationId;
    }
    if (((query.data.new || query.data.edit) && !canSave) ||
        ((query.data.newRequirement || query.data.editRequirement) && !canSaveRequirement)) {
      result = { kind: "denied" };
    } else if (query.data.new) {
      result = { kind: "form" };
    } else if (query.data.intake) {
      const intake = await getIntake({ organizationId, intakeId: query.data.intake }, options);
      if (query.data.newRequirement || query.data.editRequirement) {
        if (intake.status !== "draft" && intake.status !== "in_progress") {
          result = { kind: "denied" };
        } else if (query.data.newRequirement) {
          result = { kind: "requirementForm", intakeId: intake.intakeId };
        } else {
          const requirements = await getIntakeRequirementsPage({
            organizationId, intakeId: intake.intakeId, afterId: query.data.requirementsAfter,
          }, options);
          // Resolve only within this authorized page. Never scan other records
          // or accept a query identifier as evidence of ownership.
          const requirement = requirements.requirements.find((entry) => entry.requirementId === query.data.editRequirement);
          result = requirement ? { kind: "requirementForm", intakeId: intake.intakeId, requirement } : { kind: "denied" };
        }
      } else if (query.data.edit) {
        result = intake.status === "draft" || intake.status === "in_progress"
          ? { kind: "form", intake } : { kind: "denied" };
      } else {
        const requirements = await getIntakeRequirementsPage({
          organizationId, intakeId: query.data.intake, afterId: query.data.requirementsAfter,
        }, options);
        result = { kind: "detail", intake, requirements };
      }
    } else {
      result = { kind: "list", page: await getIntakesPage({ organizationId, afterId: query.data.after }, options) };
    }
  } catch (error) {
    if (!(error instanceof IntakeReadError) && !(error instanceof RequirementReadError) &&
        !(error instanceof AuthorizationError)) throw error;
    result = { kind: "error" };
  }
  return (
    <CustomerFrame>
      {result.kind === "detail" ? <>
        <IntakeDetails intake={result.intake} canEdit={canSave &&
          (result.intake.status === "draft" || result.intake.status === "in_progress")} />
        <SavedRequirements intakeId={result.intake.intakeId} page={result.requirements}
          hasCursor={query.data.requirementsAfter !== undefined} afterId={query.data.requirementsAfter}
          canEdit={canSaveRequirement && (result.intake.status === "draft" || result.intake.status === "in_progress")} />
        {canSubmit && (result.intake.status === "draft" || result.intake.status === "in_progress") &&
          result.intake.revision < 2_147_483_647 &&
          <CustomerIntakeSubmit organizationId={organizationId} intakeId={result.intake.intakeId}
            expectedRevision={result.intake.revision}
            requiresRequirement={!query.data.requirementsAfter && !result.requirements.nextCursor &&
              !result.requirements.requirements.some((requirement) => requirement.importance === "must" || requirement.importance === "nice")}
            hasRequirement={result.requirements.requirements.some((requirement) => requirement.importance === "must" || requirement.importance === "nice")}
            key={`${organizationId}:${result.intake.intakeId}:${result.intake.revision}`} />}
      </>
        : result.kind === "list" ? <IntakeList page={result.page} hasCursor={query.data.after !== undefined} canCreate={canSave} />
          : result.kind === "form" ? <CustomerIntakeForm organizationId={organizationId} intake={result.intake}
              key={`${organizationId}:${result.intake?.intakeId ?? "new"}:${result.intake?.revision ?? 0}`} />
          : result.kind === "requirementForm" ? <CustomerRequirementForm organizationId={organizationId}
              intakeId={result.intakeId} requirement={result.requirement}
              returnHref={`/customer?intake=${encodeURIComponent(result.intakeId)}${query.data.requirementsAfter ? `&requirementsAfter=${encodeURIComponent(query.data.requirementsAfter)}` : ""}`}
              key={`${organizationId}:${result.intakeId}:${result.requirement?.requirementId ?? "new"}:${result.requirement?.revision ?? 0}`} />
          : result.kind === "denied" ? <IntakeNotice title="This intake form is not available"
              description="Your access or the intake status does not allow this change. You can return to your saved intakes." />
          : <IntakeNotice title="We could not load your saved intake information"
              description="The records may be unavailable, or your access may have changed. Return to the list to try again." />}
    </CustomerFrame>
  );
}
