"use client";

import { useId, useState } from "react";
import type { DemoCoordinationPage } from "@/lib/demo-coordination";
import { demoLocalTimeToIso } from "@/lib/demo-time";
import { validateDemoSchedule } from "@/lib/demo-planning";
import { Button } from "@/components/ui/button";
import { DemoActionStatus, demoFieldClass, useDemoAction } from "./demo-action";

type Item = DemoCoordinationPage["items"][number];
const lines = (data: FormData, name: string) => String(data.get(name) ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
function TimeZoneField({ id }: { id: string }) {
  return <label className="block space-y-2" htmlFor={`${id}-zone`}><span className="text-sm font-medium">Time zone for all entered times</span>
    <input id={`${id}-zone`} name="zone" list={`${id}-zones`} className={demoFieldClass} defaultValue="UTC" required maxLength={100} />
    <datalist id={`${id}-zones`}>{["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Kolkata"].map((zone) => <option key={zone} value={zone} />)}</datalist></label>;
}
function TimeField({ id, name, label }: { id: string; name: string; label: string }) {
  return <label className="block space-y-2" htmlFor={`${id}-${name}`}><span className="text-sm font-medium">{label}</span>
    <input id={`${id}-${name}`} name={name} className={demoFieldClass} type="datetime-local" required /></label>;
}
export function DemoAvailabilityForm({ organizationId, view, item }: { organizationId: string; view: "customer" | "vendor"; item: Item }) {
  const id = useId(), action = useDemoAction(), [windows, setWindows] = useState(1);
  if (item.status !== "requested") return null;
  return <details className="border-t pt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm underline">Supply acceptable times</summary>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      action.begin(() => { const timeZone = String(data.get("zone")); return {
        action: `${view}_availability`, organizationId, demoId: item.demoId, expectedRevision: item.revision,
        availability: { timeZone, windows: Array.from({ length: windows }, (_, index) => ({
          startAt: demoLocalTimeToIso(String(data.get(`start-${index}`)), timeZone),
          endAt: demoLocalTimeToIso(String(data.get(`end-${index}`)), timeZone),
        })), note: String(data.get("note")).trim() || null },
      }; });
    }}>
      {!action.saved && <fieldset disabled={action.locked} className="space-y-4">
        <TimeZoneField id={id} />
        {Array.from({ length: windows }, (_, index) => <fieldset key={index} className="space-y-3 rounded-md border p-3">
          <legend className="text-sm">Acceptable window {index + 1}</legend>
          <TimeField id={id} name={`start-${index}`} label="Start" /><TimeField id={id} name={`end-${index}`} label="End" />
        </fieldset>)}
        <Button type="button" variant="outline" className="min-h-11" disabled={windows >= 10} onClick={() => setWindows((count) => count + 1)}>Add another time window</Button>
        <label className="block space-y-2" htmlFor={`${id}-note`}><span className="text-sm font-medium">Coordination note, optional</span>
          <textarea id={`${id}-note`} name="note" className={demoFieldClass} rows={3} maxLength={2000} /></label>
        <p className="text-sm leading-7">Use future windows from 15 minutes to 8 hours. MMHR must confirm the final time.</p>
        <Button type="submit" className="min-h-11">Save acceptable times</Button>
      </fieldset>}
      <DemoActionStatus action={action} />
      {action.saved && <Button type="button" variant="outline" className="min-h-11" onClick={action.reset}>Change acceptable times</Button>}
    </form>
  </details>;
}
export function DemoConfirmationForm({ organizationId, item }: { organizationId: string; item: Item }) {
  const id = useId(), action = useDemoAction();
  if (item.status !== "requested") return null;
  if (!item.coordination.customerAvailability || !item.coordination.vendorAvailability) return <p className="text-sm">Wait for both customer and vendor acceptable times.</p>;
  return <details className="border-t pt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm underline">Confirm agreed meeting</summary>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      action.begin(() => {
        const timeZone = String(data.get("zone"));
        const schedule = validateDemoSchedule({ timeZone, window: { startAt: demoLocalTimeToIso(String(data.get("start")), timeZone),
          endAt: demoLocalTimeToIso(String(data.get("end")), timeZone) }, reminderAt: demoLocalTimeToIso(String(data.get("reminder")), timeZone),
          location: data.get("location"), confirmationNote: data.get("note") }, item.coordination.customerAvailability, item.coordination.vendorAvailability, new Date());
        return { action: "confirm", organizationId, demoId: item.demoId, expectedRevision: item.revision, schedule, reason: data.get("reason") };
      });
    }}>
      {!action.saved && <fieldset disabled={action.locked} className="space-y-4">
        <TimeZoneField id={id} /><TimeField id={id} name="start" label="Meeting start" /><TimeField id={id} name="end" label="Meeting end" />
        <TimeField id={id} name="reminder" label="Reminder time" />
        <label className="block space-y-2" htmlFor={`${id}-location`}><span className="text-sm font-medium">Meeting location or link</span>
          <input id={`${id}-location`} name="location" className={demoFieldClass} required maxLength={500} /></label>
        <label className="block space-y-2" htmlFor={`${id}-note`}><span className="text-sm font-medium">Confirmation note for all participants</span>
          <textarea id={`${id}-note`} name="note" className={demoFieldClass} rows={3} required maxLength={2000} /></label>
        <label className="block space-y-2" htmlFor={`${id}-reason`}><span className="text-sm font-medium">Reason</span>
          <input id={`${id}-reason`} name="reason" className={demoFieldClass} required maxLength={2000} /></label>
        <Button type="submit" className="min-h-11">Confirm meeting</Button>
      </fieldset>}<DemoActionStatus action={action} />
    </form>
  </details>;
}
export function DemoStateForm({ organizationId, item }: { organizationId: string; item: Item }) {
  const id = useId(), action = useDemoAction();
  if (!["requested", "scheduled"].includes(item.status)) return null;
  return <details className="border-t pt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm underline">Change demo status</summary>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      action.begin(() => ({ action: data.get("action"), organizationId, demoId: item.demoId, expectedRevision: item.revision, reason: data.get("reason") }));
    }}>
      {!action.saved && <fieldset disabled={action.locked} className="space-y-4">
        <label className="block space-y-2" htmlFor={`${id}-action`}><span className="text-sm font-medium">Action</span>
          <select id={`${id}-action`} name="action" className={demoFieldClass}><option value="cancel">Cancel demo</option>{item.status === "scheduled" && <option value="reopen">Reopen scheduling</option>}</select></label>
        <label className="block space-y-2" htmlFor={`${id}-reason`}><span className="text-sm font-medium">Reason shared with participants</span>
          <textarea id={`${id}-reason`} name="reason" className={demoFieldClass} required rows={3} maxLength={2000} /></label>
        <Button type="submit" className="min-h-11">Save status change</Button>
      </fieldset>}<DemoActionStatus action={action} />
    </form>
  </details>;
}
export function DemoOutcomeForm({ organizationId, item, meetingEnded }: { organizationId: string; item: Item; meetingEnded: boolean }) {
  const id = useId(), action = useDemoAction();
  if (item.status !== "scheduled") return null;
  if (!item.coordination.schedule || !meetingEnded) {
    return <p className="text-sm leading-7">Record the outcome after the confirmed meeting ends.</p>;
  }
  return <details className="border-t pt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm underline">Record meeting outcome</summary>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      action.begin(() => ({ action: data.get("outcome"), organizationId, demoId: item.demoId, expectedRevision: item.revision, reason: data.get("reason"),
        outcome: { attendance: item.coordination.plan.participants.map((participant, index) => ({ name: participant.name, attended: data.get(`attended-${index}`) === "on" })),
          feedback: data.get("feedback"), score: Number(data.get("score")), commitments: lines(data, "commitments"), requestedChanges: lines(data, "changes"),
          nextAction: data.get("nextAction"), nextActionAt: demoLocalTimeToIso(String(data.get("nextActionAt")), String(data.get("zone"))), evidenceVersionIds: [] } }));
    }}>
      {!action.saved && <fieldset disabled={action.locked} className="space-y-4">
        <label className="block space-y-2" htmlFor={`${id}-outcome`}><span className="text-sm font-medium">Outcome</span>
          <select id={`${id}-outcome`} name="outcome" className={demoFieldClass}><option value="complete">Completed</option><option value="no_show">No show</option></select></label>
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Attendance</legend>{item.coordination.plan.participants.map((person, index) =>
          <label key={index} className="flex min-h-11 items-center gap-3"><input type="checkbox" name={`attended-${index}`} />{person.name} attended</label>)}</fieldset>
        <label className="block space-y-2" htmlFor={`${id}-feedback`}><span className="text-sm font-medium">Feedback shared with participants</span>
          <textarea id={`${id}-feedback`} name="feedback" className={demoFieldClass} rows={3} maxLength={5000} required /></label>
        <label className="block space-y-2" htmlFor={`${id}-score`}><span className="text-sm font-medium">Score from 1 to 5</span>
          <input id={`${id}-score`} name="score" className={demoFieldClass} type="number" min={1} max={5} required /></label>
        <label className="block space-y-2" htmlFor={`${id}-commitments`}><span className="text-sm font-medium">Commitments, one per line</span>
          <textarea id={`${id}-commitments`} name="commitments" className={demoFieldClass} rows={3} maxLength={20000} /></label>
        <label className="block space-y-2" htmlFor={`${id}-changes`}><span className="text-sm font-medium">Requested changes, one per line</span>
          <textarea id={`${id}-changes`} name="changes" className={demoFieldClass} rows={3} maxLength={20000} /></label>
        <label className="block space-y-2" htmlFor={`${id}-next`}><span className="text-sm font-medium">Next action</span>
          <input id={`${id}-next`} name="nextAction" className={demoFieldClass} required maxLength={2000} /></label>
        <TimeZoneField id={id} /><TimeField id={id} name="nextActionAt" label="Next action due" />
        <label className="block space-y-2" htmlFor={`${id}-reason`}><span className="text-sm font-medium">Reason</span>
          <textarea id={`${id}-reason`} name="reason" className={demoFieldClass} rows={3} maxLength={2000} required /></label>
        <p className="text-sm leading-7">Save the outcome after the meeting ends. The schedule stays in the demo history.</p>
        <Button type="submit" className="min-h-11">Save meeting outcome</Button>
      </fieldset>}<DemoActionStatus action={action} />
    </form>
  </details>;
}
