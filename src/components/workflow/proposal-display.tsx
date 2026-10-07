import type { z } from "zod";
import { formatProposalQuoteAmount, type ProposalQuote, type proposalComparisonPageSchema } from "@/lib/proposal-quote";

const periods={monthly:"monthly",quarterly:"quarterly",annual:"annual",contract_term:"whole contract term"};
const displayTime=(value:string)=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(value))+" UTC";
export { displayTime as displayProposalTime };
export function ProposalQuoteDetails({quote}:{quote:ProposalQuote}){
  const price=quote.pricing,amount=(value:number|null)=>formatProposalQuoteAmount(value,price.currency);
  return <div className="space-y-5 text-sm leading-7 [overflow-wrap:anywhere]">
    <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="font-medium">Quote reference</dt><dd>{quote.quoteReference}</dd></div>
      <div><dt className="font-medium">Quote date</dt><dd>{quote.quoteDate??"Not supplied"}</dd></div>
      <div><dt className="font-medium">Currency</dt><dd>{price.currency??"Unknown"}</dd></div>
      <div><dt className="font-medium">Implementation cost</dt><dd className="tabular-nums">{amount(price.implementationCostMinorUnits)}</dd></div>
      <div><dt className="font-medium">Recurring cost</dt><dd className="tabular-nums">{amount(price.recurringCostMinorUnits)}{price.recurringPeriod?` · ${periods[price.recurringPeriod]}`:""}</dd></div>
      <div><dt className="font-medium">Recurring price basis</dt><dd className="whitespace-pre-wrap">{price.recurringCostBasis??"Unknown"}</dd></div>
      <div><dt className="font-medium">Optional cost</dt><dd className="tabular-nums">{amount(price.optionalCostMinorUnits)}</dd></div>
      <div><dt className="font-medium">Discount</dt><dd className="tabular-nums">{amount(price.discountMinorUnits)}</dd></div>
      <div><dt className="font-medium">Term</dt><dd>{price.termMonths===null?"Unknown":`${price.termMonths} months`}</dd></div></dl>
    <section><h4 className="font-medium">Original scope and quote text</h4><p className="whitespace-pre-wrap">{quote.quoteSummary}</p></section>
    {price.optionalCostDescription&&<section><h4 className="font-medium">Optional cost description</h4><p className="whitespace-pre-wrap">{price.optionalCostDescription}</p></section>}
    {price.discountDescription&&<section><h4 className="font-medium">How the discount applies</h4><p className="whitespace-pre-wrap">{price.discountDescription}</p></section>}
    {([ ["Terms and assumptions",price.termsAndAssumptions],["Customer-requested changes",price.customerRequestedChanges] ] as const).map(([label,items])=><section key={label}>
      <h4 className="font-medium">{label}</h4>{items.length?<ul className="list-disc space-y-2 pl-5">{items.map((item,index)=><li className="whitespace-pre-wrap" key={index}>{item}</li>)}</ul>:<p>None supplied.</p>}</section>)}
  </div>;
}
type Comparison=z.output<typeof proposalComparisonPageSchema>["items"][number];
export function ProposalComparison({item,children}:{item:Comparison;children?:React.ReactNode}){
  const costs=[ ["Implementation cost","implementationCostMinorUnits"],["Recurring cost","recurringCostMinorUnits"],
    ["Optional cost","optionalCostMinorUnits"],["Discount","discountMinorUnits"] ] as const;
  return <article className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h3 className="text-xl font-semibold">Saved proposal comparison</h3><p className="text-sm capitalize">{item.state}</p>
      <p className="text-sm">Prepared: {displayTime(item.createdAt)}</p>{item.decidedAt&&<p className="text-sm">Decision: {displayTime(item.decidedAt)}</p>}
      {!item.current&&<p className="text-sm font-medium">Historical comparison. A source quote changed or became unavailable. Do not use this comparison for a new selection.</p>}</header>
    <div className="overflow-x-auto rounded-md border" tabIndex={0} role="region" aria-label="Quoted price comparison">
      <table className="w-full min-w-[36rem] text-left text-sm"><caption className="sr-only">Approved source prices; unknown values remain unknown.</caption>
        <thead><tr><th scope="col" className="sticky left-0 min-w-36 bg-background p-3">Quoted item</th>{item.sources.map((source)=><th scope="col" className="min-w-48 p-3" key={source.proposalVersionId}>{source.vendorName} · Version {source.versionNumber}</th>)}</tr></thead>
        <tbody>{costs.map(([label,key])=><tr className="border-t" key={key}><th scope="row" className="sticky left-0 min-w-36 bg-background p-3 font-medium">{label}</th>
          {item.sources.map((source)=><td className="p-3 tabular-nums" key={source.proposalVersionId}>{formatProposalQuoteAmount(source.quote.pricing[key],source.quote.pricing.currency)}</td>)}</tr>)}
          <tr className="border-t"><th scope="row" className="sticky left-0 min-w-36 bg-background p-3 font-medium">Recurring period and basis</th>{item.sources.map((source)=><td className="p-3" key={source.proposalVersionId}>
            {source.quote.pricing.recurringPeriod?periods[source.quote.pricing.recurringPeriod]:"Unknown"} · {source.quote.pricing.recurringCostBasis??"Unknown"}</td>)}</tr>
          <tr className="border-t"><th scope="row" className="sticky left-0 min-w-36 bg-background p-3 font-medium">Original source</th>{item.sources.map((source)=><td className="p-3" key={source.proposalVersionId}>
            <a className="inline-flex min-h-11 items-center underline" href={`#comparison-${item.comparisonId}-source-${source.proposalVersionId}`}>Read {source.vendorName} quote version {source.versionNumber}</a></td>)}</tr>
        </tbody></table>
    </div><p className="text-sm leading-7">These prices keep the vendor&apos;s billing basis. The comparison does not convert currencies or combine costs.</p>
    {item.sources.map((source)=><section id={`comparison-${item.comparisonId}-source-${source.proposalVersionId}`} key={source.proposalVersionId} className="scroll-mt-6 space-y-4 border-t pt-5">
      <h4 className="text-lg font-semibold">{source.vendorName} · Original quote version {source.versionNumber}</h4>
      <p className="text-sm">Received: {displayTime(source.receivedAt)} · Approved: {displayTime(source.approvedAt)}</p><ProposalQuoteDetails quote={source.quote}/></section>)}
    {item.reason&&<p className="whitespace-pre-wrap text-sm">Staff reason: {item.reason}</p>}{children}
  </article>;
}
