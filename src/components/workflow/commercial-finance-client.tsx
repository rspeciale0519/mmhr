"use client";
import { useMutation,useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { CommercialFinanceWorkspace,type CommercialFinanceWorkspaceProps,type CommercialFinanceClient } from "./commercial-finance-workspace";
export function CommercialFinanceClientWorkspace(props:CommercialFinanceWorkspaceProps){
  const trpc=useTRPC(),cache=useQueryClient(),execute=useMutation(trpc.managedFinance.execute.mutationOptions({retry:false}));
  const api:CommercialFinanceClient={
    list:input=>cache.fetchQuery({...trpc.managedFinance.list.queryOptions(input),staleTime:0,retry:false}),
    detail:input=>cache.fetchQuery({...trpc.managedFinance.detail.queryOptions(input),staleTime:0,retry:false}),
    originals:input=>cache.fetchQuery({...trpc.managedFinance.originals.queryOptions(input),staleTime:0,retry:false}),
    sources:input=>cache.fetchQuery({...trpc.financeDocuments.sources.queryOptions(input),staleTime:0,retry:false}),
    execute:input=>execute.mutateAsync(input),
  };
  const record="entityId" in props.request?props.request.entityId:"list";
  return <CommercialFinanceWorkspace key={`${props.request.organizationId}/${props.request.view}/${record}/${props.request.correlationId}`} {...props} api={api}/>;
}

