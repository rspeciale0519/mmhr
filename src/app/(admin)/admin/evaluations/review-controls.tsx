"use client";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WorkflowCommand, commandIds, workflowInputClass } from "@/components/workflow-command";
import type { EvaluationDisclosureReview } from "@/server/commands/evaluation-disclosure";
import type { RfpWorkflow } from "@/server/commands/rfp-portal";
import { RfpNotificationControls } from "./rfp-notification-controls";

export function DisclosureControls({ review }: { review: EvaluationDisclosureReview }) {
  const trpc = useTRPC();
  const disclose = useMutation(trpc.evaluations.disclose.mutationOptions());
  return <section className="space-y-6 border-t pt-8" aria-labelledby="discussion-heading">
    <div><h2 id="discussion-heading" className="text-balance text-xl font-semibold">Customer discussion and provider disclosure</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Discuss required capabilities and customizations with the customer. Record commercial conflicts before revealing each provider.</p></div>
    {review.items.length === 0 && <p className="text-sm">No published options have been selected yet.</p>}
    {review.items.map((item) => <article key={`${item.candidateId}:${item.reviewDigest}:${item.lastDisclosureAt}`} className="space-y-4 rounded-lg border p-5">
      <div><p className="text-sm text-muted-foreground">{item.maskedLabel}</p><h3 className="mt-1 text-lg font-semibold">{item.providerName} · {item.productName}</h3></div>
      {item.lastDisclosureAt && <p className="text-sm">Disclosure recorded: {new Date(item.lastDisclosureAt).toLocaleString()}</p>}
      {!item.canDisclose ? <p role="status" className="text-sm">The comparison or candidate needs a new review before disclosure.</p> :
        <WorkflowCommand<Parameters<typeof disclose.mutateAsync>[0]> label="Record disclosure" success="Provider disclosure recorded." execute={(input) => disclose.mutateAsync(input)}
          prepare={(data) => ({ organizationId: review.organizationId, intakeId: review.intakeId,
            candidateId: item.candidateId, expectedReviewDigest: item.reviewDigest!,
            discussionAt: new Date(String(data.get("discussionAt"))).toISOString(),
            discussionReference: String(data.get("discussionReference")), conflictDisclosure: String(data.get("conflictDisclosure")),
            reason: String(data.get("reason")), ...commandIds() })}>
          <label className="block text-sm font-medium">Discussion date and time<input type="datetime-local" name="discussionAt" required className={workflowInputClass}/></label>
          <label className="block text-sm font-medium">Discussion record<input name="discussionReference" required maxLength={300} placeholder="Meeting notes or call reference" className={workflowInputClass}/></label>
          <label className="block text-sm font-medium">Commercial conflicts explained to the customer<textarea name="conflictDisclosure" required maxLength={2000} rows={3} className={workflowInputClass}/></label>
          <label className="block text-sm font-medium">Reason for disclosure<input name="reason" required maxLength={500} className={workflowInputClass}/></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>I completed the customer discussion and reviewed these provider details.</label>
        </WorkflowCommand>}
    </article>)}
  </section>;
}

export function RfpControls({ workflow, revision, identityId }: { workflow: RfpWorkflow; revision: number; identityId: string }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.rfps.create.mutationOptions());
  const approve = useMutation(trpc.rfps.approve.mutationOptions());
  const deliver = useMutation(trpc.rfps.deliver.mutationOptions());
  return <section className="space-y-6 border-t pt-8" aria-labelledby="rfp-heading">
    <div><h2 id="rfp-heading" className="text-balance text-xl font-semibold">RFP review and delivery</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Create the full questionnaire after the customer discussion. {workflow.requiresSeparateApproval ? "A different MMHR staff member must approve it." : "Separate staff approval is off. You can approve your own draft."}</p></div>
    <WorkflowCommand<Parameters<typeof create.mutateAsync>[0]> label="Save RFP draft" success="RFP draft saved for review."
      execute={(input) => create.mutateAsync(input)} prepare={(data) => ({ organizationId: workflow.organizationId,
        intakeId: workflow.intakeId, sourceRevision: revision, rfpId: crypto.randomUUID(),
        title: String(data.get("title")), content: String(data.get("content")), ...commandIds() })}>
      <label className="block text-sm font-medium">RFP title<input name="title" required maxLength={200} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Complete requirements, customizations, and vendor questions<textarea name="content" required minLength={10} maxLength={30000} rows={10} className={workflowInputClass}/></label>
      <p className="text-sm text-muted-foreground">Only this text is delivered to vendors. Include all details they need to respond.</p>
    </WorkflowCommand>
    {workflow.rfps.map((rfp) => <article key={`${rfp.rfpId}:${rfp.status}:${rfp.deliveryDigest}`} className="space-y-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg font-semibold">{rfp.title}</h3><p className="text-sm capitalize">{rfp.status}</p></div>
      <div className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{rfp.content}</div>
      {rfp.status === "draft" && (workflow.requiresSeparateApproval && rfp.createdByIdentityId === identityId ? <p className="text-sm">A different MMHR staff member must approve this draft.</p> :
        <WorkflowCommand<Parameters<typeof approve.mutateAsync>[0]> label="Approve RFP" success="RFP approved." execute={(input) => approve.mutateAsync(input)}
          prepare={(data) => ({ organizationId: workflow.organizationId, rfpId: rfp.rfpId, version: rfp.version,
            approvalReference: `approval:${String(data.get("reference"))}`, ...commandIds() })}>
          <label className="block text-sm font-medium">Approval record reference<input name="reference" required maxLength={256} pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*" className={workflowInputClass}/></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>I reviewed the full questionnaire and approve this version.</label>
        </WorkflowCommand>)}
      {rfp.status === "approved" && (workflow.readyToDeliver ? <WorkflowCommand<Parameters<typeof deliver.mutateAsync>[0]> label="Deliver to vendor portals" success="Approved RFP delivered to the selected vendor portals."
        execute={(input) => deliver.mutateAsync(input)} prepare={(data) => ({ organizationId: workflow.organizationId,
          rfpId: rfp.rfpId, version: rfp.version, expectedDigest: rfp.deliveryDigest,
          deadlineAt: new Date(String(data.get("deadline"))).toISOString(), ...commandIds() })}>
        <p className="text-sm">All {workflow.selectedCount} selected options have current provider disclosures.</p>
        <label className="block text-sm font-medium">Response deadline<input type="datetime-local" name="deadline" required className={workflowInputClass}/></label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>Deliver this approved questionnaire to all selected providers.</label>
      </WorkflowCommand> : <p role="status" className="text-sm">Complete current provider disclosures for every selected option before delivery.</p>)}
      {rfp.status === "distributed" && <p role="status" className="text-sm">Delivered to {rfp.recipientCount} vendor portal{rfp.recipientCount === 1 ? "" : "s"}.</p>}
      {rfp.status === "distributed" && <RfpNotificationControls organizationId={workflow.organizationId} rfpId={rfp.rfpId} version={rfp.version}/>}
    </article>)}
  </section>;
}

