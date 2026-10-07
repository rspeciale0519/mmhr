"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DemoCoordinationPage } from "@/lib/demo-coordination";
import { DemoActionStatus, demoFieldClass, useDemoAction } from "./demo-action";

export function DemoPlanForm({ organizationId, choices }: { organizationId: string; choices: DemoCoordinationPage["choices"] }) {
  const id = useId(), action = useDemoAction();
  const [participants, setParticipants] = useState(1);
  const [choiceIndex, setChoiceIndex] = useState(0);
  if (choices.length === 0) return <p className="text-sm leading-7">No disclosed products have a delivered RFP in this workspace. Complete those steps before planning a demo.</p>;
  const selectedIndex = choiceIndex < choices.length ? choiceIndex : 0, selectedChoice = choices[selectedIndex]!;
  return <details className="rounded-lg border p-5">
    <summary className="flex min-h-11 cursor-pointer items-center font-medium">Plan a demo</summary>
    <form className="mt-5 space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      action.begin(() => {
        const choice = choices[Number(data.get("choice"))];
        if (!choice) throw new Error("Choose a product and request.");
        return { action: "create", organizationId, candidateId: choice.candidateId, recipientId: choice.recipientId,
          plan: { round: Number(data.get("round")), audience: data.get("audience"), purpose: data.get("purpose"), format: data.get("format"),
            requiredTopics: String(data.get("topics")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
            participants: Array.from({ length: participants }, (_, index) => ({ name: data.get(`name-${index}`),
              role: data.get(`role-${index}`), organization: data.get(`organization-${index}`) })) } };
      });
    }}>
      {!action.saved && <fieldset disabled={action.locked} className="space-y-4">
        <label className="block space-y-2" htmlFor={`${id}-choice`}><span className="text-sm font-medium">Product and RFP</span>
          <select id={`${id}-choice`} name="choice" className={demoFieldClass} required value={selectedIndex} onChange={(event) => setChoiceIndex(Number(event.target.value))}>{choices.map((choice, index) =>
            <option key={`${choice.candidateId}-${choice.recipientId}`} value={index}>{choice.providerName} · {choice.productName} · {choice.requestTitle}</option>)}</select></label>
        <p className="text-sm leading-7 [overflow-wrap:anywhere]" aria-live="polite">Selected product: {selectedChoice.providerName} · {selectedChoice.productName} · {selectedChoice.requestTitle}</p>
        <label className="block space-y-2" htmlFor={`${id}-round`}><span className="text-sm font-medium">Demo round</span>
          <input id={`${id}-round`} name="round" className={demoFieldClass} type="number" min={1} max={20} defaultValue={1} required /></label>
        <label className="block space-y-2" htmlFor={`${id}-audience`}><span className="text-sm font-medium">Audience</span>
          <input id={`${id}-audience`} name="audience" className={demoFieldClass} maxLength={500} required /></label>
        <label className="block space-y-2" htmlFor={`${id}-purpose`}><span className="text-sm font-medium">Purpose</span>
          <textarea id={`${id}-purpose`} name="purpose" className={demoFieldClass} rows={3} maxLength={2000} required /></label>
        <label className="block space-y-2" htmlFor={`${id}-format`}><span className="text-sm font-medium">Meeting format</span>
          <select id={`${id}-format`} name="format" className={demoFieldClass}><option value="remote">Remote</option><option value="onsite">On site</option><option value="hybrid">Hybrid</option></select></label>
        <label className="block space-y-2" htmlFor={`${id}-topics`}><span className="text-sm font-medium">Required topics, one per line</span>
          <textarea id={`${id}-topics`} name="topics" className={demoFieldClass} rows={4} maxLength={10000} required /></label>
        <fieldset className="space-y-4"><legend className="mb-3 text-sm font-medium">Participants</legend>
          {Array.from({ length: participants }, (_, index) => <div key={index} className="space-y-3 rounded-md border p-3">
            <label className="block space-y-2" htmlFor={`${id}-name-${index}`}><span className="text-sm">Participant {index + 1} name</span>
              <input id={`${id}-name-${index}`} name={`name-${index}`} className={demoFieldClass} maxLength={200} required /></label>
            <label className="block space-y-2" htmlFor={`${id}-role-${index}`}><span className="text-sm">Role</span>
              <input id={`${id}-role-${index}`} name={`role-${index}`} className={demoFieldClass} maxLength={200} required /></label>
            <label className="block space-y-2" htmlFor={`${id}-organization-${index}`}><span className="text-sm">Organization</span>
              <select id={`${id}-organization-${index}`} name={`organization-${index}`} className={demoFieldClass}><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="mmhr">MMHR</option></select></label>
          </div>)}
          <Button type="button" variant="outline" className="min-h-11" disabled={participants >= 30} onClick={() => setParticipants((count) => count + 1)}>Add participant</Button>
        </fieldset>
        <p className="text-sm leading-7 text-muted-foreground">Customer and vendor users can read this plan. Both must supply acceptable times before MMHR confirms a meeting.</p>
        <Button type="submit" className="min-h-11">Save demo plan</Button>
      </fieldset>}
      <DemoActionStatus action={action} />
      {action.saved && <Button type="button" variant="outline" className="min-h-11" onClick={action.reset}>Plan another demo</Button>}
    </form>
  </details>;
}
