import "server-only";
import { canTransitionPortalHandoff, portalHandoffCommandSchema, portalHandoffHistoryPageSchema,
  portalHandoffHistoryReadSchema, portalHandoffPageSchema, portalHandoffPermission, portalHandoffReadSchema,
  portalHandoffResultSchema, type PortalHandoffRead } from "@/lib/contract-handoff-portal";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function invoke(name: string, organizationId: string, correlationId: string, actionOrView: string,
  payload: unknown, idempotencyKey: string | undefined, options: AuthorizationOptions) {
  const context=await requirePermission(portalHandoffPermission(actionOrView),{kind:"organization",organizationId},{...options,correlationId});
  if(context.scope.kind!=="organization"||context.scope.organizationId!==organizationId||context.correlationId!==correlationId)throw new AuthorizationError();
  const response=await context.supabase.rpc(name,{payload,correlation_id:correlationId,...(idempotencyKey?{idempotency_key:idempotencyKey}:{})});
  if(response.error?.code==="42501")throw new AuthorizationError();
  if(response.error)throw new Error("Contract handoff request failed");
  return response.data as unknown;
}

export async function recordPortalContractHandoff(value: unknown, options: AuthorizationOptions={}) {
  const input=portalHandoffCommandSchema.parse(value);
  if(input.action==="transition"&&!canTransitionPortalHandoff(input.fromStatus,input.toStatus,true))throw new Error("Invalid contract handoff transition");
  const {correlationId,idempotencyKey,...payload}=input;
  const result=portalHandoffResultSchema.parse(await invoke("mmhr_record_portal_contract_handoff",input.organizationId,correlationId,input.action,payload,idempotencyKey,options));
  if(result.organizationId!==input.organizationId||result.correlationId!==correlationId
    ||("selectionId" in input&&result.selectionId!==input.selectionId)
    ||("handoffId" in input&&result.handoffId!==input.handoffId))throw new Error("Invalid contract handoff result");
  if(result.outcomeCode==="recorded") {
    const state=input.action==="select"?"pending":input.action==="withdraw_selection"?"withdrawn":input.action==="reject_selection"?"rejected":"approved";
    const status=input.action==="approve_selection"?"introduction_pending":input.action==="introduce"?"introduced":input.action==="record_signed"?"signed":input.action==="transition"?input.toStatus:null;
    const expected=input.action==="approve_selection"?1:("handoffId" in input?input.expectedRevision+1:null);
    if(result.selectionState!==state||result.status!==status||result.revision!==expected)throw new Error("Invalid contract handoff result");
  }
  return result;
}

function checkScope(input:PortalHandoffRead, row:{intakeId:string;recipientId:string}) {
  return input.view==="vendor"?row.recipientId===input.recipientId:row.intakeId===input.intakeId;
}
export async function getPortalContractHandoffs(value: unknown, options: AuthorizationOptions={}) {
  const input=portalHandoffReadSchema.parse(value);
  const {correlationId,...payload}=input;
  const page=portalHandoffPageSchema.parse(await invoke("mmhr_get_portal_contract_handoffs",input.organizationId,correlationId,input.view,payload,undefined,options));
  if(page.organizationId!==input.organizationId||page.correlationId!==correlationId
    ||(input.view!=="customer"&&(page.canSelect||page.choices.length!==0)))throw new Error("Invalid contract handoff page");
  let previous=input.afterId;
  for(const row of page.items) {
    if(!checkScope(input,row)||(previous&&row.selectionId<=previous)
      ||(input.view!=="staff"&&(row.canApprove||row.canReject||row.canIntroduce||row.canUpdate||row.decisionReason!==null))
      ||(input.view!=="customer"&&row.canWithdraw)
      ||(input.view==="vendor"&&(row.state!=="approved"||row.selectionReasons.length!==0||row.remainingRisks.length!==0))
      ||(input.view!=="vendor"&&row.selectionReasons.length===0))throw new Error("Invalid contract handoff page");
    let prior=row.handoffRevision;
    let status=row.status;
    if(row.events.length!==Math.min(3,(prior??1)-1)||row.hasMoreHistory!==((prior??1)>4))throw new Error("Invalid contract handoff history");
    for(const event of row.events){
      if(prior===null||event.revision!==prior||event.toStatus!==status)throw new Error("Invalid contract handoff history");
      status=event.fromStatus;
      prior=event.revision-1;
    }
    previous=row.selectionId;
  }
  const choices=page.choices.map((choice)=>`${choice.comparisonId}:${choice.proposalVersionId}`);
  if(new Set(choices).size!==choices.length||(page.canSelect&&page.choices.length===0)
    ||(page.nextCursor&&(page.items.length!==10||page.nextCursor!==previous)))throw new Error("Invalid contract handoff cursor");
  return page;
}

export async function getPortalContractHandoffHistory(value: unknown, options: AuthorizationOptions={}) {
  const input=portalHandoffHistoryReadSchema.parse(value);
  const {correlationId,...payload}=input;
  const page=portalHandoffHistoryPageSchema.parse(await invoke("mmhr_get_portal_contract_handoff_history",input.organizationId,correlationId,input.view,payload,undefined,options));
  if(page.organizationId!==input.organizationId||page.correlationId!==correlationId||page.handoffId!==input.handoffId)throw new Error("Invalid contract handoff history");
  let previous=input.beforeRevision;
  for(const event of page.events){
    if(previous!==undefined&&event.revision>=previous)throw new Error("Invalid contract handoff history");
    previous=event.revision;
  }
  if(page.nextRevision&&(page.events.length!==25||page.nextRevision!==previous))throw new Error("Invalid contract handoff history cursor");
  return page;
}
