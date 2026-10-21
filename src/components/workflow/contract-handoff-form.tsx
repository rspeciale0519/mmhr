"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { canTransitionPortalHandoff, type PortalHandoffItem, type PortalHandoffStatus } from "@/lib/contract-handoff-portal";
import { demoLocalTimeToIso } from "@/lib/demo-time";
import { ContractActionStatus, contractFieldClass, useContractAction } from "./contract-action";

export function ContractHandoffForm({ organizationId, item, introduction = false }: { organizationId: string; item: PortalHandoffItem; introduction?: boolean }) {
  const action = useContractAction(), prefix = useId();
  const choices = introduction ? ["introduced" as const] : (["negotiating", "stalled", "signed", "not_signed", "cancelled"] as const)
    .filter(status => item.status !== null && canTransitionPortalHandoff(item.status, status, item.introducedAt !== null));
  const [next, setNext] = useState<PortalHandoffStatus>(choices[0] ?? "cancelled");
  const dated = introduction || next === "signed";
  return <form className="space-y-4 border-t pt-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action.begin(() => {
      if (!item.handoffId || !item.handoffRevision || !item.status || !choices.includes(next as never)) throw new Error("Choose an available handoff action.");
      const common = { organizationId, handoffId: item.handoffId, expectedRevision: item.handoffRevision, reason: String(form.get("reason")) };
      if (dated) {
        const date = demoLocalTimeToIso(String(form.get("date")), String(form.get("zone"))), reference = String(form.get("reference"));
        return introduction ? { ...common, action: "introduce", introducedAt: date, introductionReference: reference }
          : { ...common, action: "record_signed", signedAt: date, contractReference: reference };
      }
      return { ...common, action: "transition", fromStatus: item.status, toStatus: next };
    });
  }}><h3 className="text-lg font-semibold">{introduction ? "Record the formal introduction" : "Update contract status"}</h3>
    <fieldset disabled={action.locked} className="space-y-4">
      {!introduction && <label htmlFor={`${prefix}-status`} className="block space-y-2"><span className="text-sm font-medium">Next status</span>
        <select id={`${prefix}-status`} className={contractFieldClass} value={next} onChange={event => setNext(event.target.value as PortalHandoffStatus)}>
          {choices.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>}
      <label htmlFor={`${prefix}-reason`} className="block space-y-2"><span className="text-sm font-medium">Staff record reason</span><textarea id={`${prefix}-reason`} name="reason" className={contractFieldClass} maxLength={2000} rows={3} required/></label>
      {dated && <>
        <label htmlFor={`${prefix}-zone`} className="block space-y-2"><span className="text-sm font-medium">Record time zone</span><span className="block text-sm">Use an IANA zone, such as America/New_York, or UTC.</span>
          <input id={`${prefix}-zone`} name="zone" className={contractFieldClass} defaultValue="UTC" maxLength={80} required/></label>
        <label htmlFor={`${prefix}-date`} className="block space-y-2"><span className="text-sm font-medium">{introduction ? "Introduction date and time" : "Contract signing date and time"}</span>
          <input id={`${prefix}-date`} name="date" type="datetime-local" step="1" className={contractFieldClass} required/></label>
        <label htmlFor={`${prefix}-reference`} className="block space-y-2"><span className="text-sm font-medium">{introduction ? "Introduction record reference" : "Signed contract reference"}</span>
          <input id={`${prefix}-reference`} name="reference" className={contractFieldClass} maxLength={500} required/></label>
        {!introduction && <p className="text-sm leading-7">Record the parties’ signed outcome. This action does not approve commissions or close the financial record.</p>}
      </>}
      <Button type="submit" className="min-h-11" disabled={choices.length === 0}>{introduction ? "Save introduction record" : "Save contract status"}</Button>
    </fieldset><ContractActionStatus action={action}/></form>;
}
