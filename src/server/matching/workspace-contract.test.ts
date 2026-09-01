import { describe, expect, test } from "vitest";

import { appendWorkspaceComment, parseWorkspaceParticipant, parseWorkspaceSnapshot, visibleWorkspaceComments, workspaceParticipantSchema, workspaceSnapshotSchema } from "./workspace-contract";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const snapshot = { workspaceId: id(1), organizationId: id(2), intakeId: id(3), stage: "evaluation", candidateIds: ["candidate:one"], openTaskIds: [id(4)], approvalIds: [id(5)], upcomingEventReferences: ["event:demo"], recentActivityIds: [id(6)], capturedAt: "2026-09-01T10:00:00.000Z", revision: 2 };
const participant = (overrides: Record<string, unknown> = {}) => ({ participantId: id(7), workspaceId: id(1), organizationId: id(2), identityId: id(8), role: "customer_member", status: "invited", invitedAt: "2026-09-01T10:00:00.000Z", joinedAt: null, removedAt: null, ...overrides });
const comment = (overrides: Record<string, unknown> = {}) => ({ commentId: id(10), workspaceId: id(1), organizationId: id(2), authorIdentityId: id(8), visibility: "customer", body: "Please review the shortlist.", createdAt: "2026-09-01T11:00:00.000Z", correlationId: id(9), ...overrides });

describe("R3 workspace contract", () => {
  test("parses immutable scoped snapshots", () => {
    const result = parseWorkspaceSnapshot(snapshot);
    expect(result.stage).toBe("evaluation");
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects duplicate snapshot references", () => {
    expect(workspaceSnapshotSchema.safeParse({ ...snapshot, openTaskIds: [id(4), id(4)] }).success).toBe(false);
  });

  test("enforces participant status timestamps", () => {
    expect(parseWorkspaceParticipant(participant()).status).toBe("invited");
    expect(workspaceParticipantSchema.safeParse(participant({ status: "active" })).success).toBe(false);
    expect(workspaceParticipantSchema.safeParse(participant({ status: "removed", removedAt: "2026-09-01T11:00:00.000Z" })).success).toBe(true);
  });

  test("appends comments in order and preserves history", () => {
    const result = appendWorkspaceComment([comment({ commentId: id(11), createdAt: "2026-09-01T12:00:00.000Z" })], comment());
    expect(result.map((entry) => entry.commentId)).toEqual([id(10), id(11)]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects duplicate and cross-workspace comments", () => {
    expect(() => appendWorkspaceComment([comment()], comment())).toThrow("Duplicate");
    expect(() => appendWorkspaceComment([comment({ commentId: id(11), organizationId: id(99) })], comment())).toThrow("scope");
  });

  test("filters internal comments from customer views", () => {
    const history = appendWorkspaceComment([], comment());
    const withInternal = appendWorkspaceComment(history, comment({ commentId: id(11), visibility: "internal" }));
    expect(visibleWorkspaceComments(withInternal, "customer")).toHaveLength(1);
    expect(visibleWorkspaceComments(withInternal, "internal")).toHaveLength(2);
  });
});
