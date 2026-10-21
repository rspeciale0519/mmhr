"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ManagedInvoiceWorkspace, type ManagedInvoiceClient, type ManagedInvoiceWorkspaceProps } from "./managed-invoice-workspace";

export function ManagedInvoiceClientWorkspace(props: Omit<ManagedInvoiceWorkspaceProps, "api">) {
  const trpc = useTRPC(), cache = useQueryClient();
  const execute = useMutation(trpc.managedInvoices.execute.mutationOptions({ retry: false }));
  const api: ManagedInvoiceClient = {
    detail: input => cache.fetchQuery({ ...trpc.managedInvoices.detail.queryOptions(input), staleTime: 0, retry: false }),
    owners: input => cache.fetchQuery({ ...trpc.managedInvoices.owners.queryOptions(input), staleTime: 0, retry: false }),
    source: input => cache.fetchQuery({ ...trpc.managedInvoices.source.queryOptions(input), staleTime: 0, retry: false }),
    execute: input => execute.mutateAsync(input),
  };
  const { request, actorIdentityId } = props;
  return <ManagedInvoiceWorkspace key={`${request.organizationId}/${actorIdentityId}/${request.commissionEventId}/${request.invoiceId ?? "unissued"}/${request.correlationId}`}
    {...props} api={api} />;
}
