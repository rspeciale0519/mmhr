"use client";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WorkflowCommand, workflowInputClass } from "@/components/workflow-command";
import type { VendorCatalogProfile } from "@/server/crm/vendor-catalog-contract";

export function ProfileReview({ profile }: { profile: VendorCatalogProfile }) {
  const trpc = useTRPC();
  const approve = useMutation(trpc.vendorEvidence.approveProfile.mutationOptions({ retry: false }));
  return <section aria-label="Vendor catalog approval" className="space-y-4 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">Vendor catalog approval</h2>
    <p className="text-sm leading-6">Review the vendor profile before its products enter comparisons. Each product and fact still needs its own review.</p>
    {profile.approvedAt ? <p>Catalog approved on {new Date(profile.approvedAt).toISOString().slice(0, 10)}. Profile status: {profile.status}.</p>
      : profile.status === "active" || profile.status === "prospect" ? <WorkflowCommand key={profile.revision}
        label="Approve vendor for catalog" success="Vendor catalog approval saved. Product evidence and comparison publication still require review."
        prepare={data => ({ organizationId: profile.organizationId, profileId: profile.profileId, expectedRevision: profile.revision,
          reason: String(data.get("reason")), approvalReference: String(data.get("reference")), idempotencyKey: crypto.randomUUID() })}
        execute={input => approve.mutateAsync(input)}>
        <label className="block text-sm font-medium">Catalog review reference<input name="reference" required maxLength={200} className={workflowInputClass}/></label>
        <label className="block text-sm font-medium">Catalog approval reason<textarea name="reason" required maxLength={500} className={workflowInputClass}/></label>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1"/>I checked the vendor identity, product scope, sources, and duplicate records.</label>
        <p className="text-sm">This records catalog review. It does not approve commercial terms or grant vendor access.</p>
      </WorkflowCommand> : <p>This profile is {profile.status}. Catalog approval is unavailable.</p>}
  </section>;
}
