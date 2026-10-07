"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { WorkflowCommand, commandIds } from "@/components/workflow-command";

const stateLabels = {
  queued: "Queued", leased: "Processing", accepted: "Provider accepted", failed: "Failed before sending",
  needs_attention: "Staff review required",
} as const;

export function RfpNotificationControls({ organizationId, rfpId, version }: {
  organizationId: string; rfpId: string; version: number;
}) {
  const trpc = useTRPC();
  const [correlationId] = useState(() => crypto.randomUUID());
  const input = { organizationId, rfpId, version, correlationId };
  const recipients = useQuery(trpc.rfps.notificationRecipients.queryOptions(input, { retry: false }));
  const status = useQuery(trpc.rfps.notificationStatus.queryOptions(input, { retry: false }));
  const queue = useMutation(trpc.rfps.queueNotification.mutationOptions());
  const retry = useMutation(trpc.rfps.retryNotification.mutationOptions());
  const contacts = recipients.data?.items;
  const notifications = status.data?.items;
  async function refresh() {
    await Promise.all([recipients.refetch(), status.refetch()]);
  }
  return <section className="space-y-4 border-t pt-5" aria-label="Vendor email notifications">
    <div><h4 className="text-base font-semibold">Vendor email notifications</h4>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Queue a separate email for each verified contact. Queueing does not confirm sending or delivery.</p></div>
    <Button type="button" variant="outline" className="min-h-11" disabled={recipients.isFetching || status.isFetching}
      onClick={() => void refresh()}>Refresh notification status</Button>
    {(recipients.isPending || status.isPending) && <p role="status" className="text-sm">Loading notification contacts and status.</p>}
    {(recipients.isError || status.isError) && <p role="alert" className="text-sm">Notification records could not be loaded. Refresh to check current access and saved state.</p>}
    {!recipients.isError && !status.isError && contacts && notifications && <>
      {contacts.length === 0 && <p className="text-sm">No current verified vendor contacts are available for this request.</p>}
      <ul className="space-y-4">{contacts.map(contact => {
        const existing = notifications.find(item => item.recipientId === contact.recipientId && item.membershipId === contact.membershipId);
        return <li key={`${contact.recipientId}:${contact.membershipId}`} className="space-y-3 rounded-lg border p-4">
          <p className="break-all text-sm font-medium">{contact.recipientEmail}</p>
          {existing ? <p role="status" className="text-sm">{stateLabels[existing.state]} · <span className="tabular-nums">{existing.attemptCount}</span> attempts</p>
            : <p className="text-sm">No email notification is queued for this contact.</p>}
          {!existing && <WorkflowCommand<Parameters<typeof queue.mutateAsync>[0]> label="Queue email notification"
            disabled={recipients.isFetching || status.isFetching}
            success="Email notification queued. Sending and delivery remain unconfirmed."
            execute={async value => { const result = await queue.mutateAsync(value); await refresh(); return result; }}
            prepare={() => ({ organizationId, rfpId, version, notificationId: crypto.randomUUID(),
              recipientId: contact.recipientId, membershipId: contact.membershipId, expectedSourceDigest: contact.sourceDigest, ...commandIds() })}>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>Queue this request notification for the verified contact shown above.</label>
          </WorkflowCommand>}
          {existing?.canRetry && <WorkflowCommand<Parameters<typeof retry.mutateAsync>[0]>
            key={`${existing.notificationId}:${existing.revision}`} label="Retry failed notification"
            disabled={recipients.isFetching || status.isFetching}
            success="Failed notification queued again. Sending and delivery remain unconfirmed."
            execute={async value => { const result = await retry.mutateAsync(value); await refresh(); return result; }}
            prepare={() => ({ organizationId, rfpId, version, notificationId: existing.notificationId,
              expectedRevision: existing.revision, ...commandIds() })}>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>Retry this confirmed failure before sending.</label>
          </WorkflowCommand>}
          {existing?.state === "needs_attention" && <p role="alert" className="text-sm leading-6">Staff must review this record before another send. Check its source, send result, and attempt limit.</p>}
          {existing?.state === "accepted" && <p className="text-sm leading-6">The provider accepted the email. Mailbox delivery remains unconfirmed.</p>}
        </li>;
      })}</ul>
      {notifications.some(item => !contacts.some(contact => contact.recipientId === item.recipientId && contact.membershipId === item.membershipId))
        && <div className="space-y-2"><p className="text-sm leading-6">Some recorded contacts are no longer eligible. Their notification history remains available below.</p>
          <ul className="space-y-2">{notifications.filter(item => !contacts.some(contact => contact.recipientId === item.recipientId && contact.membershipId === item.membershipId))
            .map(item => <li key={item.notificationId} className="text-sm">{stateLabels[item.state]} · <span className="tabular-nums">{item.attemptCount}</span> attempts · Contact unavailable</li>)}</ul>
        </div>}
    </>}
  </section>;
}
