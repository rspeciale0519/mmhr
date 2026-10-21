import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const stableKey = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/);
const label = z.string().trim().min(1).max(200);

export const intakeStatuses = ["draft", "in_progress", "submitted", "under_review", "completed", "archived"] as const;
export type IntakeStatus = (typeof intakeStatuses)[number];

export const intakeRequirementStatuses = ["active", "archived"] as const;
export const intakeRequirementImportance = ["must", "nice", "not_applicable"] as const;

const boundedValue = z.union([z.string().trim().max(2_000), z.number().finite(), z.boolean()]);
const structuredMap = z.record(z.string().trim().min(1).max(100), boundedValue).default({});

export const intakeInputSchema = z.strictObject({
  intakeId: uuid,
  organizationId: uuid,
  ownerIdentityId: uuid.nullable(),
  companyContext: structuredMap,
  currentSystems: z.array(label).max(50),
  complianceNeeds: z.array(label).max(50),
  budget: structuredMap,
  timeline: structuredMap,
  stakeholders: z.array(label).max(100),
  decisionProcess: structuredMap,
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: z.number().int().positive(),
  correlationId: uuid,
});

export type IntakeInput = z.output<typeof intakeInputSchema>;
export type IntakeRecord = Readonly<IntakeInput & { status: IntakeStatus; submittedAt: string | null; transitions: readonly IntakeTransition[]; requirements: readonly IntakeRequirement[] }>;

export const intakeRequirementSchema = z.strictObject({
  requirementId: uuid,
  intakeId: uuid,
  organizationId: uuid,
  stableKey,
  label,
  importance: z.enum(intakeRequirementImportance),
  weight: z.number().int().min(1).max(100),
  ownerIdentityId: uuid.nullable(),
  response: boundedValue.nullable(),
  status: z.enum(intakeRequirementStatuses),
  revision: z.number().int().positive(),
  correlationId: uuid,
});

export type IntakeRequirement = z.output<typeof intakeRequirementSchema>;

export const intakeTransitionSchema = z.strictObject({
  intakeId: uuid,
  fromStatus: z.enum(intakeStatuses),
  toStatus: z.enum(intakeStatuses),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  correlationId: uuid,
});

export type IntakeTransition = z.output<typeof intakeTransitionSchema>;

const allowedTransitions: Readonly<Record<IntakeStatus, readonly IntakeStatus[]>> = {
  draft: ["in_progress", "submitted", "archived"],
  in_progress: ["submitted", "archived"],
  submitted: ["under_review", "archived"],
  under_review: ["completed", "in_progress", "archived"],
  completed: [],
  archived: [],
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function parseInput(value: unknown): IntakeInput {
  const result = intakeInputSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid intake");
  if (Date.parse(result.data.updatedAt) < Date.parse(result.data.createdAt)) throw new Error("Intake update cannot precede creation");
  return result.data;
}

/** Creates an immutable draft intake with no implicit requirements or submission. */
export function createIntake(value: unknown): IntakeRecord {
  const parsed = parseInput(value);
  return deepFreeze({ ...parsed, status: "draft", submittedAt: null, transitions: [], requirements: [] });
}

/** Appends one requirement while preserving organization and intake scope. */
export function addIntakeRequirement(record: IntakeRecord, value: unknown): IntakeRecord {
  const result = intakeRequirementSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid intake requirement");
  const requirement = result.data;
  if (record.status === "submitted" || record.status === "under_review" || record.status === "completed" || record.status === "archived") {
    throw new Error("Intake requirements cannot change after submission");
  }
  if (requirement.intakeId !== record.intakeId || requirement.organizationId !== record.organizationId) throw new Error("Intake requirement scope does not match");
  if (record.requirements.some((item) => item.stableKey === requirement.stableKey && item.status !== "archived")) throw new Error("Duplicate intake requirement");
  return deepFreeze({ ...record, requirements: [...record.requirements, requirement] });
}

/** Applies one revision-checked intake transition and preserves its history. */
export function transitionIntake(record: IntakeRecord, value: unknown): IntakeRecord {
  const result = intakeTransitionSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid intake transition");
  const transition = result.data;
  if (transition.intakeId !== record.intakeId) throw new Error("Intake transition ID does not match");
  if (transition.fromStatus !== record.status || transition.expectedRevision !== record.revision) throw new Error("Intake transition is stale");
  if (!allowedTransitions[record.status].includes(transition.toStatus)) throw new Error("Intake transition is not allowed");
  if (transition.toStatus === "submitted" && !record.requirements.some((requirement) => requirement.status === "active" && requirement.importance !== "not_applicable")) {
    throw new Error("An intake needs an applicable requirement before submission");
  }
  const submittedAt = transition.toStatus === "submitted" ? transition.occurredAt : record.submittedAt;
  return deepFreeze({ ...record, status: transition.toStatus, revision: record.revision + 1, submittedAt, transitions: [...record.transitions, transition] });
}

export function canTransitionIntake(from: IntakeStatus, to: IntakeStatus): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export { allowedTransitions, label, stableKey, timestamp, uuid };
