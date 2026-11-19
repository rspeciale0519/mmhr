"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RFP_ANSWER_CHOICES, RFP_REQUESTED_DOCUMENTS, type RfpQuestion, type RfpTab } from "@/lib/rfp-form-library";
import { CLIENT_OVERVIEW_FIELDS, RFP_UPLOAD_MAX_BYTES, RFP_UPLOAD_MAX_FILES, type RfpAnswer, type RfpAnswers } from "@/lib/rfp-vendor-form";
import type { PublicRfpForm } from "@/server/commands/rfp-vendor-form-public";
import { removeRfpFileAction, saveRfpAnswersAction, submitRfpFormAction } from "./actions";

/**
 * The vendor's RFP web form.
 *
 * It is one page with a list of sections on the left: an overview, one
 * section for each topic, a documents section, and a final review section.
 * Answers save by themselves a moment after each change ("autosave"), so the
 * vendor can close the page and come back to the same link later.
 */

type Props = { token: string; form: PublicRfpForm; tabs: RfpTab[]; brandName: string };

/** What the small save indicator in the header shows. */
type SaveStatus = "idle" | "saving" | "saved" | "error" | "locked";

/** An unanswered question looks like this. */
const emptyAnswer: RfpAnswer = { answer: null, comment: null };

/** Wait this long after the last change before saving (in milliseconds). */
const AUTOSAVE_DELAY_MS = 800;

/** Returns only the real questions of a tab (headings are skipped). */
function questionsOf(tab: RfpTab): RfpQuestion[] {
  return tab.items.filter((item): item is RfpQuestion => item.kind === "question");
}

/** Writes a date in plain words, e.g. "December 2, 2026". */
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(value));
}

