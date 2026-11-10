"use client";

import { z } from "zod";
import type { ReactNode } from "react";

export const payrollAnswerSchema = z.strictObject({
  version: z.literal(1),
  requested: z.enum(["yes", "no"]).nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  workerType: z.enum(["employee", "contractor", "mixed"]).nullable(),
  stateScope: z.enum(["single", "multiple"]).nullable(),
  allowPayrollAddOn: z.boolean().nullable(),
  allowPayrollPartner: z.boolean().nullable().default(null),
});
export type PayrollAnswer = z.infer<typeof payrollAnswerSchema>;
export const emptyPayrollAnswer: PayrollAnswer = {
  version: 1, requested: null, country: null, workerType: null, stateScope: null, allowPayrollAddOn: null, allowPayrollPartner: null,
};
export function payrollAnswerForSave(answer: PayrollAnswer) {
  const { allowPayrollPartner, ...previousFields } = answer;
  return allowPayrollPartner === null ? previousFields : { ...previousFields, allowPayrollPartner };
}
const fieldClass = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";

export function PayrollAnswerSummary({ value, fallback }: { value: unknown; fallback: ReactNode }) {
  const parsed = payrollAnswerSchema.safeParse(value);
  if (!parsed.success) return fallback;
  const answer = parsed.data;
  const rows = [
    ["Payroll processing", answer.requested === null ? "Not sure yet" : answer.requested === "yes" ? "Needed" : "Not needed"],
    ["Country", answer.country ?? "Not specified"],
    ["Workers", answer.workerType === "employee" ? "Employees" : answer.workerType === "contractor" ? "Contractors" : answer.workerType === "mixed" ? "Employees and contractors" : "Not specified"],
    ["US locations", answer.stateScope === "single" ? "One state" : answer.stateScope === "multiple" ? "More than one state" : "Not specified"],
    ["Paid payroll add-on", answer.allowPayrollAddOn === null ? "Not sure yet" : answer.allowPayrollAddOn ? "Would consider" : "Would not consider"],
    ["Partner payroll provider", answer.allowPayrollPartner === null ? "Not sure yet" : answer.allowPayrollPartner ? "Would consider" : "Would not consider"],
  ];
  return <dl className="space-y-3">{rows.map(([label, text]) => <div key={label}><dt className="font-medium">{label}</dt><dd>{text}</dd></div>)}</dl>;
}

export function PayrollAnswerFields({ value, onChange }: { value: PayrollAnswer; onChange: (value: PayrollAnswer) => void }) {
  return <section aria-label="Payroll needs" className="space-y-5">
    <p className="text-sm leading-6 text-muted-foreground">Describe the payroll you need. Leave uncertain answers blank. These answers do not confirm a purchase.</p>
    <label className="block space-y-2 text-sm font-medium">Do you need payroll processing?
      <select aria-label="Do you need payroll processing?" className={fieldClass} value={value.requested ?? ""}
        onChange={event => onChange({ ...value, requested: event.target.value as PayrollAnswer["requested"] || null })}>
        <option value="">Not sure yet</option><option value="yes">Yes</option><option value="no">No</option>
      </select></label>
    <label className="block space-y-2 text-sm font-medium">Payroll country code
      <span className="block text-xs font-normal text-muted-foreground">Enter a two-letter country code, such as US. Leave blank for multiple countries or an undecided location.</span>
      <input aria-label="Payroll country code" className={fieldClass} value={value.country ?? ""} maxLength={2} pattern="[A-Za-z]{2}"
        placeholder="Example: US" onChange={event => onChange({ ...value, country: event.target.value.toUpperCase() || null })}/></label>
    <label className="block space-y-2 text-sm font-medium">Who will you pay?
      <select aria-label="Who will you pay?" className={fieldClass} value={value.workerType ?? ""}
        onChange={event => onChange({ ...value, workerType: event.target.value as PayrollAnswer["workerType"] || null })}>
        <option value="">Not sure yet</option><option value="employee">Employees</option><option value="contractor">Contractors</option><option value="mixed">Employees and contractors</option>
      </select></label>
    <label className="block space-y-2 text-sm font-medium">US payroll locations
      <select aria-label="US payroll locations" className={fieldClass} value={value.stateScope ?? ""}
        onChange={event => onChange({ ...value, stateScope: event.target.value as PayrollAnswer["stateScope"] || null })}>
        <option value="">Not sure or not applicable</option><option value="single">One state</option><option value="multiple">More than one state</option>
      </select></label>
    <label className="block space-y-2 text-sm font-medium">Would you consider a paid payroll add-on?
      <select aria-label="Would you consider a paid payroll add-on?" className={fieldClass} value={value.allowPayrollAddOn === null ? "" : String(value.allowPayrollAddOn)}
        onChange={event => onChange({ ...value, allowPayrollAddOn: event.target.value === "" ? null : event.target.value === "true" })}>
        <option value="">Not sure yet</option><option value="true">Yes</option><option value="false">No</option>
      </select></label>
    <label className="block space-y-2 text-sm font-medium">Would you consider payroll from a partner provider?
      <span className="block text-xs font-normal text-muted-foreground">A separate company would provide the payroll service.</span>
      <select aria-label="Would you consider payroll from a partner provider?" className={fieldClass} value={value.allowPayrollPartner === null ? "" : String(value.allowPayrollPartner)}
        onChange={event => onChange({ ...value, allowPayrollPartner: event.target.value === "" ? null : event.target.value === "true" })}>
        <option value="">Not sure yet</option><option value="true">Yes</option><option value="false">No</option>
      </select></label>
  </section>;
}
