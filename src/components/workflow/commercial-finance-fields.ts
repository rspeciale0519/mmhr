import { z } from "zod";
import { parseProposalQuoteAmount,formatProposalQuoteAmount,proposalQuoteCurrencySchema } from "@/lib/proposal-quote";
import { managedFinanceInstantSchema } from "@/lib/managed-finance-workflow";
export function commercialAmount(value:number|null,currency:string|null){return formatProposalQuoteAmount(value,currency);}
export function commercialPercentage(basisPoints:number){
  const value=z.number().int().min(0).max(10_000).parse(basisPoints);
  return `${Math.floor(value/100)}${value%100===0?"":`.${String(value%100).padStart(2,"0").replace(/0$/,"")}`}%`;
}
export function parseCommercialPercentage(value:string){
  const match=/^(0|[1-9][0-9]{0,2})(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if(!match)throw new Error("Use a percentage from zero to 100 with at most two decimal places");
  const result=Number(BigInt(match[1])*BigInt(100)+BigInt((match[2]??"").padEnd(2,"0")||"0"));
  return z.number().int().min(0).max(10_000).parse(result);
}
export function parseCommercialTotal(known:boolean,amount:string,currency:string){
  const code=currency.trim()===""?null:proposalQuoteCurrencySchema.parse(currency);
  if(!known)return {amountMinorUnits:null,currency:code};
  if(code===null)throw new Error("Choose the contract currency");
  const value=parseProposalQuoteAmount(amount,code);
  if(value===null)throw new Error("Enter the confirmed contract total");
  return {amountMinorUnits:value,currency:code};
}
export function commercialInstant(value:string,optional=false){
  const input=value.trim();if(input===""&&optional)return null;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(input))throw new Error("Use a valid UTC date and time");
  const normalized=`${input.length===16?`${input}:00`:input}Z`;
  return managedFinanceInstantSchema.parse(normalized);
}
export function commercialTime(value:string){return managedFinanceInstantSchema.parse(value).replace("T"," ").replace(/(?:Z|\+00:00)$/," UTC").replace(/([+-]\d{2}:\d{2})$/," $1");}
