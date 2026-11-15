"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatStateCodes, listItemMaxLength, listSections, mapAnswerMaxLength, parseStateCodes, prefixFor, sectionLabels,
  shortAnswerMaxLength, usStateCodes, type ListSectionKey, type MapQuestion, type MapSectionKey,
} from "@/lib/intake-questions";
import type { EarlierRow, GuidedAnswer, ListSectionState } from "./intake-answers";

const fieldLabelClass = "text-sm font-medium text-foreground";
const hintClass = "text-xs leading-5 text-muted-foreground";
const selectClass = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClass = "min-h-24 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const checkboxClass = "mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function fieldId(section: string, key: string) { return `intake-${section}-${key}`; }

function Hint({ id, text }: { id: string; text?: string }) {
  return text ? <p id={id} className={hintClass}>{text}</p> : null;
}

function StatesField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const selected = parseStateCodes(value) ?? [];
  function toggle(code: string, on: boolean) {
    onChange(formatStateCodes(on ? [...selected, code] : selected.filter((entry) => entry !== code)));
  }
  return <fieldset className="min-w-0 space-y-2">
    <legend className={fieldLabelClass}>{label}</legend>
    <p id={`${id}-summary`} className={hintClass} aria-live="polite">{selected.length ? `Selected: ${selected.join(", ")}` : "No states selected"}</p>
    <details className="rounded-lg border border-input">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Choose states</summary>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t p-3 min-[400px]:grid-cols-4 sm:grid-cols-6">
        {usStateCodes.map((code) => <label key={code} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className={checkboxClass} checked={selected.includes(code)} onChange={(event) => toggle(code, event.target.checked)} />
          <span>{code}</span>
        </label>)}
      </div>
    </details>
  </fieldset>;
}

export function MapQuestionField({ section, question, answer, onChange }: {
  section: MapSectionKey; question: MapQuestion; answer: GuidedAnswer; onChange: (value: string) => void;
}) {
  const id = fieldId(section, question.key);
  const hintId = `${id}-hint`;
  const describedBy = question.hint ? hintId : undefined;
  if (question.input === "states") return <StatesField id={id} label={question.label} value={answer.value} onChange={onChange} />;
  const savedOption = question.input === "select" && typeof answer.raw === "string" && answer.raw !== "" &&
    !question.options?.includes(answer.raw) ? answer.raw : null;
  return <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className={fieldLabelClass}>{question.label}</label>
    <Hint id={hintId} text={question.hint} />
    {question.input === "textarea" ? <textarea id={id} aria-describedby={describedBy} value={answer.value} maxLength={mapAnswerMaxLength}
      className={textareaClass} onChange={(event) => onChange(event.target.value)} />
      : question.input === "select" ? <select id={id} aria-describedby={describedBy} value={answer.value} className={selectClass} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not sure yet</option>
        {question.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        {savedOption && <option value={savedOption}>{savedOption}</option>}
      </select>
      : question.input === "yesNo" ? <select id={id} aria-describedby={describedBy} value={answer.value} className={selectClass} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not sure yet</option><option value="true">Yes</option><option value="false">No</option>
      </select>
      : <Input id={id} aria-describedby={describedBy} value={answer.value} className="min-h-11 text-foreground"
        type={question.input === "date" ? "date" : "text"} inputMode={question.input === "count" ? "numeric" : undefined}
        maxLength={question.input === "text" ? shortAnswerMaxLength : undefined} onChange={(event) => onChange(event.target.value)} />}
  </div>;
}

export function EarlierAnswers({ section, rows, onChange, onRemove }: {
  section: MapSectionKey; rows: EarlierRow[]; onChange: (index: number, value: string) => void; onRemove: (index: number) => void;
}) {
  if (rows.length === 0) return null;
  return <div className="space-y-4 border-t pt-5">
    <div>
      <h4 className="text-sm font-semibold">Earlier answers</h4>
      <p className={hintClass}>These answers were saved with an earlier version of this form. You can change or remove them.</p>
    </div>
    {rows.map((row, index) => {
      const id = fieldId(section, `earlier-${index}`);
      return <div key={id} className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className={`${fieldLabelClass} whitespace-pre-wrap [overflow-wrap:anywhere]`}>{row.key}</label>
        <div className="flex items-start gap-2">
          {row.kind === "boolean" ? <select id={id} value={row.value === "true" ? "true" : "false"} className={selectClass} onChange={(event) => onChange(index, event.target.value)}><option value="true">Yes</option><option value="false">No</option></select>
            : row.kind === "number" ? <Input id={id} inputMode="decimal" value={row.value} className="min-h-11 text-foreground" onChange={(event) => onChange(index, event.target.value)} />
            : <textarea id={id} value={row.value} maxLength={mapAnswerMaxLength} className={textareaClass} onChange={(event) => onChange(index, event.target.value)} />}
          <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3" aria-label={`Remove earlier answer ${row.key} from ${sectionLabels[section]}`} onClick={() => onRemove(index)}>Remove</Button>
        </div>
      </div>;
    })}
  </div>;
}

export function ListSectionFields({ section, state, onPrefix, onToggle, onOther, onAddOther, onRemoveOther }: {
  section: ListSectionKey; state: ListSectionState;
  onPrefix: (index: number, value: string) => void; onToggle: (option: string, on: boolean) => void;
  onOther: (index: number, value: string) => void; onAddOther: () => void; onRemoveOther: (index: number) => void;
}) {
  const config = listSections[section];
  return <div className="flex min-w-0 flex-col gap-5">
    {config.prefixQuestions.map((question, index) => {
      const id = fieldId(section, `prefix-${index}`);
      return <div key={id} className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className={fieldLabelClass}>{question.label}</label>
        <Hint id={`${id}-hint`} text={question.hint} />
        <Input id={id} aria-describedby={question.hint ? `${id}-hint` : undefined} value={state.prefixed[index] ?? ""}
          maxLength={listItemMaxLength - prefixFor(question).length} className="min-h-11 text-foreground" onChange={(event) => onPrefix(index, event.target.value)} />
      </div>;
    })}
    {config.checklist && <fieldset className="min-w-0 space-y-1">
      <legend className={`${fieldLabelClass} mb-2`}>{config.checklist.legend}</legend>
      {config.checklist.options.map((option) => <label key={option} className="flex min-h-11 items-start gap-3 py-2 text-sm leading-6">
        <input type="checkbox" className={`${checkboxClass} mt-1`} checked={state.checked.includes(option)} onChange={(event) => onToggle(option, event.target.checked)} />
        <span>{option}</span>
      </label>)}
    </fieldset>}
    <div className="space-y-3">
      {state.other.map((value, index) => {
        const id = fieldId(section, `other-${index}`);
        const label = state.other.length > 1 ? `${config.other.label} ${index + 1}` : config.other.label;
        return <div key={id} className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={id} className={fieldLabelClass}>{label}</label>
          <div className="flex items-start gap-2">
            <Input id={id} value={value} maxLength={listItemMaxLength} className="min-h-11 text-foreground" onChange={(event) => onOther(index, event.target.value)} />
            {state.other.length > 1 && <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3" aria-label={`Remove ${label}`} onClick={() => onRemoveOther(index)}>Remove</Button>}
          </div>
        </div>;
      })}
      <Button type="button" variant="outline" className="min-h-11" onClick={onAddOther}>{config.other.addLabel}</Button>
    </div>
  </div>;
}