/** Writes a file size in plain words, e.g. "1.2 MB". */
function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Shared look for text boxes, so every input matches.
const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted";
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const quietButton = "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function VendorRfpForm({ token, form, tabs, brandName }: Props) {
  const router = useRouter();
  const editable = form.editable;

  // The answers shown on screen. They start as the answers saved earlier.
  const [answers, setAnswers] = useState<RfpAnswers>(form.answers);
  // Which section is open. "overview" is the first one.
  const [section, setSection] = useState("overview");
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Refs hold values that must survive between renders without redrawing.
  const pending = useRef<RfpAnswers>({}); // changed answers not yet saved
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false); // true while a save request is running

  /** Sends every unsaved answer to the server. Returns true when all are saved. */
  async function flush(): Promise<boolean> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // If a save is already running, it will pick up new changes when it ends.
    if (saving.current) return false;
    while (Object.keys(pending.current).length > 0) {
      const batch = pending.current;
      pending.current = {};
      saving.current = true;
      setStatus("saving");
      let result: Awaited<ReturnType<typeof saveRfpAnswersAction>>;
      try { result = await saveRfpAnswersAction(token, batch); } catch { result = { ok: false, reason: "unavailable" }; }
      saving.current = false;
      if (!result.ok) {
        if (result.reason === "locked") { setStatus("locked"); return false; }
        // Put the failed answers back so the next try sends them again.
        pending.current = { ...batch, ...pending.current };
        setStatus("error");
        return false;
      }
    }
    setStatus("saved");
    return true;
  }

  /** Changes one answer on screen and schedules a save. */
  function update(key: string, patch: Partial<RfpAnswer>) {
    if (!editable) return;
    const next = { ...(answers[key] ?? emptyAnswer), ...patch };
    setAnswers((current) => ({ ...current, [key]: next }));
    pending.current[key] = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_DELAY_MS);
  }

  // Warn before the page closes while something is still unsaved.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (saving.current || Object.keys(pending.current).length > 0) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Count answered questions for each tab and overall, for the progress display.
  const progress = useMemo(() => {
    const perTab = tabs.map((tab) => {
      const questions = questionsOf(tab);
      return { key: tab.key, total: questions.length, done: questions.filter((q) => answers[q.key]?.answer).length };
    });
    return { perTab, total: perTab.reduce((sum, tab) => sum + tab.total, 0), done: perTab.reduce((sum, tab) => sum + tab.done, 0) };
  }, [tabs, answers]);

  // The ordered list of sections, used by the menu and the Next/Back buttons.
  const sections = [
    { key: "overview", label: "Overview", count: null as string | null },
    ...tabs.map((tab, index) => ({ key: tab.key, label: tab.title, count: `${progress.perTab[index].done}/${progress.perTab[index].total}` })),
    { key: "documents", label: "Documents", count: form.files.length > 0 ? String(form.files.length) : null },
    { key: "submit", label: editable ? "Review and submit" : "Submission", count: null },
  ];
  const position = sections.findIndex((item) => item.key === section);

  /** Opens a section and scrolls back to the top of the page. */
  function open(key: string) {
    setSection(key);
    window.scrollTo({ top: 0 });
  }

  const activeTab = tabs.find((tab) => tab.key === section);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      {/* Header: stays at the top while the vendor scrolls. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{brandName} · Request for proposal</p>
            <h1 className="truncate text-lg font-semibold">{form.rfpTitle}</h1>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <SaveIndicator status={status} editable={editable} onRetry={() => { void flush(); }} />
            <p><span className="text-muted-foreground">Due </span><span className="font-semibold">{formatDate(form.dueAt)}</span></p>
          </div>
        </div>
        {/* Progress bar: fills as questions are answered. */}
        <div className="h-1 w-full bg-muted" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="h-1 bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10 lg:py-10">
        {/* Section menu. A dropdown on phones, a side list on larger screens. */}
        <nav aria-label="Form sections" className="lg:w-64 lg:shrink-0">
          <label className="block lg:hidden">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section</span>
            <select className={inputClass} value={section} onChange={(event) => open(event.target.value)}>
              {sections.map((item) => <option key={item.key} value={item.key}>{item.label}{item.count ? ` (${item.count})` : ""}</option>)}
            </select>
          </label>
          <ul className="sticky top-28 hidden space-y-1 lg:block">
            {sections.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => open(item.key)} aria-current={item.key === section ? "step" : undefined}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.key === section ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}>
                  <span>{item.label}</span>
                  {item.count && <span className={`text-xs tabular-nums ${item.key === section ? "" : "text-muted-foreground"}`}>{item.count}</span>}
                </button>
              </li>
            ))}
            <li className="px-3 pt-4 text-xs text-muted-foreground">{progress.done} of {progress.total} questions answered</li>
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-6">
          {!editable && <LockedNotice form={form} brandName={brandName} />}

          {section === "overview" && <Overview form={form} brandName={brandName} total={progress.total} />}

          {activeTab && (
            <section className="rounded-lg border border-border bg-background" aria-labelledby="tab-heading">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h2 id="tab-heading" className="text-xl font-semibold">{activeTab.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">For each item, tell us whether your system can handle it. Add a comment where it helps.</p>
              </div>
              <ul className="divide-y divide-border">
                {activeTab.items.map((item, index) => item.kind === "heading"
                  ? <li key={`heading-${index}`} className="bg-muted/60 px-5 py-2 text-sm font-semibold sm:px-6">{item.text}</li>
                  : <QuestionRow key={item.key} question={item} value={answers[item.key] ?? emptyAnswer} disabled={!editable} onChange={(patch) => update(item.key, patch)} />)}
              </ul>
            </section>
          )}

          {section === "documents" && <Documents token={token} form={form} editable={editable} beforeChange={flush} onChanged={() => router.refresh()} />}

          {section === "submit" && <Submit token={token} form={form} progress={progress} tabs={tabs} editable={editable}
            flush={flush} onOpen={open} onSubmitted={() => router.refresh()} />}

          {/* Back and Next move through the sections in order. */}
          <div className="flex items-center justify-between gap-4">
            <button type="button" className={quietButton} disabled={position <= 0} onClick={() => open(sections[position - 1].key)}>Back</button>
            {position < sections.length - 1 && <button type="button" className={primaryButton} onClick={() => open(sections[position + 1].key)}>Next: {sections[position + 1].label}</button>}
          </div>
        </main>
      </div>
    </div>
  );
}

