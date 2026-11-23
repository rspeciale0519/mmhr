"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { mapQuestions, sectionHelp, sectionLabels, sectionOrder, type ListSectionKey, type MapSectionKey } from "@/lib/intake-questions";
import { useTRPC } from "@/lib/trpc/client";
import type { getIntake } from "@/server/commands/intake-read";
import { buildData, readAnswers, validateData, type AnswerState, type ListSectionState } from "./intake-answers";
import { EarlierAnswers, ListSectionFields, MapQuestionField } from "./intake-question-fields";

type Intake = Awaited<ReturnType<typeof getIntake>>;
type SaveInput = {
  intakeId: string | null; organizationId: string; expectedRevision: number;
  status: "draft" | "in_progress"; data: Record<string, unknown>;
  correlationId: string; idempotencyKey: string;
};

const formButtonClass = "transition-colors";
const isMapSection = (key: string): key is MapSectionKey => key in mapQuestions;

function requestId(): string | null { return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null; }

export function CustomerIntakeForm({ organizationId, intake }: { organizationId: string; intake?: Intake }) {
  const trpc = useTRPC();
  const router = useRouter();
  const save = useMutation(trpc.intakes.saveDraft.mutationOptions({ retry: false }));
  const [state, setState] = useState<AnswerState>(() => readAnswers(intake?.data ?? {}));
  const [locked, setLocked] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [confirmedIntakeId, setConfirmedIntakeId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; input: SaveInput } | null>(null);
  const submitting = useRef(false);
  const currentStatus = intake?.status === "in_progress" ? "in_progress" : "draft";
  const editable = !intake || intake.status === "draft" || intake.status === "in_progress";

  function change(next: (value: AnswerState) => AnswerState) { setState(next); setValidationError(null); }
  function updateGuided(section: MapSectionKey, key: string, next: string) {
    change((value) => ({ ...value, maps: { ...value.maps, [section]: { ...value.maps[section],
      answers: { ...value.maps[section].answers, [key]: { ...value.maps[section].answers[key]!, value: next, touched: true } } } } }));
  }
  function updateEarlier(section: MapSectionKey, index: number, next: string | null) {
    change((value) => {
      const rows = value.maps[section].earlier;
      const earlier = next === null ? rows.filter((_, rowIndex) => rowIndex !== index) : rows.map((row, rowIndex) => rowIndex === index ? { ...row, value: next } : row);
      return { ...value, maps: { ...value.maps, [section]: { ...value.maps[section], earlier } } };
    });
  }
  function updateList(section: ListSectionKey, update: (list: ListSectionState) => ListSectionState) {
    change((value) => ({ ...value, lists: { ...value.lists, [section]: update(value.lists[section]) } }));
  }
  const replaceAt = (values: string[], index: number, next: string) => values.map((entry, position) => position === index ? next : entry);

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
    const built = buildData(state);
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

  if (saveConfirmed && confirmedIntakeId) return <section className="co-gl co-notice" role="status">
    <h2 className="text-xl font-semibold">Save confirmed</h2>
    <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">Your answers are saved. Open the saved intake to review the confirmed result.</p>
    <div className="mt-5 flex flex-wrap gap-3"><a href={`/customer?intake=${encodeURIComponent(confirmedIntakeId)}`} className="co-btn co-btn-p co-btn-s">Open saved intake</a><a href="/customer" className="co-btn co-btn-g co-btn-s">Saved intakes</a></div>
  </section>;
  if (!editable) return <section className="co-gl co-notice" role="status"><h2 className="text-xl font-semibold">This intake is no longer editable</h2><p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">This record has moved beyond the draft stage. Return to the saved intake to review it.</p></section>;

  const completeCount = sectionOrder.filter((key) => {
    if (isMapSection(key)) return Object.values(state.maps[key].answers).some((answer) => answer.value !== "");
    const list = state.lists[key];
    return list.prefixed.some(Boolean) || list.checked.length > 0 || list.other.some(Boolean);
  }).length;
  const completePct = Math.round((completeCount / sectionOrder.length) * 100);

  return <form onSubmit={(event) => submit(event, currentStatus)} aria-label="Customer software needs intake" className="co-qg">
    <div className="co-gl co-secs">
      <div className="co-pct">
        <span className="co-lbl">Complete</span>
        <div className="co-big">{completePct}%</div>
        <div className="co-meter"><i style={{ width: `${completePct}%` }} /></div>
      </div>
      <ol>
        {sectionOrder.map((key, index) => {
          const done = isMapSection(key)
            ? Object.values(state.maps[key].answers).some((answer) => answer.value !== "")
            : state.lists[key].prefixed.some(Boolean) || state.lists[key].checked.length > 0 || state.lists[key].other.some(Boolean);
          return <li key={key} className={done ? "co-done" : undefined}>
            <b>{String(index + 1).padStart(2, "0")}</b>{sectionLabels[key]}<em>{done ? "Done" : ""}</em>
          </li>;
        })}
      </ol>
    </div>
    <div>
    <div className="co-gl co-qmain">
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6"><div><p className="co-lbl">Needs list</p><h2>Describe what your team needs</h2><p className="co-ps" style={{ marginTop: 12 }}>Save a draft now. You can return later and continue where you stopped.</p></div><p className="co-lbl">{intake ? `Revision ${intake.revision}` : "New intake"}</p></div>
    <fieldset disabled={save.isPending || locked} className="space-y-10">
      {sectionOrder.map((key) => <section key={key} aria-labelledby={`${key}-heading`} className="grid gap-5 border-b pb-8">
        <div><h3 id={`${key}-heading`} className="text-base font-semibold">{sectionLabels[key]}</h3><p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">{sectionHelp[key]}</p></div>
        {isMapSection(key) ? <div className="flex min-w-0 flex-col gap-5">
          {mapQuestions[key].map((question) => <MapQuestionField key={question.key} section={key} question={question}
            answer={state.maps[key].answers[question.key]!} onChange={(next) => updateGuided(key, question.key, next)} />)}
          <EarlierAnswers section={key} rows={state.maps[key].earlier} onChange={(index, next) => updateEarlier(key, index, next)} onRemove={(index) => updateEarlier(key, index, null)} />
        </div> : <ListSectionFields section={key} state={state.lists[key]}
          onPrefix={(index, next) => updateList(key, (list) => ({ ...list, prefixed: replaceAt(list.prefixed, index, next) }))}
          onToggle={(option, on) => updateList(key, (list) => ({ ...list, checked: on ? [...list.checked, option] : list.checked.filter((entry) => entry !== option) }))}
          onOther={(index, next) => updateList(key, (list) => ({ ...list, other: replaceAt(list.other, index, next) }))}
          onAddOther={() => updateList(key, (list) => ({ ...list, other: [...list.other, ""] }))}
          onRemoveOther={(index) => updateList(key, (list) => ({ ...list, other: list.other.filter((_, position) => position !== index) }))} />}
      </section>)}
    </fieldset>
    {save.isPending && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Saving your answers…</p>}
    {(validationError || save.isError) && <section role="alert" className="co-status text-sm leading-6"><p className="font-medium">{validationError ?? "This save was not confirmed."}</p>{save.isError && !validationError && <p className="mt-1 text-muted-foreground">Retry the unchanged request. Editing stays paused until the save is confirmed.</p>}</section>}
    {locked ? <section className="co-qfoot"><p role="status" className="text-sm text-muted-foreground">We could not confirm this save. Your answers stay on screen.</p><div className="flex flex-wrap gap-3"><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { const pendingAttempt = attempt.current; if (pendingAttempt) void runSave(pendingAttempt.input); }}>Retry unchanged request</Button><a href="/customer" className="co-btn co-btn-g co-btn-s">Saved intakes</a></div></section> : <div className="co-qfoot"><Button type="submit" variant="outline" className={`${formButtonClass} min-h-11`} disabled={save.isPending || currentStatus === "in_progress"}>{save.isPending ? "Saving…" : "Save draft"}</Button><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { void submit({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, "in_progress"); }}>{save.isPending ? "Saving…" : currentStatus === "in_progress" ? "Save changes" : "Save and continue"}</Button></div>}
    </div>
    </div>
    <div>
      <div className="co-gl co-live">
        <span className="co-lbl">After you submit</span>
        <div className="co-big" style={{ fontSize: 48 }}>Fit</div>
        <p style={{ fontSize: 14, color: "var(--co-ink2)", marginTop: 8 }}>Matches appear after MMHR publishes a comparison. Rankings ignore referral fees.</p>
      </div>
      <div className="co-gl co-side-note"><b>Names stay masked</b><p>You see every match on fit first. Names unlock when you review these answers with an advisor.</p></div>
      <div className="co-gl co-side-note"><b>Free, with no catch</b><p>Providers pay MMHR a referral fee. It never changes your rankings.</p></div>
    </div>
  </form>;
}
