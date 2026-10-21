import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);

export const workspaceStages = ["intake", "matching", "evaluation", "selection", "contracting", "onboarding", "closed"] as const;
export type WorkspaceStage = (typeof workspaceStages)[number];

export const workspaceSnapshotSchema = z.strictObject({
  workspaceId: uuid,
  organizationId: uuid,
  intakeId: uuid,
  stage: z.enum(workspaceStages),
  candidateIds: z.array(reference).max(10_000),
  openTaskIds: z.array(uuid).max(10_000),
  approvalIds: z.array(uuid).max(10_000),
  upcomingEventReferences: z.array(reference).max(100),
  recentActivityIds: z.array(uuid).max(100),
  capturedAt: timestamp,
  revision: z.number().int().positive(),
}).superRefine((snapshot, context) => {
  for (const [field, values] of Object.entries({
    candidateIds: snapshot.candidateIds,
    openTaskIds: snapshot.openTaskIds,
    approvalIds: snapshot.approvalIds,
    upcomingEventReferences: snapshot.upcomingEventReferences,
    recentActivityIds: snapshot.recentActivityIds,
  })) {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", path: [field], message: "Workspace references must be unique" });
  }
});
export type WorkspaceSnapshot = Readonly<z.output<typeof workspaceSnapshotSchema>>;

export const workspaceParticipantSchema = z.strictObject({
  participantId: uuid,
  workspaceId: uuid,
  organizationId: uuid,
  identityId: uuid,
  role: z.enum(["customer_member", "customer_admin", "mmhr_advisor", "mmhr_reviewer"]),
  status: z.enum(["invited", "active", "removed"]),
  invitedAt: timestamp,
  joinedAt: timestamp.nullable(),
  removedAt: timestamp.nullable(),
}).superRefine((participant, context) => {
  if (participant.status === "active" && participant.joinedAt === null) context.addIssue({ code: "custom", path: ["joinedAt"], message: "Active participants require joinedAt" });
  if (participant.status === "removed" && participant.removedAt === null) context.addIssue({ code: "custom", path: ["removedAt"], message: "Removed participants require removedAt" });
  if (participant.status === "invited" && (participant.joinedAt !== null || participant.removedAt !== null)) context.addIssue({ code: "custom", path: ["status"], message: "Invited participants cannot have joined or removed timestamps" });
});
export type WorkspaceParticipant = Readonly<z.output<typeof workspaceParticipantSchema>>;

export const workspaceCommentSchema = z.strictObject({
  commentId: uuid,
  workspaceId: uuid,
  organizationId: uuid,
  authorIdentityId: uuid,
  visibility: z.enum(["customer", "internal"]),
  body: z.string().trim().min(1).max(5_000),
  createdAt: timestamp,
  correlationId: uuid,
});
export type WorkspaceComment = Readonly<z.output<typeof workspaceCommentSchema>>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function parseWorkspaceSnapshot(input: unknown): WorkspaceSnapshot {
  const result = workspaceSnapshotSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid workspace snapshot");
  return deepFreeze({ ...result.data, candidateIds: [...result.data.candidateIds], openTaskIds: [...result.data.openTaskIds], approvalIds: [...result.data.approvalIds], upcomingEventReferences: [...result.data.upcomingEventReferences], recentActivityIds: [...result.data.recentActivityIds] });
}

export function parseWorkspaceParticipant(input: unknown): WorkspaceParticipant {
  const result = workspaceParticipantSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid workspace participant");
  return deepFreeze(result.data);
}

export function appendWorkspaceComment(historyInput: readonly unknown[], input: unknown): readonly WorkspaceComment[] {
  const history = historyInput.map((value) => {
    const result = workspaceCommentSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid workspace comment");
    return result.data;
  });
  const result = workspaceCommentSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid workspace comment");
  const comment = result.data;
  if (history.some((entry) => entry.commentId === comment.commentId)) throw new Error("Duplicate workspace comment");
  if (history.some((entry) => entry.workspaceId !== comment.workspaceId || entry.organizationId !== comment.organizationId)) throw new Error("Workspace comment scope mismatch");
  return deepFreeze([...history, comment].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.commentId.localeCompare(right.commentId)));
}

/** Internal comments never appear in a customer-facing workspace view. */
export function visibleWorkspaceComments(historyInput: readonly unknown[], visibility: "customer" | "internal"): readonly WorkspaceComment[] {
  const history = historyInput.map((value) => {
    const result = workspaceCommentSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid workspace comment");
    return result.data;
  });
  return deepFreeze(history.filter((comment) => visibility === "internal" || comment.visibility === "customer"));
}

export { reference, timestamp, uuid };