/** The small "Saved" message in the header. */
function SaveIndicator({ status, editable, onRetry }: { status: SaveStatus; editable: boolean; onRetry: () => void }) {
  if (!editable) return null;
  if (status === "error") {
    return <p role="alert" className="text-destructive">Not saved. <button type="button" className="font-semibold underline" onClick={onRetry}>Try again</button></p>;
  }
  const text = status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : status === "locked" ? "This form is closed" : "Answers save automatically";
  // aria-live makes screen readers announce the change politely.
  return <p aria-live="polite" className="text-muted-foreground">{text}</p>;
}

/** Explains why a form can be read but not changed. */
function LockedNotice({ form, brandName }: { form: PublicRfpForm; brandName: string }) {
  const message = form.state === "submitted"
    ? `Your response was submitted${form.submittedAt ? ` on ${formatDate(form.submittedAt)}` : ""}. Thank you. You can still read your answers here.`
    : form.state === "sent"
      ? `The due date for this request has passed, so answers can no longer be changed.`
      : `This request is closed, so answers can no longer be changed.`;
  return (
    <div role="status" className="rounded-lg border border-border bg-background px-5 py-4 text-sm leading-6 sm:px-6">
      <p className="font-semibold">{message}</p>
      <p className="text-muted-foreground">To change your response, reply to the email you received and the {brandName} team will reopen the form.</p>
    </div>
  );
}

