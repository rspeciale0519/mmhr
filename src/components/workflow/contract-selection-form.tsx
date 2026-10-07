"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { type PortalHandoffPage, type PortalHandoffItem } from "@/lib/contract-handoff-portal";
import { ProposalQuoteDetails } from "./proposal-display";
import { ContractActionStatus, contractFieldClass, useContractAction } from "./contract-action";

const lines = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
export function ContractSelectionForm({ organizationId, intakeId, choices }: { organizationId: string; intakeId: string; choices: PortalHandoffPage["choices"] }) {
  const action = useContractAction(), prefix = useId();
  const [sourceId, setSourceId] = useState(choices[0]?.proposalVersionId ?? "");
  const source = choices.find(choice => choice.proposalVersionId === sourceId);
  return <form className="space-y-5 rounded-lg border p-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action.begin(() => {
      if (!source) throw new Error("Choose a current approved quote.");
      return { action: "select", organizationId, intakeId, comparisonId: source.comparisonId, proposalVersionId: source.proposalVersionId,
        expectedQuoteRevision: source.quoteRevision, selectionReasons: lines(form.get("reasons")), remainingRisks: lines(form.get("risks")) };
    });
  }}><h2 className="text-xl font-semibold">Record your vendor selection</h2>
    <p className="text-sm leading-7">Choose an approved quote. Staff must approve your decision before the formal introduction.</p>
    <fieldset disabled={action.locked} className="space-y-4">
      <label htmlFor={`${prefix}-quote`} className="block space-y-2"><span className="text-sm font-medium">Approved vendor quote</span>
        <select id={`${prefix}-quote`} className={contractFieldClass} value={sourceId} onChange={event => setSourceId(event.target.value)} required>
          {choices.map(choice => <option key={choice.proposalVersionId} value={choice.proposalVersionId}>{choice.vendorName} · Version {choice.versionNumber} · {choice.quote.quoteReference}</option>)}</select></label>
      {source && <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm">Read selected quote and pricing</summary><ProposalQuoteDetails quote={source.quote}/></details>}
      <label htmlFor={`${prefix}-reasons`} className="block space-y-2"><span className="text-sm font-medium">Selection reasons</span><span className="block text-sm">Use one reason per line. Enter up to ten reasons.</span>
        <textarea id={`${prefix}-reasons`} name="reasons" className={contractFieldClass} maxLength={5500} rows={4} required/></label>
      <label htmlFor={`${prefix}-risks`} className="block space-y-2"><span className="text-sm font-medium">Remaining risks</span><span className="block text-sm">Use one risk per line. Enter up to twenty risks.</span>
        <textarea id={`${prefix}-risks`} name="risks" className={contractFieldClass} maxLength={11000} rows={4}/></label>
      <Button type="submit" className="min-h-11" disabled={!source}>Save vendor selection for staff approval</Button>
    </fieldset><ContractActionStatus action={action}/></form>;
}
export function ContractSelectionDecision({ organizationId, item }: { organizationId: string; item: PortalHandoffItem }) {
  const action = useContractAction(), prefix = useId();
  const choices = [item.canApprove ? "approve_selection" : null, item.canReject ? "reject_selection" : null, item.canWithdraw ? "withdraw_selection" : null].filter((value): value is "approve_selection" | "reject_selection" | "withdraw_selection" => value !== null);
  const [decision, setDecision] = useState(choices[0] ?? "reject_selection");
  return <form className="space-y-4 border-t pt-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action.begin(() => {
      if (!choices.includes(decision)) throw new Error("Choose an available decision.");
      return { action: decision, organizationId, selectionId: item.selectionId, expectedRevision: item.revision, reason: String(form.get("reason")),
        ...(decision === "approve_selection" ? { approvalReference: String(form.get("reference")) } : {}) };
    });
  }}><fieldset disabled={action.locked} className="space-y-4">
    <label htmlFor={`${prefix}-decision`} className="block space-y-2"><span className="text-sm font-medium">Selection decision</span><select id={`${prefix}-decision`} className={contractFieldClass} value={decision} onChange={event => setDecision(event.target.value as typeof decision)}>
      {choices.map(choice => <option key={choice} value={choice}>{choice === "approve_selection" ? "Approve customer selection" : choice === "reject_selection" ? "Reject customer selection" : "Withdraw my selection"}</option>)}</select></label>
    <label htmlFor={`${prefix}-reason`} className="block space-y-2"><span className="text-sm font-medium">Decision reason</span><textarea id={`${prefix}-reason`} name="reason" className={contractFieldClass} rows={3} maxLength={2000} required/></label>
    {decision === "approve_selection" && <label htmlFor={`${prefix}-reference`} className="block space-y-2"><span className="text-sm font-medium">Staff approval reference</span><input id={`${prefix}-reference`} name="reference" className={contractFieldClass} maxLength={300} required/></label>}
    <Button type="submit" className="min-h-11">Save selection decision</Button>
  </fieldset><ContractActionStatus action={action}/></form>;
}
