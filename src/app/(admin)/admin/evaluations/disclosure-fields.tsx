import { WorkflowFieldError, workflowInputClass } from "@/components/workflow-command";

export const disclosureInvalidMessage = "The server did not accept the disclosure fields. Fill in each field, keep the text within its length limit, and use a past discussion time.";

/** The same field rules apply to one option and to all options recorded together. */
export function readDisclosureFields(data: FormData, now = Date.now()) {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const discussionAt = new Date(String(data.get("discussionAt") ?? ""));
  if (Number.isNaN(discussionAt.getTime())) throw new WorkflowFieldError("Enter the discussion date and time.");
  if (discussionAt.getTime() > now) throw new WorkflowFieldError("The discussion date and time cannot be in the future.");
  const fields = { discussionAt: discussionAt.toISOString(), discussionReference: text("discussionReference"),
    conflictDisclosure: text("conflictDisclosure"), reason: text("reason") };
  if (!fields.discussionReference || !fields.conflictDisclosure || !fields.reason) {
    throw new WorkflowFieldError("Fill in the discussion record, the commercial conflicts, and the reason. Spaces alone are not accepted.");
  }
  return fields;
}

export function DisclosureFields() {
  return <>
    <label className="block text-sm font-medium">Discussion date and time<input type="datetime-local" name="discussionAt" required className={workflowInputClass}/></label>
    <label className="block text-sm font-medium">Discussion record<input name="discussionReference" required maxLength={300} placeholder="Meeting notes or call reference" className={workflowInputClass}/></label>
    <label className="block text-sm font-medium">Commercial conflicts explained to the customer<textarea name="conflictDisclosure" required maxLength={2000} rows={3} className={workflowInputClass}/></label>
    <label className="block text-sm font-medium">Reason for disclosure<input name="reason" required maxLength={500} className={workflowInputClass}/></label>
  </>;
}
