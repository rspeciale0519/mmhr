import { isEstimateEmployeeCount } from "@/lib/intake-estimate";
import {
  formatStateCodes, isIsoDate, listItemMaxLength, listSectionKeys, listSections, mapAnswerMaxLength, mapQuestions,
  mapSectionKeys, parseStateCodes, prefixFor, sectionLabels,
  type ListSectionKey, type MapQuestion, type MapSectionKey, type SectionKey,
} from "@/lib/intake-questions";
import type { getIntake } from "@/server/commands/intake-read";

type IntakeData = Awaited<ReturnType<typeof getIntake>>["data"];
export type Scalar = string | number | boolean;
export type EarlierKind = "string" | "number" | "boolean";
/** An answer saved under a free-form label by an earlier version of the form. */
export type EarlierRow = { key: string; value: string; kind: EarlierKind };
/** `raw` keeps the saved value so an untouched answer is saved again exactly as it was. */
export type GuidedAnswer = { value: string; touched: boolean; present: boolean; raw?: Scalar };
export type MapSectionState = { answers: Record<string, GuidedAnswer>; earlier: EarlierRow[] };
export type ListSectionState = { prefixed: string[]; checked: string[]; other: string[] };
export type AnswerState = {
  maps: Record<MapSectionKey, MapSectionState>;
  lists: Record<ListSectionKey, ListSectionState>;
  presence: Record<SectionKey, boolean>;
};

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function kindOf(value: Scalar): EarlierKind {
  return typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";
}

/** Converts a saved value into the text that the guided input shows. Unusable values show as blank. */
export function inputValueFor(question: MapQuestion, raw: Scalar | undefined): string {
  if (raw === undefined) return "";
  switch (question.input) {
    case "yesNo": return typeof raw === "boolean" ? String(raw) : "";
    case "date": return isIsoDate(raw) ? raw : "";
    case "count": return isEstimateEmployeeCount(raw) ? String(raw) : "";
    case "states": { const codes = parseStateCodes(raw); return codes ? formatStateCodes(codes) : ""; }
    default: return typeof raw === "string" ? raw : "";
  }
}

function readMap(section: MapSectionKey, saved: Record<string, Scalar> | undefined): MapSectionState {
  const value = saved ?? {};
  const answers: Record<string, GuidedAnswer> = {};
  const guidedKeys = new Set(mapQuestions[section].map((question) => question.key));
  for (const question of mapQuestions[section]) {
    const present = hasOwn(value, question.key);
    const raw = present ? value[question.key] : undefined;
    answers[question.key] = { value: inputValueFor(question, raw), touched: false, present, raw };
  }
  const earlier = Object.entries(value).filter(([key]) => !guidedKeys.has(key))
    .map(([key, entry]) => ({ key, value: String(entry), kind: kindOf(entry) }));
  return { answers, earlier };
}

function readList(section: ListSectionKey, saved: string[] | undefined): ListSectionState {
  const config = listSections[section];
  const prefixed = config.prefixQuestions.map(() => "");
  const checked: string[] = [];
  const other: string[] = [];
  for (const entry of saved ?? []) {
    const index = config.prefixQuestions.findIndex((question, position) =>
      prefixed[position] === "" && entry.startsWith(prefixFor(question)) && entry.slice(prefixFor(question).length).trim() !== "");
    if (index >= 0) { prefixed[index] = entry.slice(prefixFor(config.prefixQuestions[index]!).length); continue; }
    if (config.checklist?.options.includes(entry) && !checked.includes(entry)) { checked.push(entry); continue; }
    other.push(entry);
  }
  return { prefixed, checked, other: other.length ? other : [""] };
}

/** Reads saved intake data in any earlier format into the guided form state. */
export function readAnswers(data: IntakeData): AnswerState {
  return {
    maps: Object.fromEntries(mapSectionKeys.map((key) => [key, readMap(key, data[key])])) as AnswerState["maps"],
    lists: Object.fromEntries(listSectionKeys.map((key) => [key, readList(key, data[key])])) as AnswerState["lists"],
    presence: Object.fromEntries((Object.keys(sectionLabels) as SectionKey[]).map((key) => [key, hasOwn(data, key)])) as AnswerState["presence"],
  };
}

