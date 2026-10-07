import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden } from "next/navigation";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getEvaluationDisclosures } from "@/server/commands/evaluation-disclosure";
import { getRfpWorkflow } from "@/server/commands/rfp-portal";
import { CustomerFrame } from "../intake-views";
import { getPortalResponses } from "@/server/commands/rfp-portal-response";
import { ResponseList } from "@/components/workflow/response-list";
import { getPortalClarifications } from "@/server/commands/portal-clarification";
import { ClarificationList } from "@/components/workflow/clarification-list";

import { getRfpReceiptStatus } from "@/server/commands/rfp-receipt";
import { RfpReceiptStatus } from "@/components/workflow/rfp-receipt-status";
export default async function CustomerRfp({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {authorization} = await requirePortalPageAccess("customer");
  if (authorization.scope.kind!=="organization") forbidden();
  const query=z.object({intake:z.uuid(),after:z.uuid().optional(),responsesAfter:z.uuid().optional(),clarificationsAfter:z.uuid().optional(),receiptsAfter:z.uuid().optional()}).safeParse(await searchParams);
  if(!query.success) return <CustomerFrame><h1>Invalid RFP link</h1></CustomerFrame>;
  const organizationId=authorization.scope.organizationId;
  const intakeId=query.data.intake;
  const options={supabase:authorization.supabase};
  const [disclosures,workflow,responses,receipts,clarifications]=await Promise.all([
    getEvaluationDisclosures({organizationId,intakeId,afterId:query.data.after,correlationId:randomUUID()},options),
    getRfpWorkflow({organizationId,intakeId,correlationId:randomUUID()},options),
    getPortalResponses({organizationId,intakeId,view:"customer",afterId:query.data.responsesAfter,correlationId:randomUUID()},options),
    getRfpReceiptStatus({organizationId,intakeId,view:"customer",afterId:query.data.receiptsAfter,correlationId:randomUUID()},options),
    getPortalClarifications({organizationId,intakeId,view:"customer",afterId:query.data.clarificationsAfter,correlationId:randomUUID()},options),
  ]);
  return <CustomerFrame title="Your RFP and provider review"
    description="Review the provider details and questionnaire prepared with your MMHR advisor.">
    <Link href={`/customer/evaluation?intake=${intakeId}`} className="inline-flex min-h-11 items-center text-sm underline">Back to comparison</Link>
    <p className="mt-4 max-w-2xl text-sm leading-7">Discuss your required capabilities and customizations with MMHR. Your advisor will prepare the questionnaire and record provider disclosures here.</p>
    <section className="mt-8 space-y-5" aria-labelledby="providers-heading"><h2 id="providers-heading" className="text-xl font-semibold">Provider disclosures</h2>
      {disclosures.items.length===0 && <p role="status" className="text-sm">Provider names remain hidden until MMHR completes the discussion and records disclosure.</p>}
      {disclosures.items.map((item)=><article key={item.disclosureId} className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">{item.maskedLabel}</p><h3 className="mt-1 text-lg font-semibold">{item.providerName} · {item.productName}</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{item.conflictDisclosure}</p>
      </article>)}
      {disclosures.nextCursor && <Link href={`/customer/rfp?intake=${intakeId}&after=${disclosures.nextCursor}`}>Next provider disclosures</Link>}
    </section>
    <section className="mt-10 space-y-5 border-t pt-8"><h2 className="text-xl font-semibold">Approved vendor responses</h2>
      <p className="text-sm leading-7">These responses have recorded MMHR review and approval.</p>
      {responses.items.length===0 && <p role="status" className="text-sm">No vendor responses have been approved yet.</p>}
      <ResponseList items={responses.items}/>
      {responses.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/customer/rfp?intake=${intakeId}&responsesAfter=${responses.nextCursor}`}>Next approved responses</Link>}
    </section>
    <section className="mt-10 space-y-5 border-t pt-8"><h2 className="text-xl font-semibold">Accepted response clarifications</h2>
      {clarifications.items.length===0 && <p className="text-sm">No clarification answers are approved for this response yet.</p>}
      <ClarificationList items={clarifications.items}/>
      {clarifications.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/customer/rfp?intake=${intakeId}&clarificationsAfter=${clarifications.nextCursor}`}>Next accepted answers</Link>}
    </section>
    <RfpReceiptStatus page={receipts} nextHref={receipts.nextCursor ? `/customer/rfp?intake=${intakeId}&receiptsAfter=${receipts.nextCursor}` : null}/>
    <section className="mt-10 space-y-5 border-t pt-8" aria-labelledby="rfp-heading"><h2 id="rfp-heading" className="text-xl font-semibold">RFP documents</h2>
      {workflow.rfps.length===0 && <p className="text-sm">MMHR has not saved an RFP draft yet.</p>}
      {workflow.rfps.map((rfp)=><article key={rfp.rfpId} className="space-y-4 rounded-lg border p-5">
        <h3 className="text-lg font-semibold">{rfp.title}</h3><p className="text-sm capitalize">{rfp.status==="distributed"?"Delivered":rfp.status}</p>
        <div className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{rfp.content}</div>
        {rfp.status==="distributed" && <p role="status" className="text-sm">Delivered to {rfp.recipientCount} vendor portal{rfp.recipientCount===1?"":"s"}.</p>}
      </article>)}
    </section>
  </CustomerFrame>;
}
