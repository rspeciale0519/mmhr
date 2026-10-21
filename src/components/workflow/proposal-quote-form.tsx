"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { parseProposalQuoteAmount, proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";
import { ProposalActionStatus, proposalFieldClass, useProposalAction } from "./proposal-action";

const optional=(value:string)=>value.trim()||null;
const lines=(value:string)=>value.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
export function ProposalQuoteForm({organizationId,recipientId,expectedVersion}:{organizationId:string;recipientId:string;expectedVersion:number}){
  const action=useProposalAction(),prefix=useId();
  function field(name:string,label:string,options:{type?:string;required?:boolean;maxLength?:number;defaultValue?:string}={}){
    return <label className="block space-y-2" htmlFor={`${prefix}-${name}`}><span className="text-sm font-medium">{label}</span>
      <input id={`${prefix}-${name}`} name={name} className={proposalFieldClass} type={options.type??"text"} required={options.required}
        maxLength={options.maxLength} defaultValue={options.defaultValue} inputMode={name.endsWith("Cost")||name==="discount"?"decimal":undefined}/></label>;
  }
  function area(name:string,label:string,maxLength:number,required=false){return <label className="block space-y-2" htmlFor={`${prefix}-${name}`}>
    <span className="text-sm font-medium">{label}</span><textarea id={`${prefix}-${name}`} name={name} className={proposalFieldClass} rows={3} maxLength={maxLength} required={required}/></label>;}
  return <section className="space-y-4 rounded-lg border p-5"><h2 className="text-xl font-semibold">Submit an original quote</h2>
    <p className="text-sm leading-7">Each submission creates a saved version. MMHR reviews the quote before a different staff member approves it.</p>
    <p className="text-sm leading-7">Amounts use the selected currency. Leave a price field blank when the amount is unknown.</p>
    <form className="space-y-5" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);
      action.begin(()=>{const value=(name:string)=>String(form.get(name)??""),currency=value("currency");
        const term=value("termMonths").trim();if(term&&!/^[1-9][0-9]{0,2}$/.test(term))throw new Error("Use a term from 1 to 600 months.");
        const recurring=parseProposalQuoteAmount(value("recurringCost"),currency);
        return{action:"submit",organizationId,recipientId,expectedVersion,quote:{quoteReference:value("quoteReference"),quoteDate:optional(value("quoteDate")),quoteSummary:value("quoteSummary"),
          pricing:{currency,implementationCostMinorUnits:parseProposalQuoteAmount(value("implementationCost"),currency),recurringCostMinorUnits:recurring,
            recurringPeriod:recurring===null?null:value("recurringPeriod"),recurringCostBasis:optional(value("recurringCostBasis")),
            optionalCostMinorUnits:parseProposalQuoteAmount(value("optionalCost"),currency),optionalCostDescription:optional(value("optionalCostDescription")),
            discountMinorUnits:parseProposalQuoteAmount(value("discount"),currency),discountDescription:optional(value("discountDescription")),
            termMonths:term?Number(term):null,termsAndAssumptions:lines(value("terms")),customerRequestedChanges:lines(value("changes"))}}};});}}>
      <fieldset className="space-y-5" disabled={action.locked}>
        {field("quoteReference","Quote reference",{required:true,maxLength:200})}{field("quoteDate","Quote date (optional)",{type:"date"})}
        {area("quoteSummary","Original scope and quote text",8000,true)}
        <label className="block space-y-2" htmlFor={`${prefix}-currency`}><span className="text-sm font-medium">Currency</span>
          <select id={`${prefix}-currency`} name="currency" className={proposalFieldClass} defaultValue="USD">{proposalQuoteCurrencyCodes.map((code)=><option key={code} value={code}>{code}</option>)}</select></label>
        <div className="grid gap-5 sm:grid-cols-2">{field("implementationCost","Implementation cost",{maxLength:20})}{field("recurringCost","Recurring cost",{maxLength:20})}</div>
        <label className="block space-y-2" htmlFor={`${prefix}-period`}><span className="text-sm font-medium">Recurring billing period</span><select id={`${prefix}-period`} name="recurringPeriod" className={proposalFieldClass} defaultValue="monthly">
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="contract_term">Whole contract term</option></select></label>
        {field("recurringCostBasis","Recurring price basis, such as employee count",{maxLength:500})}
        <div className="grid gap-5 sm:grid-cols-2">{field("optionalCost","Optional cost",{maxLength:20})}{field("discount","Discount",{maxLength:20})}</div>
        {area("optionalCostDescription","Optional cost description",1000)}{area("discountDescription","How the discount applies",1000)}
        {field("termMonths","Term in months (optional)",{maxLength:3})}{area("terms","Terms and assumptions (one per line)",30000)}
        {area("changes","Customer-requested changes (one per line)",20000)}
        <Button className="min-h-11" type="submit">Submit quote version {expectedVersion+1}</Button>
      </fieldset><ProposalActionStatus action={action}/>
    </form></section>;
}
