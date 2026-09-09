import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { z } from "zod";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { securityUuidSchema } from "@/server/audit/security-values";
import { getIntake, IntakeReadError } from "@/server/commands/intake-read";
import { getCurrentEvaluationPublication } from "@/server/commands/current-evaluation-publication";
import { EvaluationPublicationError } from "@/server/commands/evaluation-publication";
import { EvaluationSelectionError, getInitialEvaluationSelections } from "@/server/commands/evaluation-selection";
import { CustomerFrame, IntakeNotice } from "../intake-views";
import { EvaluationOptions } from "./evaluation-options";

const querySchema = z.object({ intake: securityUuidSchema });
const linkClass = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2";

export default async function CustomerEvaluationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { authorization } = await requirePortalPageAccess("customer");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) return <CustomerFrame><IntakeNotice title="This comparison link is not valid" /></CustomerFrame>;
  const organizationId = authorization.scope.organizationId;
  const intakeId = query.data.intake;
  const options = { supabase: authorization.supabase };
  let intake: Awaited<ReturnType<typeof getIntake>>;
  let history: Awaited<ReturnType<typeof getInitialEvaluationSelections>>;
  let publication: Awaited<ReturnType<typeof getCurrentEvaluationPublication>>["publication"] = null;
  let publicationFailed = false;
  let canSelect = false;
  try {
    intake = await getIntake({ organizationId, intakeId }, options);
    const permission = await authorizePermission("evaluation.select", authorization.scope, options);
    canSelect = intake.status === "submitted" && permission !== null && permission.identityId === authorization.identityId &&
      permission.scope.kind === "organization" && permission.scope.organizationId === organizationId;
    history = await getInitialEvaluationSelections({ organizationId, intakeId, correlationId: randomUUID() }, options);
    // Historical choices remain readable when the current comparison expires.
    try {
      publication = (await getCurrentEvaluationPublication({ organizationId, intakeId, correlationId: randomUUID() }, options)).publication;
    } catch (error) {
      if (!(error instanceof EvaluationPublicationError) && !(error instanceof AuthorizationError)) throw error;
      publicationFailed = true;
    }
  } catch (error) {
    if (!(error instanceof IntakeReadError) && !(error instanceof EvaluationSelectionError) && !(error instanceof AuthorizationError)) throw error;
    return <CustomerFrame><IntakeNotice title="This comparison is not available"
      description="The intake or your access may have changed. Return to saved intakes to check." /></CustomerFrame>;
  }

  return <CustomerFrame>
    <Link href={`/customer?intake=${encodeURIComponent(intakeId)}`} prefetch={false} className={`${linkClass} mb-6`}>Back to saved intake</Link>
    {publication ? <EvaluationOptions publication={publication} history={history} canSelect={canSelect}
      key={`${organizationId}:${intakeId}:${publication.publicationId}:${history.initialCandidateCount}:${canSelect}`} />
      : <section className="space-y-3 border-l-2 border-foreground pl-5" aria-labelledby="comparison-status">
        <h2 id="comparison-status" className="text-balance text-2xl font-semibold">{publicationFailed ? "We could not load the current comparison" : "No approved comparison is available yet"}</h2>
        <p role={publicationFailed ? "alert" : "status"} className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
          {publicationFailed ? "The comparison or your access may have changed. Reload this page. Contact MMHR if the issue continues."
            : intake.status === "draft" || intake.status === "in_progress" ? "Submit your saved intake first. MMHR must review the comparison before you can choose options."
              : "MMHR must publish an approved comparison before you can choose options. Your saved intake remains available."}
        </p>
        {publicationFailed && <a href={`/customer/evaluation?intake=${encodeURIComponent(intakeId)}`} className={linkClass}>Reload comparison</a>}
      </section>}
    <section aria-labelledby="saved-choices-heading" className="mt-12 border-t pt-8">
      <h2 id="saved-choices-heading" className="text-balance text-xl font-semibold">Saved initial choices</h2>
      <p className="mt-3 text-sm tabular-nums">{history.initialCandidateCount} of 5 initial choices used.</p>
      {history.items.length ? <ul className="mt-4 divide-y">
        {history.items.map((item) => <li key={item.candidateId} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <span className="font-semibold">{item.maskedLabel} <span className="font-normal text-muted-foreground">from comparison version {item.publicationSequence}</span></span>
          <span className="capitalize">{item.state}</span>
        </li>)}
      </ul> : history.initialCandidateCount === 0 ? <p className="mt-3 text-sm text-muted-foreground">No initial choices have been saved.</p> : null}
      {history.items.length < history.initialCandidateCount && <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">Some choices came from an earlier review. They still count toward the limit. Contact MMHR for their details.</p>}
    </section>
  </CustomerFrame>;
}
