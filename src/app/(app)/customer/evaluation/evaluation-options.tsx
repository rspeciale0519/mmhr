"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { ComparisonMatrix, type ComparisonRequirement } from "./comparison-matrix";
import type { EvaluationSelectionRead } from "@/server/commands/evaluation-selection";
import type { PublicationRead } from "@/server/matching/option-publication-contract";

type SelectionInput = {
  organizationId: string; intakeId: string; publicationId: string; expectedDigest: string;
  optionIds: string[]; correlationId: string; idempotencyKey: string;
};
type SaveState = "ready" | "saving" | "uncertain" | "rejected" | "confirmed";
const buttonClass = "min-h-11 transition-colors";

function requestId() {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
}

export function EvaluationOptions({ publication, history, canSelect, requirementLabels = {}, requirements = [] }: {
  publication: PublicationRead; history: EvaluationSelectionRead; canSelect: boolean; requirementLabels?: Record<string, string>; requirements?: ComparisonRequirement[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const select = useMutation(trpc.evaluations.select.mutationOptions({ retry: false }));
  const [options, setOptions] = useState(publication.options);
  const [nextOrdinal, setNextOrdinal] = useState(publication.nextOrdinal);
  const [loading, setLoading] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("ready");
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);
  const loadingPage = useRef(false);
  const attempt = useRef<SelectionInput | null>(null);
  const uncertain = useRef(false);
  const alreadySelected = new Set([
    ...history.items.filter((item) => item.publicationId === publication.publicationId).map((item) => item.optionId),
    ...(history.selectionPublicationId === publication.publicationId ? history.selectedOptionIds ?? [] : []),
  ]);
  const remaining = history.remainingInitialChoices;
  const locked = saveState !== "ready" || pageFailed || reviewing;
  const refreshHref = `/customer/evaluation?intake=${encodeURIComponent(publication.intakeId)}`;

  async function loadMore() {
    if (loadingPage.current || nextOrdinal === null || pageFailed || saveState !== "ready" || reviewing) return;
    const correlationId = requestId();
    if (!correlationId) { setPageFailed(true); return; }
    loadingPage.current = true;
    setLoading(true);
    try {
      const page = await queryClient.fetchQuery(trpc.evaluations.get.queryOptions({
        organizationId: publication.organizationId, intakeId: publication.intakeId,
        publicationId: publication.publicationId, correlationId, afterOrdinal: nextOrdinal, limit: 25,
      }, { staleTime: 0, retry: false }));
      const count = Math.min(25, publication.optionCount - nextOrdinal);
      if (page.publicationId !== publication.publicationId || page.organizationId !== publication.organizationId ||
        page.intakeId !== publication.intakeId || page.inputDigest !== publication.inputDigest ||
        page.optionCount !== publication.optionCount || page.sequence !== publication.sequence || page.state !== "published" ||
        page.correlationId !== correlationId || page.options.length !== count ||
        page.options.some((option, index) => option.ordinal !== nextOrdinal + index + 1 || options.some((old) => old.optionId === option.optionId)) ||
        page.nextOrdinal !== (nextOrdinal + count < publication.optionCount ? nextOrdinal + count : null)) {
        throw new Error("Comparison page changed");
      }
      setOptions((current) => [...current, ...page.options]);
      setNextOrdinal(page.nextOrdinal);
    } catch { setPageFailed(true); }
    finally { loadingPage.current = false; setLoading(false); }
  }

  function toggleOption(optionId: string) {
    if (locked || !canSelect || alreadySelected.has(optionId)) return;
    setSelected((current) => current.includes(optionId) ? current.filter((value) => value !== optionId)
      : current.length < remaining ? [...current, optionId] : current);
  }

  async function save(input: SelectionInput) {
    if (pending.current || saveState === "confirmed") return;
    pending.current = true;
    setSaveState("saving");
    try {
      await select.mutateAsync(input);
      setSaveState("confirmed");
      try { router.refresh(); } catch { /* The confirmed view keeps a reload link. */ }
    } catch (error) {
      const code = error instanceof TRPCClientError ? error.data?.code : undefined;
      const rejected = ["BAD_REQUEST", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"].includes(code ?? "");
      if (!uncertain.current && rejected) setSaveState("rejected");
      else { uncertain.current = true; setSaveState("uncertain"); }
    } finally { pending.current = false; }
  }

  function saveReviewed() {
    if (!canSelect || !reviewing || !confirmedReview || saveState !== "ready" || pageFailed || pending.current || loadingPage.current ||
      selected.length < 1 || selected.length > remaining) return;
    const correlationId = requestId();
    const idempotencyKey = requestId();
    if (!correlationId || !idempotencyKey) { setMessage("This browser cannot create a secure request. Use an updated browser."); return; }
    const input = { organizationId: publication.organizationId, intakeId: publication.intakeId,
      publicationId: publication.publicationId, expectedDigest: publication.inputDigest,
      optionIds: [...selected], correlationId, idempotencyKey };
    attempt.current = input;
    void save(input);
  }

  const picked = options.filter((option) => alreadySelected.has(option.optionId) || selected.includes(option.optionId));
  const fitScore = (score: number) => Math.round(score / 100);

  return <section aria-labelledby="evaluation-options-heading" className="space-y-6">
    <header>
      <h2 id="evaluation-options-heading" className="co-pt" style={{ fontSize: 44 }}>{publication.optionCount} options compared on fit</h2>
      <p className="co-ps">Provider names stay hidden during this comparison. Option numbers identify records. They do not show rank.</p>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">The match score measures your recorded needs. Evidence coverage is not a prediction of success.</p>
      <p className="mt-3 text-sm tabular-nums">Showing {options.length} of {publication.optionCount} options. Comparison version {publication.sequence}.</p>
    </header>
    <div className="co-lock">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8EF0C9" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <p><b>Names unlock after your advisor review.</b> Compare on coverage until then.</p>
    </div>
    <div className="co-cg">
    <div>
    {!canSelect && <p role="status" className="co-gl co-notice text-sm leading-6">You can view this comparison. Your access or intake status does not allow initial choices.</p>}
    {pageFailed && <div role="alert" className="co-status text-sm leading-6">
      <p>We could not load the next options. This comparison or your access may have changed. Choices are disabled.</p>
      <a href={refreshHref} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Reload comparison</a>
    </div>}
    {options.length > 0 ? <div className="co-gl co-cboard">
      {options.map((option) => {
        const score = fitScore(option.deterministicScore);
        const on = alreadySelected.has(option.optionId) || selected.includes(option.optionId);
        return <div className={on ? "co-cr co-sel" : "co-cr"} key={`rank-${option.optionId}`}>
          <div className="co-n">{option.maskedLabel}<small>Name masked</small></div>
          <div className="co-track co-bar" style={{ ["--v" as string]: `${score}%` }}><i /></div>
          <div className="co-sc">{score}</div>
        </div>;
      })}
    </div> : null}
    {options.length === 0 ? <p role="status" className="co-gl co-notice text-sm leading-6">This approved comparison contains no options. Contact MMHR to review your requirements.</p> : <ComparisonMatrix options={options} requirements={requirements} labels={requirementLabels}
      selectedOptionIds={new Set([...alreadySelected, ...selected])}
      renderChoice={(option) => alreadySelected.has(option.optionId)
        ? <p className="flex min-h-11 items-center text-sm font-semibold">Choice saved</p>
        : canSelect && <label className="co-pick flex min-h-11 cursor-pointer items-center gap-3 has-[:checked]:co-pick-on">
          <input type="checkbox" checked={selected.includes(option.optionId)}
            disabled={locked || (selected.length >= remaining && !selected.includes(option.optionId))}
            onChange={() => toggleOption(option.optionId)}
            className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2" />
          <span>Choose {option.maskedLabel}</span>
        </label>} />}
    {nextOrdinal !== null && <Button type="button" variant="outline" className={buttonClass}
      disabled={loading || pageFailed || reviewing || saveState !== "ready"} onClick={() => void loadMore()}>{loading ? "Loading options…" : "Show more options"}</Button>}
    {canSelect && <section aria-label="Initial choices" className="space-y-4">
      {saveState !== "confirmed" && <p className="text-sm font-semibold tabular-nums">{selected.length} {selected.length === 1 ? "new choice" : "new choices"}. {remaining} {remaining === 1 ? "initial choice remains" : "initial choices remain"}.</p>}
      <p className="max-w-2xl text-pretty text-sm leading-6">You can save up to five initial choices across this intake. Saved choices count even if they are later archived.</p>
      {saveState === "confirmed" ? <div role="status"><p className="font-semibold">Your choices are saved.</p><a href={refreshHref} className="inline-flex min-h-11 items-center underline underline-offset-4">View saved choices</a></div>
        : saveState === "rejected" ? <div role="alert"><p className="text-sm leading-6">Your choices were rejected. The comparison, existing choices, or your access may have changed.</p><a href={refreshHref} className="inline-flex min-h-11 items-center underline underline-offset-4">Review current comparison</a></div>
          : saveState === "uncertain" ? <div role="alert" className="space-y-3"><p className="text-sm leading-6">We could not confirm these choices. They may have been saved. Retry the same request or review saved choices.</p>
            <Button className={buttonClass} onClick={() => { if (attempt.current) void save(attempt.current); }}>Retry unchanged request</Button>
            <a href={refreshHref} className="ml-3 inline-flex min-h-11 items-center underline underline-offset-4">Review saved choices</a>
          </div> : reviewing ? <div className="space-y-4" aria-label="Review initial choices">
            <h3 className="font-semibold">Review your choices</h3>
            <ul className="list-disc pl-5 text-sm leading-6">{selected.map((id) => <li key={id}>{options.find((option) => option.optionId === id)?.maskedLabel}</li>)}</ul>
            <p className="max-w-2xl text-sm leading-6">Saving keeps these choices for MMHR review. It does not contact providers, send an RFP, or create a contract.</p>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmedReview} disabled={saveState === "saving"} onChange={(event) => setConfirmedReview(event.target.checked)} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2" />Save these initial choices</label>
            {message && <p role="alert" className="text-sm">{message}</p>}
            <div className="flex flex-wrap gap-3"><Button className={buttonClass} disabled={!confirmedReview || saveState === "saving" || pageFailed} onClick={saveReviewed}>{saveState === "saving" ? "Saving choices…" : "Save choices"}</Button>
              <Button variant="outline" className={buttonClass} disabled={saveState === "saving"} onClick={() => { setReviewing(false); setConfirmedReview(false); setMessage(null); }}>Change choices</Button></div>
          </div> : <Button className={buttonClass} disabled={selected.length === 0 || pageFailed || loading || remaining === 0}
            onClick={() => { setReviewing(true); setConfirmedReview(false); }}>Review choices</Button>}
    </section>}
    </div>
    <aside className="co-gl co-tray">
      <p className="co-tray-title">RFP contenders</p>
      <p className="co-lbl" style={{ marginTop: 6 }}>Pick up to five. MMHR sends one approved RFP to all of them.</p>
      {picked.map((option) => (
        <div className="co-slot co-slot-f" key={option.optionId}>
          {option.maskedLabel}
          <span className="co-k">{fitScore(option.deterministicScore)}</span>
        </div>
      ))}
      {Array.from({ length: Math.max(0, 5 - picked.length) }, (_, index) => (
        <div className="co-slot co-slot-e" key={`open-${index}`}>Open slot</div>
      ))}
      <div className="co-meter" style={{ marginTop: 20 }}><i style={{ width: `${(picked.length / 5) * 100}%` }} /></div>
      <p className="co-lbl" style={{ marginTop: 8 }}>{picked.length} of 5 picked</p>
    </aside>
    </div>
  </section>;
}
