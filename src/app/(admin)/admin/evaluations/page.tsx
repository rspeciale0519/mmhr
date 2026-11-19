import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden } from "next/navigation";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { getIntake, getIntakesPage } from "@/server/commands/intake-read";
import { getIntakeRequirementsPage } from "@/server/commands/requirement-read";
import { getEvaluationDisclosureReview } from "@/server/commands/evaluation-disclosure";
import { getRfpWorkflow } from "@/server/commands/rfp-portal";
import { IntakeDetails } from "@/app/(app)/customer/intake-views";
import { SavedRequirements } from "@/app/(app)/customer/requirement-views";
import { DisclosureControls, RfpControls } from "./review-controls";
import { PublicationControls } from "./publication-controls";
import { getReviewRequirements } from "./review-requirements";
import { getPortalResponses } from "@/server/commands/rfp-portal-response";
import { StaffResponses } from "./response-review";
import { authorizePermission } from "@/server/auth/authorization";
import { getPortalClarifications } from "@/server/commands/portal-clarification";
import { StaffClarifications } from "@/components/workflow/clarification-controls";

import { getRfpReceiptStatus } from "@/server/commands/rfp-receipt";
import { RfpReceiptStatus } from "@/components/workflow/rfp-receipt-status";
import { addBusinessDays } from "@/lib/rfp-vendor-form";
import { getRfpSendOut } from "@/server/commands/rfp-vendor-forms";
import { RfpSendOutPanel } from "../rfp-forms/send-out-panel";
export default async function StaffEvaluations({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requirePagePermission("admin.access",{kind:"platform"});
  const {authorization} = await requireSelectedOrganizationPermission("evaluation.disclose");
  if (authorization.scope.kind !== "organization") forbidden();
  const organizationId = authorization.scope.organizationId;
  const query = z.object({intake:z.uuid().optional(),after:z.uuid().optional(),disclosuresAfter:z.uuid().optional(),requirementsAfter:z.uuid().optional(),responsesAfter:z.uuid().optional(),clarificationsAfter:z.uuid().optional(),receiptsAfter:z.uuid().optional()}).safeParse(await searchParams);
  if (!query.success) return <main className="p-8"><h1>Invalid review link</h1></main>;
  const options = {supabase:authorization.supabase};
  if (!query.data.intake) {
    const page = await getIntakesPage({organizationId,afterId:query.data.after},options);
    return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10"><h1 className="text-3xl font-semibold">Customer evaluations</h1>
      <p className="text-sm">Review the selected customer workspace.</p><Link href="/workspaces" className="inline-flex min-h-11 items-center underline">Change workspace</Link>
      {page.intakes.length===0 && <p>No saved intakes in this workspace.</p>}
      <ul className="divide-y">{page.intakes.map((intake) => <li key={intake.intakeId} className="py-4"><Link className="inline-flex min-h-11 items-center underline" href={`/admin/evaluations?intake=${intake.intakeId}`}>Review intake · {intake.status} · {new Date(intake.createdAt).toLocaleDateString()}</Link></li>)}</ul>
      {page.nextCursor && <Link href={`/admin/evaluations?after=${page.nextCursor}`}>Next intakes</Link>}
    </main>;
  }
  const intakeId = query.data.intake;
  const intake = await getIntake({organizationId,intakeId},options);
  const responseAccess = await authorizePermission("rfp.approve", {kind:"organization",organizationId}, options);
  const receiptAccess = await authorizePermission("rfp.distribute", {kind:"organization",organizationId}, options);
  const [requirements,review,workflow,responses,receipts,clarifications] = await Promise.all([
    intake.status === "submitted" ? getReviewRequirements(organizationId,intakeId,options) : getIntakeRequirementsPage({organizationId,intakeId,afterId:query.data.requirementsAfter},options),
    getEvaluationDisclosureReview({organizationId,intakeId,afterId:query.data.disclosuresAfter,correlationId:randomUUID()},options),
    getRfpWorkflow({organizationId,intakeId,correlationId:randomUUID()},options),
    responseAccess ? getPortalResponses({organizationId,intakeId,view:"staff",afterId:query.data.responsesAfter,correlationId:randomUUID()},options) : Promise.resolve(null),
    receiptAccess ? getRfpReceiptStatus({organizationId,intakeId,view:"staff",afterId:query.data.receiptsAfter,correlationId:randomUUID()},options) : Promise.resolve(null),
    responseAccess ? getPortalClarifications({organizationId,intakeId,view:"staff",afterId:query.data.clarificationsAfter,correlationId:randomUUID()},options) : Promise.resolve(null),
  ]);
  // Email send-out: one panel for each delivered RFP. A panel that cannot be
  // read (for example, without rfp.distribute) is left out; the rest of the
  // page still works.
  const sendOuts = receiptAccess ? (await Promise.all(workflow.rfps.filter((rfp) => rfp.status === "distributed")
    .map((rfp) => getRfpSendOut({ organizationId, rfpId: rfp.rfpId, version: rfp.version }, options).catch(() => null))))
    .filter((item) => item !== null) : [];
  // New sends default to a due date 10 business days from today.
  const defaultDueDate = addBusinessDays(new Date(), 10).toISOString().slice(0, 10);
  return <main className="mx-auto w-full max-w-4xl space-y-10 px-6 py-10">
    <header><Link href="/admin/evaluations" className="inline-flex min-h-11 items-center text-sm underline">All intakes</Link>
      <h1 className="mt-4 text-balance text-3xl font-semibold">Customer review</h1></header>
    <IntakeDetails intake={intake} staffView/><SavedRequirements intakeId={intakeId} page={requirements}
      hasCursor={intake.status!=="submitted" && !!query.data.requirementsAfter} afterId={query.data.requirementsAfter}
      basePath="/admin/evaluations" canEdit={false}/>
    {intake.status === "submitted" && <PublicationControls organizationId={organizationId} intakeId={intakeId} revision={intake.revision}
      requirements={requirements.requirements} complete={requirements.nextCursor===null}/>}
    <DisclosureControls review={review}/>
    {review.nextCursor && <Link href={`/admin/evaluations?intake=${intakeId}&disclosuresAfter=${review.nextCursor}`}>Next selected providers</Link>}
    <RfpControls workflow={workflow} revision={intake.revision} identityId={authorization.identityId}/>
    {sendOuts.map((sendOut) => <RfpSendOutPanel key={sendOut.rfpId} sendOut={sendOut} defaultDueDate={defaultDueDate}/>)}
    {receipts && <RfpReceiptStatus page={receipts} nextHref={receipts.nextCursor ? `/admin/evaluations?intake=${intakeId}&receiptsAfter=${receipts.nextCursor}` : null}/>} 
    {responses && <section className="space-y-5 border-t pt-8"><h2 className="text-2xl font-semibold">Vendor responses</h2>
      <p className="text-sm leading-7">Check the vendor statements before approval. Staff review and approval require different staff members.</p>
      {responses.items.length===0 && <p className="text-sm">No portal responses have been submitted.</p>}
      <StaffResponses organizationId={organizationId} items={responses.items}/>
      {responses.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/admin/evaluations?intake=${intakeId}&responsesAfter=${responses.nextCursor}`}>Next responses</Link>}
    </section>}
    {clarifications && <section className="space-y-5 border-t pt-8"><h2 className="text-2xl font-semibold">Response clarifications</h2>
      {clarifications.items.length===0 && <p className="text-sm">No clarification questions have been recorded.</p>}
      <StaffClarifications organizationId={organizationId} items={clarifications.items}/>
      {clarifications.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/admin/evaluations?intake=${intakeId}&clarificationsAfter=${clarifications.nextCursor}`}>Next clarification questions</Link>}
    </section>}
  </main>;
}