function guidedValue(question: MapQuestion, answer: GuidedAnswer): { value?: Scalar; error?: string } {
  if (!answer.touched) return answer.present ? { value: answer.raw } : {};
  const text = answer.value.trim();
  if (text === "") return {};
  switch (question.input) {
    case "yesNo": return { value: text === "true" };
    case "date": return isIsoDate(text) ? { value: text } : { error: `Enter a valid date for "${question.label}".` };
    case "count": {
      const number = Number(text);
      return /^\d+$/.test(text) && isEstimateEmployeeCount(number) ? { value: number }
        : { error: "Enter a whole number from 1 to 10,000,000 for the employee count." };
    }
    default: return { value: text };
  }
}

function earlierValue(section: MapSectionKey, row: EarlierRow): { value?: Scalar; error?: string } {
  if (row.kind === "boolean") return { value: row.value === "true" };
  if (row.kind === "string") return { value: row.value };
  const number = Number(row.value);
  return row.value.trim() && Number.isFinite(number) ? { value: number }
    : { error: `Enter a number for "${row.key}" in ${sectionLabels[section]}.` };
}

/** Builds the stored intake data. The format matches what `intakes.saveDraft` already accepts. */
export function buildData(state: AnswerState): { data?: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};
  for (const section of mapSectionKeys) {
    const entries: Array<[string, Scalar]> = [];
    for (const question of mapQuestions[section]) {
      const result = guidedValue(question, state.maps[section].answers[question.key]!);
      if (result.error) return { error: result.error };
      if (result.value !== undefined) entries.push([question.key, result.value]);
    }
    for (const row of state.maps[section].earlier) {
      const result = earlierValue(section, row);
      if (result.error) return { error: result.error };
      entries.push([row.key, result.value!]);
    }
    if (state.presence[section] || entries.length > 0) data[section] = Object.fromEntries(entries);
  }
  for (const section of listSectionKeys) {
    const config = listSections[section];
    const list = state.lists[section];
    const values = [
      ...config.prefixQuestions.flatMap((question, index) => {
        const answer = list.prefixed[index]?.trim() ?? "";
        return answer ? [`${prefixFor(question)}${answer}`] : [];
      }),
      ...(config.checklist?.options.filter((option) => list.checked.includes(option)) ?? []),
      ...list.other.filter((value) => value.trim() !== ""),
    ];
    if (state.presence[section] || values.length > 0) data[section] = values;
  }
  return { data };
}

/** Repeats the server limits so that a customer sees a clear message before a save request. */
export function validateData(data: Record<string, unknown>): string | null {
  for (const key of mapSectionKeys) {
    const map = data[key] as Record<string, Scalar> | undefined;
    if (!map) continue;
    if (Object.keys(map).length > 50) return `${sectionLabels[key]} can contain at most 50 answers.`;
    for (const [label, value] of Object.entries(map)) {
      if (label.trim().length < 1 || label.trim().length > 100) return `${sectionLabels[key]} labels must be 1 to 100 characters.`;
      if (typeof value === "string" && value.length > mapAnswerMaxLength) return `${sectionLabels[key]} answers must be 2,000 characters or less.`;
      if (typeof value === "number" && !Number.isFinite(value)) return `${sectionLabels[key]} contains an invalid number.`;
    }
  }
  for (const key of listSectionKeys) {
    const values = data[key] as string[] | undefined;
    if (!values) continue;
    const limit = key === "stakeholders" ? 100 : 50;
    if (values.length > limit) return `${sectionLabels[key]} can contain at most ${limit} answers.`;
    if (values.some((value) => value.trim().length < 1 || value.trim().length > listItemMaxLength)) return `${sectionLabels[key]} answers must be 1 to 200 characters.`;
  }
  return new TextEncoder().encode(JSON.stringify(data)).length > 90_000 ? "Your answers are too large to save. Remove some detail and try again." : null;
}
