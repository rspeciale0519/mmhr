"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";
import type { getIntake } from "@/server/commands/intake-read";

type Intake = Awaited<ReturnType<typeof getIntake>>;
type Scalar = string | number | boolean;
type MapKind = "string" | "number" | "boolean";
type MapRow = { key: string; value: string; kind: MapKind };
type SectionKey = "companyContext" | "currentSystems" | "complianceNeeds" | "budget" | "timeline" | "stakeholders" | "decisionProcess";
type MapKey = "companyContext" | "budget" | "timeline" | "decisionProcess";
type ListKey = "currentSystems" | "complianceNeeds" | "stakeholders";
type FormState = {
  companyContext: MapRow[]; currentSystems: string[]; complianceNeeds: string[];
  budget: MapRow[]; timeline: MapRow[]; stakeholders: string[]; decisionProcess: MapRow[];
};
type Presence = Record<SectionKey, boolean>;
type SaveInput = {
  intakeId: string | null; organizationId: string; expectedRevision: number;
  status: "draft" | "in_progress"; data: Record<string, unknown>;
  correlationId: string; idempotencyKey: string;
};

const mapKeys: MapKey[] = ["companyContext", "budget", "timeline", "decisionProcess"];
const listKeys: ListKey[] = ["currentSystems", "complianceNeeds", "stakeholders"];
const sectionLabels: Record<SectionKey, string> = {
  companyContext: "Company context", currentSystems: "Current systems", complianceNeeds: "Compliance needs",
  budget: "Budget", timeline: "Timeline", stakeholders: "Stakeholders", decisionProcess: "Decision process",
};
const sectionHelp: Record<SectionKey, string> = {
  companyContext: "Tell us about the company and the work this search should support.",
  currentSystems: "List the systems your team uses today.",
  complianceNeeds: "List compliance, privacy, or security needs.",
  budget: "Add budget details such as range, currency, or timing.",
  timeline: "Add important dates, milestones, or launch timing.",
  stakeholders: "List the people or teams involved in the decision.",
  decisionProcess: "Explain how your team will compare and choose options.",
};
const selectClass = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClass = "min-h-28 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const formButtonClass = "transition-colors";

