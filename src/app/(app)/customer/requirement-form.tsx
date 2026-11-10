"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";
import type { getIntakeRequirementsPage } from "@/server/commands/requirement-read";
import { ResponseValue } from "./requirement-views";
import { emptyPayrollAnswer, PayrollAnswerFields, payrollAnswerForSave, payrollAnswerSchema, type PayrollAnswer } from "./payroll-answer";

type Requirement = Awaited<ReturnType<typeof getIntakeRequirementsPage>>["requirements"][number];
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
type AnswerMode = "text" | "number" | "boolean" | "none" | "existing";
type SaveInput = {
  requirementId: string;
  organizationId: string;
  intakeId: string;
  expectedRevision: number;
  stableKey: string;
  label: string;
  importance: "must" | "nice" | "not_applicable";
  weight: number;
  response: JsonValue;
  requirementType: "structured" | "custom";
  correlationId: string;
  idempotencyKey: string;
};

const selectClass = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClass = "min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const formButtonClass = "transition-colors";

function requestId(): string | null {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
}

function isComplexResponse(value: unknown): value is JsonValue[] | { [key: string]: JsonValue } {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function modeForResponse(value: unknown): AnswerMode {
  if (isComplexResponse(value)) return "existing";
  if (value === null) return "none";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "text";
}

function isBoundedJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2_000;
  if (Array.isArray(value)) return value.length <= 50 && Array.from(value).every((item) => isBoundedJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) => key.length >= 1 && key.length <= 100 && isBoundedJson(item, depth + 1));
}

function responseValidationError(value: JsonValue): string | null {
  if (!isBoundedJson(value)) return "This saved answer is too complex to save again. Choose Replace answer to enter a new answer.";
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).length > 8_000) {
    return "This saved answer is too large to save again. Choose Replace answer to enter a new answer.";
  }
  return null;
}

