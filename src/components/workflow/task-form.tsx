"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { canApplyTaskAction, taskPriorities, type TaskCommand, type TaskItem } from "@/lib/deal-follow-up";
import { demoLocalTimeToIso } from "@/lib/demo-time";
import { TaskActionStatus, taskFieldClass, useTaskAction } from "./task-action";
import { TaskChoice, type TaskChoicePage } from "./task-choice";

export function TaskForm({ organizationId, item, people, deals, viewerIdentityId }: { organizationId: string; item?: TaskItem; viewerIdentityId?: string;
  people: TaskChoicePage; deals?: TaskChoicePage }) {
  const prefix = useId(), action = useTaskAction();
  const choices: TaskCommand["action"][] = item ? [
    ...(item.canManage ? ["edit", "reassign", "transfer_owner", "cancel"] as const : []),
    ...(item.canProgress ? ["start", "block", "resume", "complete"] as const : []),
  ].filter(value => canApplyTaskAction(item.state, value)) : ["create"];
  const [selected, setSelected] = useState<TaskCommand["action"]>(choices[0] ?? "edit");
  if (!choices.length) return null;
  const fields = selected === "create" || selected === "edit";
  const initialDue = item?.dueAt ? new Date(item.dueAt).toISOString().slice(0, 19) : "";
  return <form className="space-y-5 rounded-lg border p-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "");
    action.begin(() => {
      const base = { organizationId, taskId: item?.taskId ?? crypto.randomUUID(), reason: get("reason"),
        ...(item ? { expectedRevision: item.revision } : {}) };
      const details = () => ({ title: get("title"), description: get("description").trim() || null,
        priority: get("priority"), dueAt: get("dueAt") ? demoLocalTimeToIso(get("dueAt"), get("zone")) : null });
      if (selected === "create") return { ...base, action: selected, dealId: get("dealId"), ownerIdentityId: get("ownerIdentityId"),
        assigneeIdentityId: get("assigneeIdentityId") || null, ...details() };
      if (selected === "edit") return { ...base, action: selected, ...details() };
      if (selected === "reassign") return { ...base, action: selected, assigneeIdentityId: get("assigneeIdentityId") || null };
      if (selected === "transfer_owner") return { ...base, action: selected, ownerIdentityId: get("ownerIdentityId") };
      if (selected === "block") return { ...base, action: selected, blockerReason: get("blockerReason") };
      return { ...base, action: selected };
    });
  }}>
    <h2 className="text-xl font-semibold">{item ? "Change task" : "Create follow-up task"}</h2>
    <fieldset disabled={action.locked} className="space-y-4">
      {item && <label htmlFor={`${prefix}-action`} className="block space-y-2"><span className="text-sm font-medium">Action</span>
        <select id={`${prefix}-action`} className={taskFieldClass} value={selected} onChange={event => setSelected(event.target.value as TaskCommand["action"])}>
          {choices.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select></label>}
      {selected === "create" && deals && <TaskChoice organizationId={organizationId} kind="deals" initial={deals} name="dealId" label="Customer deal"/>}
      {fields && <>
        <label htmlFor={`${prefix}-title`} className="block space-y-2"><span className="text-sm font-medium">Task title</span>
          <input id={`${prefix}-title`} name="title" className={taskFieldClass} defaultValue={item?.title} maxLength={200} required/></label>
        <div className="space-y-2">
          <label htmlFor={`${prefix}-description`} className="block text-sm font-medium">Description</label>
          <textarea id={`${prefix}-description`} name="description" aria-describedby={`${prefix}-description-help`}
            className={taskFieldClass} defaultValue={item?.description ?? ""} maxLength={2000} rows={3}/>
          <p id={`${prefix}-description-help`} className="text-sm">Leave this field empty to clear the description.</p>
        </div>
        <label htmlFor={`${prefix}-priority`} className="block space-y-2"><span className="text-sm font-medium">Priority</span>
          <select id={`${prefix}-priority`} name="priority" className={taskFieldClass} defaultValue={item?.priority ?? "normal"}>
            {taskPriorities.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        <div className="space-y-2">
          <label htmlFor={`${prefix}-due`} className="block text-sm font-medium">Due date and time</label>
          <input id={`${prefix}-due`} name="dueAt" type="datetime-local" step="1" aria-describedby={`${prefix}-due-help`}
            className={taskFieldClass} defaultValue={initialDue}/>
          <p id={`${prefix}-due-help`} className="text-sm">Leave this field empty to clear the due date.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor={`${prefix}-zone`} className="block text-sm font-medium">Due time zone</label>
          <input id={`${prefix}-zone`} name="zone" defaultValue="UTC" aria-describedby={`${prefix}-zone-help`}
            className={taskFieldClass} maxLength={80} required/>
          <p id={`${prefix}-zone-help`} className="text-sm">Use UTC or an IANA time zone, such as America/New_York.</p>
        </div>
      </>}
      {(selected === "create" || selected === "transfer_owner") && <TaskChoice key="ownerIdentityId" organizationId={organizationId} kind="people" initial={people}
        name="ownerIdentityId" label="Task owner" defaultValue={item?.ownerIdentityId ?? viewerIdentityId} currentLabel={item?.ownerLabel}
        unavailableValue={item?.ownerAvailable ? undefined : item?.ownerIdentityId}/>}
      {(selected === "create" || selected === "reassign") && <TaskChoice key="assigneeIdentityId" organizationId={organizationId} kind="people" initial={people}
        name="assigneeIdentityId" label="Task assignee" defaultValue={item?.assigneeIdentityId ?? ""} optional
        currentLabel={item?.assigneeLabel ?? undefined}
        unavailableValue={item?.assigneeAvailable ? undefined : item?.assigneeIdentityId ?? undefined}/>}
      {selected === "block" && <label htmlFor={`${prefix}-blocker`} className="block space-y-2"><span className="text-sm font-medium">Blocker</span>
        <textarea id={`${prefix}-blocker`} name="blockerReason" className={taskFieldClass} rows={3} maxLength={2000} required/></label>}
      <label htmlFor={`${prefix}-reason`} className="block space-y-2"><span className="text-sm font-medium">Record reason</span>
        <textarea id={`${prefix}-reason`} name="reason" className={taskFieldClass} rows={3} maxLength={2000} required/></label>
      {selected === "complete" && <p className="text-sm">Completion closes this task. Closed tasks cannot change.</p>}
      {selected === "cancel" && <p className="text-sm">Cancellation closes this task. Closed tasks cannot change.</p>}
      <Button type="submit" className="min-h-11">{action.pending ? "Saving task…" : "Save task"}</Button>
    </fieldset>
    <TaskActionStatus action={action}/>
  </form>;
}