function newRow(): MapRow { return { key: "", value: "", kind: "string" }; }
function valueKind(value: Scalar): MapKind { return typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string"; }
function rowFromEntry([key, value]: [string, Scalar]): MapRow { return { key, value: String(value), kind: valueKind(value) }; }
function mapRows(value: Record<string, Scalar> | undefined): MapRow[] { return value ? Object.entries(value).map(rowFromEntry) : [newRow()]; }
function listValues(value: string[] | undefined): string[] { return value ? [...value] : [""]; }
function makePresence(data: Intake["data"]): Presence {
  return Object.fromEntries((Object.keys(sectionLabels) as SectionKey[]).map((key) => [key, Object.prototype.hasOwnProperty.call(data, key)])) as Presence;
}
function makeState(data: Intake["data"]): FormState {
  return {
    companyContext: mapRows(data.companyContext), currentSystems: listValues(data.currentSystems), complianceNeeds: listValues(data.complianceNeeds),
    budget: mapRows(data.budget), timeline: mapRows(data.timeline), stakeholders: listValues(data.stakeholders), decisionProcess: mapRows(data.decisionProcess),
  };
}
function scalarValue(row: MapRow): Scalar { return row.kind === "boolean" ? row.value === "true" : row.kind === "number" ? Number(row.value) : row.value; }
function buildData(state: FormState, presence: Presence): { data?: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};
  for (const key of mapKeys) {
    const entries: Array<[string, Scalar]> = [];
    const seenKeys = new Set<string>();
    for (const row of state[key]) {
      if (!row.key && !row.value) continue;
      if (!row.key.trim()) return { error: `${sectionLabels[key]} needs a label for each answer.` };
      const normalizedKey = row.key.trim();
      if (seenKeys.has(normalizedKey)) return { error: `${sectionLabels[key]} cannot contain duplicate labels.` };
      seenKeys.add(normalizedKey);
      if (row.kind === "number" && (!row.value.trim() || !Number.isFinite(scalarValue(row)))) return { error: `${sectionLabels[key]} has an invalid number.` };
      entries.push([row.key, scalarValue(row)]);
    }
    if (presence[key] || entries.length > 0) data[key] = Object.fromEntries(entries);
  }
  for (const key of listKeys) {
    const values = state[key].filter((value) => value !== "");
    if (presence[key] || values.length > 0) data[key] = values;
  }
  return { data };
}
function validateData(data: Record<string, unknown>): string | null {
  for (const key of mapKeys) {
    const map = data[key] as Record<string, Scalar> | undefined;
    if (!map) continue;
    if (Object.keys(map).length > 50) return `${sectionLabels[key]} can contain at most 50 answers.`;
    for (const [label, value] of Object.entries(map)) {
      if (label.trim().length < 1 || label.trim().length > 100) return `${sectionLabels[key]} labels must be 1 to 100 characters.`;
      if (typeof value === "string" && value.length > 2_000) return `${sectionLabels[key]} answers must be 2,000 characters or less.`;
      if (typeof value === "number" && !Number.isFinite(value)) return `${sectionLabels[key]} contains an invalid number.`;
    }
  }
  for (const key of listKeys) {
    const values = data[key] as string[] | undefined;
    if (!values) continue;
    const limit = key === "stakeholders" ? 100 : 50;
    if (values.length > limit) return `${sectionLabels[key]} can contain at most ${limit} answers.`;
    if (values.some((value) => value.trim().length < 1 || value.trim().length > 200)) return `${sectionLabels[key]} answers must be 1 to 200 characters.`;
  }
  return new TextEncoder().encode(JSON.stringify(data)).length > 90_000 ? "Your answers are too large to save. Remove some detail and try again." : null;
}
function requestId(): string | null { return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null; }

function ListEditor({ section, values, onChange, onAdd, onRemove }: {
  section: ListKey; values: string[]; onChange: (index: number, value: string) => void; onAdd: () => void; onRemove: (index: number) => void;
}) {
  const label = sectionLabels[section];
  return <div className="space-y-3">
    {values.map((value, index) => <div key={`${section}-${index}`} className="flex items-end gap-2">
      <label className="flex-1 space-y-1 text-xs font-medium text-muted-foreground"><span>{label} answer {index + 1}</span><Input aria-label={`${label} answer ${index + 1}`} value={value} maxLength={200} className="min-h-11 text-foreground" onChange={(event) => onChange(index, event.target.value)} /></label>
      <Button type="button" variant="outline" className={`${formButtonClass} min-h-11 min-w-11 px-3`} aria-label={`Remove ${label} answer ${index + 1}`} onClick={() => onRemove(index)}>Remove</Button>
    </div>)}
    <Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={onAdd}>Add answer</Button>
  </div>;
}

function MapEditor({ section, rows, onChange, onAdd, onRemove }: {
  section: MapKey; rows: MapRow[]; onChange: (index: number, patch: Partial<MapRow>) => void; onAdd: () => void; onRemove: (index: number) => void;
}) {
  const label = sectionLabels[section];
  return <div className="space-y-3">
    {rows.map((row, index) => <div key={`${section}-${index}`} className="grid gap-3 sm:grid-cols-2 sm:items-start">
      <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Label</span><Input aria-label={`${label} label ${index + 1}`} placeholder="Label" value={row.key} maxLength={100} className="min-h-11 text-foreground" onChange={(event) => onChange(index, { key: event.target.value })} /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Answer</span>{row.kind === "boolean" ? <select aria-label={`${label} answer ${index + 1}`} value={row.value === "true" ? "true" : "false"} className={selectClass} onChange={(event) => onChange(index, { value: event.target.value })}><option value="true">Yes</option><option value="false">No</option></select> : row.kind === "number" ? <Input aria-label={`${label} answer ${index + 1}`} inputMode="decimal" placeholder="Answer" value={row.value} maxLength={2_000} className="min-h-11 text-foreground" onChange={(event) => onChange(index, { value: event.target.value })} /> : <textarea aria-label={`${label} answer ${index + 1}`} placeholder="Answer" value={row.value} maxLength={2_000} className={textareaClass} onChange={(event) => onChange(index, { value: event.target.value })} />}</label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>Answer type</span><select aria-label={`${label} answer type ${index + 1}`} value={row.kind} className={selectClass} onChange={(event) => onChange(index, { kind: event.target.value as MapKind })}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Yes or no</option></select></label>
      <Button type="button" variant="outline" className={`${formButtonClass} min-h-11 px-3 sm:self-end sm:justify-self-start`} aria-label={`Remove ${label} answer ${index + 1}`} onClick={() => onRemove(index)}>Remove</Button>
    </div>)}
    <Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={onAdd}>Add answer</Button>
  </div>;
}

