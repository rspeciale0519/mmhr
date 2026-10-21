"use client";
import { useId,useState } from "react";
import type { z } from "zod";
import type { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { Button } from "@/components/ui/button";
import { CommercialReasonField } from "./commercial-finance-preparation";
import { useCommercialFinanceCommand,CommercialFinanceRequestStatus,type CommercialFinanceExecutor } from "./use-commercial-finance-command";
type Detail=z.output<typeof managedFinanceDetailPageSchema>;
type Contract=Extract<Detail,{view:"contract"}>["contract"];
type Calculation=Extract<Detail,{view:"calculation"}>["calculation"];
export function CommercialContractCalculationActions({organizationId,contract,execute}:{organizationId:string;contract:Contract;execute:CommercialFinanceExecutor}){
  const prefix=useId(),request=useCommercialFinanceCommand(execute);
  if(!contract.canResolveEligibility&&!contract.canPrepareCalculation)return <p role="status" className="text-sm">No eligibility or calculation action is available for this contract.</p>;
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Prepare a contract commission calculation">
    <h2 className="text-xl font-semibold">{contract.canResolveEligibility?"Check commission eligibility":"Prepare the commission calculation"}</h2>
    <p className="text-sm leading-7">The server uses the stored signing time, approved agreement version, and confirmed facts.</p>
    <form onSubmit={event=>{
      event.preventDefault();if(request.locked)return;const reason=String(new FormData(event.currentTarget).get("reason")??"");
      const metadata={organizationId,reason,correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};
      if(contract.canResolveEligibility){request.submit({...metadata,action:"resolve_eligibility",contractId:contract.contractId,handoffId:contract.handoffId});return;}
      if(contract.canPrepareCalculation&&contract.commissionEventId&&contract.currentEventRevision!==null&&contract.currentSourceDigest!==null){
        request.submit({...metadata,action:"prepare_calculation",commissionEventId:contract.commissionEventId,calculationId:crypto.randomUUID(),
          expectedEventRevision:contract.currentEventRevision,expectedSourceDigest:contract.currentSourceDigest});
      }
    }} className="space-y-4"><fieldset disabled={request.locked} className="space-y-4"><CommercialReasonField id={`${prefix}-reason`}/>
      <Button type="submit" className="min-h-11 transition-colors">{contract.canResolveEligibility?"Check and record eligibility":"Record proposed calculation"}</Button></fieldset></form>
    <CommercialFinanceRequestStatus request={request}/>
  </section>;
}
export function CommercialCalculationDecision({organizationId,calculation,execute}:{organizationId:string;calculation:Calculation;execute:CommercialFinanceExecutor}){
  const prefix=useId(),request=useCommercialFinanceCommand(execute),[selection,setSelection]=useState("approve_calculation");
  const action=selection==="reject_calculation"&&calculation.canReject?"reject_calculation":calculation.canApprove?"approve_calculation":"reject_calculation";
  if(!calculation.canDecide)return <p role="status" className="text-sm">No independent calculation decision is available for this account.</p>;
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Independent commission calculation decision">
    <h2 className="text-xl font-semibold">Record an independent calculation decision</h2>
    <p className="text-sm leading-7">The preparer cannot decide this calculation. Check the stored sources and calculation before recording a decision.</p>
    {!calculation.canApprove&&<p role="status" className="text-sm">Approval is unavailable. You can record a separate rejection.</p>}
    <form className="space-y-5" onSubmit={event=>{
      event.preventDefault();if(request.locked||action==="approve_calculation"&&!calculation.canApprove||action==="reject_calculation"&&!calculation.canReject)return;
      const fields=new FormData(event.currentTarget);request.submit({organizationId,action,commissionEventId:calculation.commissionEventId,
        calculationId:calculation.calculationId,expectedEventRevision:calculation.expectedEventRevision,expectedCalculationRevision:calculation.revision,
        expectedSourceDigest:calculation.expectedSourceDigest,reviewReference:String(fields.get("reviewReference")??""),reason:String(fields.get("reason")??""),
        correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});
    }}><fieldset disabled={request.locked} className="space-y-5">
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-decision`}><span>Calculation decision</span><select value={action} id={`${prefix}-decision`}
        onChange={event=>setSelection(event.target.value)} className="min-h-11 w-full rounded-md border p-3">
        {calculation.canApprove&&<option value="approve_calculation">Approve this calculation</option>}
        {calculation.canReject&&<option value="reject_calculation">Reject this calculation</option>}</select></label>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Decision record reference</span><input name="reviewReference" id={`${prefix}-reference`}
        required maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>
      <CommercialReasonField id={`${prefix}-reason`}/><Button type="submit" className="min-h-11 transition-colors">Record calculation decision</Button>
    </fieldset></form><CommercialFinanceRequestStatus request={request}/>
  </section>;
}

