import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const criterionKey = z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/);
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);

export const scoreEntrySchema = z.strictObject({
  scoreId: uuid,
  criterionKey,
  scorerIdentityId: uuid,
  value: z.number().int().min(0).max(100),
  comment: z.string().trim().max(1_000).nullable(),
  evidenceReferences: z.array(reference).max(50),
  enteredAt: timestamp,
});
export type ScoreEntry = Readonly<z.output<typeof scoreEntrySchema>>;

export const scorecardCriterionSchema = z.strictObject({
  key: criterionKey,
  weight: z.number().int().min(1).max(100),
});
export type ScorecardCriterion = z.output<typeof scorecardCriterionSchema>;

const scorecardInputSchema = z.strictObject({
  scorecardId: uuid,
  organizationId: uuid,
  intakeId: uuid,
  candidateId: reference,
  configurationId: uuid,
  configurationVersion: z.number().int().positive(),
  criteria: z.array(scorecardCriterionSchema).min(1).max(100),
  entries: z.array(scoreEntrySchema).max(10_000),
  status: z.enum(["draft", "submitted", "approved"]),
  revision: z.number().int().positive(),
  correlationId: uuid,
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((scorecard, context) => {
  const criteria = new Set<string>();
  for (const criterion of scorecard.criteria) {
    if (criteria.has(criterion.key)) context.addIssue({ code: "custom", path: ["criteria"], message: "Duplicate scorecard criterion" });
    criteria.add(criterion.key);
  }
  const entryKeys = new Set<string>();
  for (const entry of scorecard.entries) {
    if (!criteria.has(entry.criterionKey)) context.addIssue({ code: "custom", path: ["entries"], message: "Score entry references an unknown criterion" });
    const key = `${entry.criterionKey}:${entry.scorerIdentityId}`;
    if (entryKeys.has(key)) context.addIssue({ code: "custom", path: ["entries"], message: "Duplicate scorer entry" });
    entryKeys.add(key);
  }
  if (Date.parse(scorecard.updatedAt) < Date.parse(scorecard.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Scorecard update cannot precede creation" });
  }
});
export type ScorecardInput = z.output<typeof scorecardInputSchema>;
export type ScorecardRecord = Readonly<ScorecardInput & { entryHistory: readonly ScoreEntry[] }>;

export const scoreEntryCommandSchema = z.strictObject({
  scorecardId: uuid,
  organizationId: uuid,
  expectedRevision: z.number().int().positive(),
  entry: scoreEntrySchema,
  actorIdentityId: uuid,
  correlationId: uuid,
});
export type ScoreEntryCommand = z.output<typeof scoreEntryCommandSchema>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function createScorecard(input: unknown): ScorecardRecord {
  const result = scorecardInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid scorecard");
  if (result.data.status !== "draft" || result.data.revision !== 1) throw new Error("New scorecards must start as drafts at revision one");
  return deepFreeze({ ...result.data, criteria: [...result.data.criteria], entries: [...result.data.entries], entryHistory: [...result.data.entries] });
}

/** Adds or replaces one scorer/criterion entry with optimistic concurrency. */
export function recordScoreEntry(record: ScorecardRecord, input: unknown): ScorecardRecord {
  const result = scoreEntryCommandSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid score entry command");
  const command = result.data;
  if (command.scorecardId !== record.scorecardId || command.organizationId !== record.organizationId) throw new Error("Score entry scope does not match");
  if (command.expectedRevision !== record.revision) throw new Error("Scorecard revision conflict");
  if (!record.criteria.some((criterion) => criterion.key === command.entry.criterionKey)) throw new Error("Unknown scorecard criterion");
  const entryKey = (entry: ScoreEntry) => `${entry.criterionKey}:${entry.scorerIdentityId}`;
  const replaced = record.entries.some((entry) => entryKey(entry) === entryKey(command.entry));
  const entries = replaced
    ? record.entries.map((entry) => entryKey(entry) === entryKey(command.entry) ? command.entry : entry)
    : [...record.entries, command.entry];
  return deepFreeze({
    ...record,
    entries,
    revision: record.revision + 1,
    updatedAt: command.entry.enteredAt,
    entryHistory: [...record.entryHistory, command.entry],
  });
}

export type ScorecardAggregate = Readonly<{
  scorecardId: string;
  configurationVersion: number;
  criterionAverages: Readonly<Record<string, number>>;
  overallScore: number;
  scorerCount: number;
}>;

/** Computes a deterministic weighted average from the current entry snapshot. */
export function aggregateScorecard(record: ScorecardRecord): ScorecardAggregate {
  const criterionAverages: Record<string, number> = {};
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const criterion of record.criteria) {
    const values = record.entries.filter((entry) => entry.criterionKey === criterion.key).map((entry) => entry.value);
    const average = values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    criterionAverages[criterion.key] = average;
    weightedTotal += average * criterion.weight;
    totalWeight += criterion.weight;
  }
  return deepFreeze({
    scorecardId: record.scorecardId,
    configurationVersion: record.configurationVersion,
    criterionAverages,
    overallScore: Math.round(weightedTotal / totalWeight),
    scorerCount: new Set(record.entries.map((entry) => entry.scorerIdentityId)).size,
  });
}

export { scorecardInputSchema };
