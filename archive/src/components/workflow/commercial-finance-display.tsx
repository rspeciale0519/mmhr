import Link from "next/link";
import type { z } from "zod";
import type { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import type { managedAgreementRuleSchema,contractValueFactSchema } from "@/lib/managed-finance-workflow";
import { commercialAmount,commercialPercentage,commercialTime } from "./commercial-finance-fields";
import { FinanceDocumentDownload } from "./finance-document-download";
type Detail=z.output<typeof managedFinanceDetailPageSchema>;
type Calculation=Extract<Detail,{view:"calculation"}>["calculation"];
type Original=Calculation["contractOriginal"];
const blockers={contract_value_missing:"The contract total is unknown for this calculation rule.",
  contract_currency_missing:"The contract currency is unknown.",commission_currency_missing:"The commission currency is unknown.",currency_conversion_unsupported:"Currency conversion has no approved method.",
  rule_unsupported:"The agreement rule needs a supported calculation method.",conditions_unsupported:"The agreement conditions need a supported calculation method.",
  source_changed:"A source changed after calculation preparation."};
const states={pending:"Waiting for independent decision",approved:"Approved",rejected:"Rejected"};
export function CommercialAgreementRuleDetails({rule,conditions}:{rule:z.output<typeof managedAgreementRuleSchema>;conditions:string[]}){
  return <section className="space-y-3 text-sm leading-7 [overflow-wrap:anywhere]" aria-label="Stored commission rule">
    <h3 className="font-semibold">Stored commission rule</h3>
    {rule.kind==="flat_amount"?<p className="tabular-nums">Fixed commission: {commercialAmount(rule.amountMinorUnits,rule.currency)} {rule.currency}.</p>
      :rule.kind==="contract_value_rate"?<p className="tabular-nums">Commission: {commercialPercentage(rule.rateBasisPoints)} of the confirmed contract value, in {rule.currency}.</p>
      :<p>Unsupported source terms: <span className="whitespace-pre-wrap">{rule.sourceTermReference}</span>.</p>}
    {conditions.length>0?<><h4 className="font-medium">Recorded conditions</h4><ul className="list-disc space-y-2 pl-5">
      {conditions.map((condition,index)=><li key={index} className="whitespace-pre-wrap">{condition}</li>)}</ul></>:<p>No conditions are recorded.</p>}
  </section>;
}
export function CommercialContractTotalDetails({value}:{value:z.output<typeof contractValueFactSchema>}){
  return <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium">Confirmed contract total</dt>
    <dd className="tabular-nums">{commercialAmount(value.amountMinorUnits,value.currency)}</dd></div>
    <div><dt className="font-medium">Contract currency</dt><dd>{value.currency??"Unknown"}</dd></div></dl>;
}
export function CommercialSourceOriginal({title,original,selectedOrganizationId}:{title:string;original:Original;selectedOrganizationId:string}){
  return <section className="space-y-2 rounded-lg border p-4 text-sm [overflow-wrap:anywhere]" aria-label={title}>
    <h3 className="font-semibold">{title}</h3><p>{original.fileName}</p><p>Stored source version: {original.originalVersion}.</p>
    {original.currentDocumentVersion!==original.originalVersion&&<p>A later document version exists. This record keeps its exact original version.</p>}
    {original.organizationId===selectedOrganizationId?<><Link className="inline-flex min-h-11 items-center underline"
      href={`/admin/finance/documents?document=${original.documentId}&afterVersion=${original.originalVersion-1}`}>Open this stored source version</Link>
      <FinanceDocumentDownload key={`${original.versionId}/${original.document.revision}`} organizationId={selectedOrganizationId}
        document={original.document} purpose="finance_original"/></>
      :<><p>This original belongs to the internal agreement workspace. Select that workspace to open the exact source.</p>
        <Link className="inline-flex min-h-11 items-center underline" href="/workspaces">Select the original&apos;s finance workspace</Link>
        <Link className="inline-flex min-h-11 items-center underline" href={`/admin/finance/documents?document=${original.documentId}&afterVersion=${original.originalVersion-1}`}>
          After selecting that workspace, open this exact original</Link></>}
  </section>;
}
export function CommercialCalculationDetails({organizationId,calculation}:{organizationId:string;calculation:Calculation}){
  const sourceChanged=calculation.expectedSourceDigest!==calculation.currentSourceDigest;
  return <article className="space-y-6 rounded-lg border p-5 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h2 className="text-balance text-xl font-semibold">{calculation.dealLabel}</h2><p className="text-sm">{calculation.vendorLabel}</p>
      <p className="text-sm font-medium">{states[calculation.state]}</p></header>
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-medium">Calculated commission</dt>
      <dd className="tabular-nums">{commercialAmount(calculation.amountMinorUnits,calculation.currency)}</dd></div>
      <div><dt className="font-medium">Commission currency</dt><dd>{calculation.currency??"Unknown"}</dd></div>
      <div><dt className="font-medium">Prepared by</dt><dd>{calculation.preparedByLabel}</dd></div>
      <div><dt className="font-medium">Prepared</dt><dd>{commercialTime(calculation.preparedAt)}</dd></div>
      <div><dt className="font-medium">Calculation version</dt><dd className="tabular-nums">{calculation.calculationRevision}</dd></div></dl>
    {calculation.blockerCodes.length>0&&<section className="space-y-3 text-sm" aria-label="Calculation blockers"><h3 className="font-semibold">Completion blockers</h3>
      <ul className="list-disc space-y-2 pl-5">{calculation.blockerCodes.map(code=><li key={code}>{blockers[code]}</li>)}</ul></section>}
    {sourceChanged&&<p role="status" className="text-sm leading-7">A source changed. Approval is unavailable.{calculation.canReject?" You can record a separate rejection.":" Reload the record to check current actions."}</p>}
    <CommercialContractTotalDetails value={calculation.contractValue}/><CommercialAgreementRuleDetails rule={calculation.rule} conditions={calculation.conditionReferences}/>
    <CommercialSourceOriginal title="Signed contract original" original={calculation.contractOriginal} selectedOrganizationId={organizationId}/>
    <CommercialSourceOriginal title="Commission agreement original" original={calculation.agreementOriginal} selectedOrganizationId={organizationId}/>
    {calculation.decidedByLabel&&<section className="space-y-2 text-sm"><h3 className="font-semibold">Recorded decision</h3><p>Decided by: {calculation.decidedByLabel}.</p>
      {calculation.decidedAt&&<p>{commercialTime(calculation.decidedAt)}</p>}<p className="whitespace-pre-wrap">{calculation.decisionReason}</p></section>}
    {calculation.state==="approved"&&<Link className="inline-flex min-h-11 items-center text-sm underline"
      href={`/admin/finance/invoices?commissionEventId=${calculation.commissionEventId}`}>Invoice readiness</Link>}
  </article>;
}