/** First section: who the client is, the introduction, and how to respond. */
function Overview({ form, brandName, total }: { form: PublicRfpForm; brandName: string; total: number }) {
  const rows = CLIENT_OVERVIEW_FIELDS.filter((field) => field.key !== "timeline" && form.clientOverview[field.key]);
  return (
    <>
      <section className="rounded-lg border border-border bg-background" aria-labelledby="client-heading">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 id="client-heading" className="text-xl font-semibold">Client overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Prepared for {form.vendorName}.</p>
        </div>
        <dl className="divide-y divide-border">
          {rows.map((field) => (
            <div key={field.key} className="grid gap-1 px-5 py-3 sm:grid-cols-[16rem_1fr] sm:gap-6 sm:px-6">
              <dt className="text-sm text-muted-foreground">{field.label}</dt>
              <dd className="whitespace-pre-wrap text-sm font-medium [overflow-wrap:anywhere]">{form.clientOverview[field.key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-background px-5 py-5 sm:px-6" aria-labelledby="intro-heading">
        <h2 id="intro-heading" className="text-xl font-semibold">Introduction and instructions</h2>
        <div className="mt-3 max-w-prose whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{form.rfpIntroduction}</div>
        {form.clientOverview.timeline && <>
          <h3 className="mt-6 text-base font-semibold">Timeline and key dates</h3>
          <div className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{form.clientOverview.timeline}</div>
        </>}
      </section>

      <section className="rounded-lg border border-border bg-background px-5 py-5 sm:px-6" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-xl font-semibold">How to respond</h2>
        <ol className="mt-3 max-w-prose list-decimal space-y-2 pl-5 text-sm leading-7">
          <li>Answer the {total} questions in each section. Choose Yes, No, N/A, or Within 12 months, and add a comment where it helps.</li>
          <li>Upload the requested documents in the Documents section.</li>
          <li>Open Review and submit, then submit by <strong>{formatDate(form.dueAt)}</strong>.</li>
        </ol>
        <p className="mt-4 max-w-prose text-sm leading-7 text-muted-foreground">
          Your answers save automatically. You can close this page and return to the same link at any time before the due date.
          Send all questions about this request to {brandName} by replying to the email you received.
        </p>
      </section>
    </>
  );
}

/** One question: its text, four answer buttons, and an optional comment. */
function QuestionRow({ question, value, disabled, onChange }: {
  question: RfpQuestion; value: RfpAnswer; disabled: boolean; onChange: (patch: Partial<RfpAnswer>) => void;
}) {
  // The comment box is hidden until asked for, unless a comment exists.
  const [showComment, setShowComment] = useState(Boolean(value.comment));
  return (
    <li className={`px-5 py-4 sm:px-6 ${question.indent ? "sm:pl-12" : ""}`}>
      <fieldset disabled={disabled} className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-6">
        {/* The legend is the question. Screen readers read it with each choice. */}
        <legend className="float-left w-full text-sm leading-6 lg:w-auto">{question.text}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {RFP_ANSWER_CHOICES.map((choice) => (
            <label key={choice.value} className="cursor-pointer has-disabled:cursor-not-allowed">
              {/* The real radio button is visually hidden; the styled span shows its state. */}
              <input type="radio" name={question.key} value={choice.value} checked={value.answer === choice.value}
                onChange={() => onChange({ answer: choice.value })} className="peer sr-only" />
              <span className="inline-flex min-h-9 items-center rounded-md border border-border bg-background px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:font-semibold peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-60 hover:bg-muted peer-checked:hover:bg-primary">
                {choice.label}
              </span>
            </label>
          ))}
          {!showComment && !disabled && (
            <button type="button" className="min-h-9 px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setShowComment(true)}>Add comment</button>
          )}
        </div>
        {showComment && (
          <label className="lg:col-span-2">
            <span className="sr-only">Comment for: {question.text}</span>
            <textarea rows={2} maxLength={2000} placeholder="Comment (optional)" className={inputClass}
              value={value.comment ?? ""} onChange={(event) => onChange({ comment: event.target.value })} />
          </label>
        )}
      </fieldset>
    </li>
  );
}

/** Documents section: one upload row per requested document, plus "other". */
function Documents({ token, form, editable, beforeChange, onChanged }: {
  token: string; form: PublicRfpForm; editable: boolean; beforeChange: () => Promise<boolean>; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null); // which row is uploading
  const [error, setError] = useState<string | null>(null);
  const full = form.files.length >= RFP_UPLOAD_MAX_FILES;
  const rows = [...RFP_REQUESTED_DOCUMENTS, { key: "other", label: "Other supporting documents" }];

  /** Uploads one chosen file for one row. */
  async function upload(documentKey: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > RFP_UPLOAD_MAX_BYTES) { setError(`"${file.name}" is larger than 4 MB. Please upload a smaller file.`); return; }
    setBusy(documentKey);
    await beforeChange(); // save answers first, because the page reloads its data after
    const body = new FormData();
    body.set("documentKey", documentKey);
    body.set("file", file);
    try {
      const response = await fetch(`/rfp/${token}/files`, { method: "POST", body });
      if (response.ok) onChanged();
      else if (response.status === 413) setError(`"${file.name}" is larger than 4 MB. Please upload a smaller file.`);
      else if (response.status === 400) setError(`"${file.name}" could not be accepted. Upload a PDF, Word, Excel, PowerPoint, PNG, or JPG file.`);
      else if (response.status === 409) setError("This form is closed or already has the maximum number of files.");
      else setError("The upload did not finish. Please try again.");
    } catch {
      setError("The upload did not finish. Check your connection and try again.");
    }
    setBusy(null);
  }

  /** Removes one uploaded file. */
  async function remove(fileId: string) {
    setError(null);
    setBusy(fileId);
    await beforeChange();
    const result = await removeRfpFileAction(token, fileId).catch(() => ({ ok: false as const }));
    if (result.ok) onChanged(); else setError("The file could not be removed. Please try again.");
    setBusy(null);
  }

  return (
    <section className="rounded-lg border border-border bg-background" aria-labelledby="documents-heading">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 id="documents-heading" className="text-xl font-semibold">Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload each requested document. PDF, Word, Excel, PowerPoint, PNG, or JPG, up to 4 MB each.</p>
      </div>
      {error && <p role="alert" className="border-b border-border px-5 py-3 text-sm text-destructive sm:px-6">{error}</p>}
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const files = form.files.filter((file) => file.documentKey === row.key);
          return (
            <li key={row.key} className="space-y-3 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">{row.label}</p>
                {editable && (
                  <label className={`${quietButton} cursor-pointer ${busy !== null || full ? "pointer-events-none opacity-50" : ""}`}>
                    {busy === row.key ? "Uploading…" : "Upload file"}
                    <input type="file" className="sr-only" disabled={busy !== null || full}
                      accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(row.key, file); }} />
                  </label>
                )}
              </div>
              {files.length === 0
                ? <p className="text-sm text-muted-foreground">No file uploaded yet.</p>
                : <ul className="space-y-2">{files.map((file) => (
                    <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
                      <span className="[overflow-wrap:anywhere]">{file.fileName} <span className="text-muted-foreground">· {formatSize(file.byteSize)}</span></span>
                      {editable && <button type="button" className="min-h-9 text-sm underline underline-offset-4 disabled:opacity-50" disabled={busy !== null} onClick={() => { void remove(file.fileId); }}>{busy === file.fileId ? "Removing…" : "Remove"}</button>}
                    </li>
                  ))}</ul>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Last section: shows what is left, then collects a name and submits. */
function Submit({ token, form, progress, tabs, editable, flush, onOpen, onSubmitted }: {
  token: string; form: PublicRfpForm;
  progress: { perTab: { key: string; total: number; done: number }[]; total: number; done: number };
  tabs: RfpTab[]; editable: boolean; flush: () => Promise<boolean>; onOpen: (key: string) => void; onSubmitted: () => void;
}) {
  const [name, setName] = useState(form.respondentName ?? "");
  const [email, setEmail] = useState(form.respondentEmail ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unfinished = progress.perTab.filter((tab) => tab.done < tab.total);
  const missingDocuments = RFP_REQUESTED_DOCUMENTS.filter((doc) => !form.files.some((file) => file.documentKey === doc.key));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    // Make sure the latest answers are saved before the form locks.
    // The first try can return false only because another save was still
    // running, so try once more before giving up.
    const saved = (await flush()) || (await flush());
    if (!saved) { setError("Some answers are not saved yet. Check your connection and try again."); setBusy(false); return; }
    const result = await submitRfpFormAction(token, { name, email }).catch(() => ({ ok: false as const, reason: "unavailable" as const }));
    if (result.ok) { onSubmitted(); return; }
    setError(result.reason === "invalid" ? "Enter your name and a valid email address."
      : result.reason === "locked" ? "This form is closed and can no longer be submitted."
      : "We could not submit your response. Please try again.");
    setBusy(false);
  }

  return (
    <section className="rounded-lg border border-border bg-background" aria-labelledby="submit-heading">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 id="submit-heading" className="text-xl font-semibold">{editable ? "Review and submit" : "Submission"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{progress.done} of {progress.total} questions answered · {form.files.length} document{form.files.length === 1 ? "" : "s"} uploaded</p>
      </div>
      <div className="space-y-6 px-5 py-5 sm:px-6">
        {unfinished.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">Sections with unanswered questions</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {unfinished.map((tab) => (
                <li key={tab.key}>
                  <button type="button" className="underline underline-offset-4" onClick={() => onOpen(tab.key)}>{tabs.find((item) => item.key === tab.key)?.title}</button>
                  <span className="text-muted-foreground"> · {tab.total - tab.done} left</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {missingDocuments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">Requested documents not yet uploaded</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{missingDocuments.map((doc) => <li key={doc.key}>{doc.label}</li>)}</ul>
          </div>
        )}
        {unfinished.length === 0 && missingDocuments.length === 0 && <p className="text-sm font-medium">Every question is answered and every requested document is uploaded.</p>}

        {editable ? (
          <form onSubmit={submit} className="max-w-md space-y-4 border-t border-border pt-6">
            <p className="text-sm leading-6 text-muted-foreground">You can submit with unanswered questions. After you submit, the form is locked.</p>
            <label className="block text-sm font-medium">Your name
              <input className={`${inputClass} mt-1`} required maxLength={200} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">Your work email
              <input className={`${inputClass} mt-1`} type="email" required maxLength={320} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input type="checkbox" required className="mt-1 size-4" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>I confirm these answers are accurate and I am authorized to respond for {form.vendorName}.</span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? "Submitting…" : "Submit response"}</button>
          </form>
        ) : form.state === "submitted" && (
          <p className="border-t border-border pt-6 text-sm leading-6">Submitted by {form.respondentName} ({form.respondentEmail}){form.submittedAt ? ` on ${formatDate(form.submittedAt)}` : ""}.</p>
        )}
      </div>
    </section>
  );
}
