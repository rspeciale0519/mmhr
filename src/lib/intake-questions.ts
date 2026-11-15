import { estimateEmployeeCountKey, estimateEmployeeCountLabel } from "@/lib/intake-estimate";

/**
 * Guided intake question set.
 *
 * The stored intake format has no room for a top-level version field, so each
 * map answer key carries its own version suffix (for example `industryV1`),
 * like the existing `estimateEmployeeCountV1` key. A later question set must
 * add new keys and keep these entries so that saved intakes still display.
 * List answers keep plain text so that every existing reader shows them as is.
 */
export const intakeQuestionSetVersion = 1;

export type MapSectionKey = "companyContext" | "budget" | "timeline" | "decisionProcess";
export type ListSectionKey = "currentSystems" | "complianceNeeds" | "stakeholders";
export type SectionKey = MapSectionKey | ListSectionKey;

export type MapQuestion = {
  key: string;
  label: string;
  hint?: string;
  input: "text" | "textarea" | "select" | "yesNo" | "date" | "states" | "count";
  options?: readonly string[];
};

/** A list question is stored as one list entry: `<label>: <answer>`. */
export type PrefixQuestion = { label: string; hint?: string };

export type ListSection = {
  prefixQuestions: readonly PrefixQuestion[];
  checklist?: { legend: string; options: readonly string[] };
  other: { label: string; addLabel: string; hint?: string };
};

export const sectionOrder: readonly SectionKey[] = [
  "companyContext", "currentSystems", "complianceNeeds", "budget", "timeline", "stakeholders", "decisionProcess",
];
export const mapSectionKeys: readonly MapSectionKey[] = ["companyContext", "budget", "timeline", "decisionProcess"];
export const listSectionKeys: readonly ListSectionKey[] = ["currentSystems", "complianceNeeds", "stakeholders"];

export const sectionLabels: Record<SectionKey, string> = {
  companyContext: "Company context", currentSystems: "Current systems", complianceNeeds: "Compliance needs",
  budget: "Budget", timeline: "Timeline", stakeholders: "Stakeholders", decisionProcess: "Decision process",
};

export const sectionHelp: Record<SectionKey, string> = {
  companyContext: "Tell us about the company this search is for.",
  currentSystems: "Tell us what your team uses today. Leave a question blank if it does not apply.",
  complianceNeeds: "Choose the rules and security needs that the new system must support.",
  budget: "Give a rough range. You can change it later.",
  timeline: "Tell us when you want to start and what drives that date.",
  stakeholders: "Choose the people who take part in the decision. A role is enough.",
  decisionProcess: "Tell us how your team will choose a vendor.",
};

/** Two-letter codes for the 50 US states and the District of Columbia. */
export const usStateCodes = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export const mapQuestions: Record<MapSectionKey, readonly MapQuestion[]> = {
  companyContext: [
    { key: "industryV1", label: "Industry", input: "text", hint: "For example: restaurants, construction, or health care." },
    { key: estimateEmployeeCountKey, label: estimateEmployeeCountLabel, input: "count", hint: "Enter a whole number. We use it to estimate prices." },
    { key: "usStatesV1", label: "US states where you have employees", input: "states" },
    { key: "companyNotesV1", label: "Anything else about your company", input: "textarea" },
  ],
  budget: [
    {
      key: "annualBudgetRangeV1", label: "Budget range per year", input: "select",
      options: ["Under $10,000", "$10,000 to $25,000", "$25,000 to $50,000", "$50,000 to $100,000", "$100,000 to $250,000", "More than $250,000"],
    },
    { key: "budgetApprovedV1", label: "Is this budget approved?", input: "yesNo" },
    { key: "budgetNotesV1", label: "Anything else about the budget", input: "textarea" },
  ],
  timeline: [
    { key: "targetStartDateV1", label: "Target start date", input: "date" },
    { key: "currentContractEndV1", label: "When does your current contract end?", input: "date", hint: "Leave blank if you do not have a current contract." },
    { key: "timelineNotesV1", label: "Anything else about timing", input: "textarea" },
  ],
  decisionProcess: [
    {
      key: "decisionMethodV1", label: "How will the decision be made?", input: "select",
      options: ["One person decides", "A small team agrees", "A committee votes", "Leadership approves a recommendation"],
    },
    { key: "finalApproverV1", label: "Who gives final approval?", input: "text", hint: "A role is enough, for example: CFO." },
    { key: "decisionNotesV1", label: "Anything else about the decision", input: "textarea" },
  ],
};

export const listSections: Record<ListSectionKey, ListSection> = {
  currentSystems: {
    prefixQuestions: [
      { label: "HR system", hint: "For example: BambooHR, or spreadsheets." },
      { label: "Payroll system" },
      { label: "Time and attendance system" },
      { label: "Benefits system" },
    ],
    other: { label: "Other system", addLabel: "Add another system" },
  },
  complianceNeeds: {
    prefixQuestions: [],
    checklist: {
      legend: "Which of these apply?",
      options: [
        "Payroll tax filing in more than one state", "ACA reporting", "I-9 and E-Verify", "HIPAA privacy for health data",
        "Vendor SOC 2 report", "Data stored in the United States", "Union or collective bargaining rules", "Single sign-on (SSO)",
      ],
    },
    other: { label: "Other compliance need", addLabel: "Add another compliance need" },
  },
  stakeholders: {
    prefixQuestions: [],
    checklist: {
      legend: "Who is involved in the decision?",
      options: ["Owner or chief executive", "HR lead", "Finance lead", "Payroll lead", "IT or security lead", "Operations lead"],
    },
    other: { label: "Other person or team", addLabel: "Add another person or team" },
  },
};

export const listItemMaxLength = 200;
export const mapAnswerMaxLength = 2_000;
export const shortAnswerMaxLength = 200;

export function prefixFor(question: PrefixQuestion): string {
  return `${question.label}: `;
}

/** Returns the label for a known map answer key, or null for an earlier free-form label. */
export function mapQuestionLabel(section: MapSectionKey, key: string): string | null {
  return mapQuestions[section].find((question) => question.key === key)?.label ?? null;
}

export function mapQuestionFor(section: MapSectionKey, key: string): MapQuestion | null {
  return mapQuestions[section].find((question) => question.key === key) ?? null;
}

/** Reads saved state codes; returns null when the saved text is not a plain code list. */
export function parseStateCodes(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  if (value.trim() === "") return [];
  const codes = value.split(",").map((part) => part.trim().toUpperCase());
  const known = new Set<string>(usStateCodes);
  return codes.every((code) => known.has(code)) ? usStateCodes.filter((code) => codes.includes(code)) : null;
}

export function formatStateCodes(codes: readonly string[]): string {
  return usStateCodes.filter((code) => codes.includes(code)).join(", ");
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** Shows a saved map answer for a reader. Unknown keys and values stay as saved. */
export function formatMapAnswer(section: MapSectionKey, key: string, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "") return "Not provided";
  if (mapQuestionFor(section, key)?.input === "date" && isIsoDate(value)) return dateFormat.format(new Date(`${value}T00:00:00Z`));
  return String(value);
}

/** Orders saved map entries: guided questions first, in question order, then earlier labels as saved. */
export function orderedMapEntries<T>(section: MapSectionKey, value: Record<string, T>): Array<[string, T]> {
  const entries = Object.entries(value);
  const order = mapQuestions[section].map((question) => question.key);
  const guided = order.flatMap((key) => entries.filter(([entryKey]) => entryKey === key));
  return [...guided, ...entries.filter(([entryKey]) => !order.includes(entryKey))];
}