export function CustomerIntakeForm({ organizationId, intake }: { organizationId: string; intake?: Intake }) {
  const trpc = useTRPC();
  const router = useRouter();
  const save = useMutation(trpc.intakes.saveDraft.mutationOptions({ retry: false }));
  const initialData = intake?.data ?? {};
  const [state, setState] = useState<FormState>(() => makeState(initialData));
  const [presence, setPresence] = useState<Presence>(() => makePresence(initialData));
  const [locked, setLocked] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [confirmedIntakeId, setConfirmedIntakeId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; input: SaveInput } | null>(null);
  const submitting = useRef(false);
  const currentStatus = intake?.status === "in_progress" ? "in_progress" : "draft";
  const editable = !intake || intake.status === "draft" || intake.status === "in_progress";

  function markPresent(key: SectionKey) { setPresence((value) => ({ ...value, [key]: true })); setValidationError(null); }
  function updateMap(key: MapKey, index: number, patch: Partial<MapRow>) { markPresent(key); setState((value) => ({ ...value, [key]: value[key].map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) })); }
  function updateList(key: ListKey, index: number, next: string) { markPresent(key); setState((value) => ({ ...value, [key]: value[key].map((entry, rowIndex) => rowIndex === index ? next : entry) })); }
  function addMap(key: MapKey) { markPresent(key); setState((value) => ({ ...value, [key]: [...value[key], newRow()] })); }
  function addList(key: ListKey) { markPresent(key); setState((value) => ({ ...value, [key]: [...value[key], ""] })); }
  function removeMap(key: MapKey, index: number) { markPresent(key); setState((value) => ({ ...value, [key]: value[key].filter((_, rowIndex) => rowIndex !== index) })); }
  function removeList(key: ListKey, index: number) { markPresent(key); setState((value) => ({ ...value, [key]: value[key].filter((_, rowIndex) => rowIndex !== index) })); }

  async function runSave(input: SaveInput) {
    if (submitting.current || save.isPending) return;
    submitting.current = true; setValidationError(null);
    let result: Awaited<ReturnType<typeof save.mutateAsync>>;
    try { result = await save.mutateAsync(input); } catch {
      setLocked(true); submitting.current = false; return;
    }
    setConfirmedIntakeId(result.intakeId); setSaveConfirmed(true);
    try { router.replace(`/customer?intake=${encodeURIComponent(result.intakeId)}`); router.refresh(); }
    catch { /* The confirmed-save view provides a safe link when navigation fails. */ }
    finally { submitting.current = false; }
  }
  async function submit(event: FormEvent<HTMLFormElement>, status: "draft" | "in_progress") {
    event.preventDefault();
    if (submitting.current || save.isPending || locked || saveConfirmed || !editable) return;
    const built = buildData(state, presence);
    if (!built.data) { setValidationError(built.error ?? "Check your answers and try again."); return; }
    const localError = validateData(built.data);
    if (localError) { setValidationError(localError); return; }
    const correlationId = requestId(); const idempotencyKey = requestId();
    if (!correlationId || !idempotencyKey) { setValidationError("This browser cannot create a secure save request. Use an updated browser and try again."); return; }
    const input: SaveInput = { intakeId: intake?.intakeId ?? null, organizationId, expectedRevision: intake?.revision ?? 0, status, data: built.data, correlationId, idempotencyKey };
    const fingerprint = JSON.stringify({ ...input, correlationId: undefined, idempotencyKey: undefined });
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, input };
    await runSave(attempt.current.input);
  }

  if (saveConfirmed && confirmedIntakeId) return <section className="border-l-2 border-foreground pl-5" role="status">
    <h2 className="text-xl font-semibold">Save confirmed</h2>
    <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">Your answers are saved. Open the saved intake to review the confirmed result.</p>
    <div className="mt-5 flex flex-wrap gap-3"><a href={`/customer?intake=${encodeURIComponent(confirmedIntakeId)}`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Open saved intake</a><a href="/customer" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold">Saved intakes</a></div>
  </section>;
  if (!editable) return <section className="border-l-2 border-foreground pl-5" role="status"><h2 className="text-xl font-semibold">This intake is no longer editable</h2><p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">This record has moved beyond the draft stage. Return to the saved intake to review it.</p></section>;

  return <form onSubmit={(event) => submit(event, currentStatus)} aria-label="Customer software needs intake" className="space-y-10">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Working worksheet</p><h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight">Describe what your team needs</h2><p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">Save a draft now. You can return later and continue where you stopped.</p></div><p className="font-mono text-xs tabular-nums text-muted-foreground">{intake ? `Revision ${intake.revision}` : "New intake"}</p></div>
    <fieldset disabled={save.isPending || locked} className="space-y-10">
      {(["companyContext", "currentSystems", "complianceNeeds", "budget", "timeline", "stakeholders", "decisionProcess"] as SectionKey[]).map((key) => {
        const isList = listKeys.includes(key as ListKey);
        return <section key={key} aria-labelledby={`${key}-heading`} className="grid gap-5 border-b pb-8 sm:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)] sm:gap-10"><div><h3 id={`${key}-heading`} className="text-base font-semibold">{sectionLabels[key]}</h3><p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">{sectionHelp[key]}</p></div>{isList ? <ListEditor section={key as ListKey} values={state[key as ListKey]} onChange={(index, value) => updateList(key as ListKey, index, value)} onAdd={() => addList(key as ListKey)} onRemove={(index) => removeList(key as ListKey, index)} /> : <MapEditor section={key as MapKey} rows={state[key as MapKey]} onChange={(index, patch) => updateMap(key as MapKey, index, patch)} onAdd={() => addMap(key as MapKey)} onRemove={(index) => removeMap(key as MapKey, index)} />}</section>;
      })}
    </fieldset>
    {save.isPending && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Saving your answers…</p>}
    {(validationError || save.isError) && <section role="alert" className="border-l-2 border-destructive pl-5 text-sm leading-6"><p className="font-medium">{validationError ?? "This save was not confirmed."}</p>{save.isError && !validationError && <p className="mt-1 text-muted-foreground">Retry the unchanged request. Editing stays paused until the save is confirmed.</p>}</section>}
    {locked ? <section className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"><p role="status" className="text-sm text-muted-foreground">We could not confirm this save. Your answers stay on screen.</p><div className="flex flex-wrap gap-3"><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { const pendingAttempt = attempt.current; if (pendingAttempt) void runSave(pendingAttempt.input); }}>Retry unchanged request</Button><a href="/customer" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold">Saved intakes</a></div></section> : <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6"><Button type="submit" variant="outline" className={`${formButtonClass} min-h-11`} disabled={save.isPending || currentStatus === "in_progress"}>{save.isPending ? "Saving…" : "Save draft"}</Button><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { void submit({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, "in_progress"); }}>{save.isPending ? "Saving…" : currentStatus === "in_progress" ? "Save changes" : "Save and continue"}</Button></div>}
  </form>;
}