function valueForResponse(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function safeReturnHref(value: string): string {
  if (value === "/customer") return value;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const match = new RegExp(`^/customer\\?intake=(${uuid})(?:&requirementsAfter=(${uuid}))?$`, "i").exec(value);
  if (!match) return "/customer";
  return `/customer?intake=${encodeURIComponent(match[1])}${match[2] ? `&requirementsAfter=${encodeURIComponent(match[2])}` : ""}`;
}

function buildResponse(mode: AnswerMode, value: string): { response?: JsonValue; error?: string } {
  if (mode === "existing") return { error: "Choose Replace answer before editing this saved answer." };
  if (mode === "none") return { response: null };
  if (mode === "text") {
    if (value.length > 2_000) return { error: "Answer must be 2,000 characters or less." };
    return { response: value };
  }
  if (mode === "boolean") return { response: value === "true" };
  if (!value.trim()) return { error: "Enter a number or choose No answer." };
  const number = Number(value);
  if (!Number.isFinite(number)) return { error: "Enter a valid number." };
  return { response: number };
}

type SaveRejection = "correction" | "access" | null;
function classifySaveRejection(error: unknown): SaveRejection {
  if (!(error instanceof TRPCClientError)) return null;
  const code = error.data?.code;
  if (code === "BAD_REQUEST") return "correction";
  if (code === "NOT_FOUND" || code === "FORBIDDEN" || code === "UNAUTHORIZED") return "access";
  return null;
}

export function CustomerRequirementForm({
  organizationId,
  intakeId,
  requirement,
  returnHref,
}: {
  organizationId: string;
  intakeId: string;
  requirement?: Requirement;
  returnHref: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const save = useMutation(trpc.intakes.saveRequirement.mutationOptions({ retry: false }));
  const existingResponse = requirement?.response ?? null;
  const savedPayroll = requirement?.stableKey === "input_payroll" ? payrollAnswerSchema.safeParse(existingResponse) : null;
  const [payrollTemplate, setPayrollTemplate] = useState(Boolean(savedPayroll?.success));
  const [payrollAnswer, setPayrollAnswer] = useState<PayrollAnswer>(savedPayroll?.success ? savedPayroll.data : emptyPayrollAnswer);
  const initialMode = useMemo(() => modeForResponse(existingResponse), [existingResponse]);
  const [label, setLabel] = useState(requirement?.label ?? "");
  const [importance, setImportance] = useState<"must" | "nice" | "not_applicable">(requirement?.importance ?? "must");
  const [weight, setWeight] = useState(String(requirement?.weight ?? 1));
  const [requirementType, setRequirementType] = useState<"structured" | "custom">(requirement?.requirementType ?? "custom");
  const [answerMode, setAnswerMode] = useState<AnswerMode>(requirement ? initialMode : "text");
  const [answerValue, setAnswerValue] = useState(valueForResponse(existingResponse));
  const [replacedExisting, setReplacedExisting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const attempt = useRef<SaveInput | null>(null);
  const submitting = useRef(false);
  const uncertainAttempt = useRef(false);
  const safeHref = safeReturnHref(returnHref);
  const editingComplex = Boolean(requirement && isComplexResponse(existingResponse));

  async function runSave(input: SaveInput) {
    if (submitting.current || save.isPending) return;
    submitting.current = true;
    setValidationError(null);
    try {
      await save.mutateAsync(input);
      setConfirmed(true);
      try { router.replace(safeHref); } catch { /* The confirmed view keeps the safe link available. */ }
      try { router.refresh(); } catch { /* The confirmed view keeps the safe link available. */ }
    } catch (error) {
      const rejection = classifySaveRejection(error);
      if (!uncertainAttempt.current && rejection === "correction") {
        attempt.current = null;
        setLocked(false);
        setRejected(false);
        setValidationError("The server rejected these values. Check the form and try again.");
      } else if (!uncertainAttempt.current && rejection === "access") {
        setLocked(true);
        setRejected(true);
        setValidationError(null);
      } else {
        uncertainAttempt.current = true;
        setLocked(true);
        setRejected(false);
        setValidationError(null);
      }
    } finally {
      submitting.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || save.isPending || locked || confirmed) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel.length > 200) {
      setValidationError("Add a label with 1 to 200 characters.");
      return;
    }
    const numericWeight = Number(weight);
    if (!Number.isInteger(numericWeight) || numericWeight < 1 || numericWeight > 100) {
      setValidationError("Weight must be a whole number from 1 to 100.");
      return;
    }
    const existingError = answerMode === "existing" ? responseValidationError(existingResponse) : null;
    const checkedPayroll = payrollTemplate ? payrollAnswerSchema.safeParse(payrollAnswer) : null;
    const response: { response?: JsonValue; error?: string } = checkedPayroll ? checkedPayroll.success ? { response: payrollAnswerForSave(checkedPayroll.data) } : { error: "Check the payroll answers. Use a two-letter country code or leave it blank." }
      : existingError ? { error: existingError } : answerMode === "existing" ? { response: existingResponse } : buildResponse(answerMode, answerValue);
    if (response.error || response.response === undefined) {
      setValidationError(response.error ?? "Choose an answer.");
      return;
    }
    const requirementId = requirement?.requirementId ?? requestId();
    const correlationId = requestId();
    const idempotencyKey = requestId();
    if (!requirementId || !correlationId || !idempotencyKey) {
      setValidationError("This browser cannot create a secure save request. Use an updated browser and try again.");
      return;
    }
    const stableKey = requirement?.stableKey ?? (payrollTemplate ? "input_payroll" : `need_${requirementId.replaceAll("-", "")}`);
    const input: SaveInput = {
      requirementId, organizationId, intakeId, expectedRevision: requirement?.revision ?? 0,
      stableKey, label: trimmedLabel, importance, weight: numericWeight, response: response.response,
      requirementType: payrollTemplate ? "structured" : requirementType, correlationId, idempotencyKey,
    };
    attempt.current = input;
    await runSave(input);
  }

  if (confirmed) return <section className="border-l-2 border-foreground pl-5" role="status">
    <h2 className="text-xl font-semibold">Save confirmed</h2>
    <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">The requirement is saved. Return to the requirements list to review it.</p>
    <a href={safeHref} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Return to requirements</a>
  </section>;

  return <form onSubmit={submit} aria-label={requirement ? "Edit intake requirement" : "Add intake requirement"} className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Requirement detail</p><h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight">{requirement ? "Edit this requirement" : "Add a requirement"}</h2><p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">Describe one thing the solution must support. Keep the answer clear enough for later review.</p></div>
      {requirement && <p className="font-mono text-xs tabular-nums text-muted-foreground">Revision {requirement.revision}</p>}
    </div>
    <fieldset disabled={save.isPending || locked} className="space-y-6">
      {!requirement && <label className="block space-y-2 text-sm font-medium">Start with
        <select aria-label="Requirement template" className={selectClass} value={payrollTemplate ? "payroll" : "custom"}
          onChange={event => { const payroll = event.target.value === "payroll"; setPayrollTemplate(payroll); if (payroll) setLabel("Payroll processing"); }}>
          <option value="custom">Your own requirement</option><option value="payroll">Payroll processing</option>
        </select></label>}
      <label className="block space-y-2 text-sm font-medium">Label<Input aria-label="Requirement label" value={label} maxLength={200} className="min-h-11 text-foreground" onChange={(event) => setLabel(event.target.value)} placeholder="Example: Support two payroll groups" /></label>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Importance<select aria-label="Importance" value={importance} className={selectClass} onChange={(event) => setImportance(event.target.value as typeof importance)}><option value="must">Must have</option><option value="nice">Nice to have</option><option value="not_applicable">Not applicable</option></select></label>
        {!payrollTemplate && <label className="space-y-2 text-sm font-medium">Requirement type<select aria-label="Requirement type" value={requirementType} className={selectClass} onChange={(event) => setRequirementType(event.target.value as typeof requirementType)}><option value="custom">Custom request</option><option value="structured">Standard requirement</option></select></label>}
      </div>
      <label className="block space-y-2 text-sm font-medium">Weight<span className="block text-xs font-normal leading-5 text-muted-foreground">Use a higher weight when this requirement should matter more in the review.</span><Input aria-label="Weight" inputMode="numeric" type="number" min={1} max={100} step={1} value={weight} className="min-h-11 text-foreground" onChange={(event) => setWeight(event.target.value)} /></label>
      {payrollTemplate ? <PayrollAnswerFields value={payrollAnswer} onChange={setPayrollAnswer}/> : <section className="space-y-3" aria-labelledby="answer-heading"><div><h3 id="answer-heading" className="text-sm font-semibold">Answer</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Choose a simple answer type. Existing structured answers stay unchanged until you choose to replace them.</p></div>
        {editingComplex && answerMode === "existing" ? <div className="space-y-4 rounded-lg border bg-muted/30 p-4"><p className="text-sm font-medium">Existing answer is preserved</p><div className="max-h-56 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground"><ResponseValue value={existingResponse} /></div><Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={() => { setAnswerMode("text"); setAnswerValue(""); setReplacedExisting(true); }}>Replace answer</Button></div> : <div className="space-y-3"><label className="block space-y-2 text-sm font-medium">Answer type<select aria-label="Answer type" value={answerMode} className={selectClass} onChange={(event) => setAnswerMode(event.target.value as AnswerMode)}><option value="none">No answer</option><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes or no</option></select></label>{answerMode === "text" && <textarea aria-label="Text answer" value={answerValue} maxLength={2_000} className={textareaClass} onChange={(event) => setAnswerValue(event.target.value)} placeholder="Add the answer" />}{answerMode === "number" && <Input aria-label="Number answer" inputMode="decimal" value={answerValue} className="min-h-11 text-foreground" onChange={(event) => setAnswerValue(event.target.value)} placeholder="Add a number" />}{answerMode === "boolean" && <select aria-label="Yes or no answer" value={answerValue === "true" ? "true" : "false"} className={selectClass} onChange={(event) => setAnswerValue(event.target.value)}><option value="true">Yes</option><option value="false">No</option></select>}{editingComplex && replacedExisting && <Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={() => { setAnswerMode("existing"); setAnswerValue(valueForResponse(existingResponse)); setReplacedExisting(false); }}>Keep saved answer</Button>}</div>}
      </section>}
    </fieldset>
    {save.isPending && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Saving requirement…</p>}
    {validationError && <p role="alert" className="border-l-2 border-destructive pl-5 text-sm leading-6">{validationError}</p>}
    {locked ? rejected ? <section className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"><p role="status" className="text-sm text-muted-foreground">This save was rejected. Return to the requirements list to check current access and saved values.</p><a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return to requirements</a></section> : <section className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"><p role="status" className="text-sm text-muted-foreground">We could not confirm this save. It may have succeeded. Retry the unchanged request or return to the requirements list.</p><div className="flex flex-wrap gap-3"><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { if (attempt.current) void runSave(attempt.current); }}>Retry unchanged request</Button><a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return to requirements</a></div></section> : <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">{!save.isPending && <a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return without saving</a>}<Button type="submit" className={`${formButtonClass} min-h-11`} disabled={save.isPending}>{save.isPending ? "Saving…" : requirement ? "Save changes" : "Save requirement"}</Button></div>}
  </form>;
}
