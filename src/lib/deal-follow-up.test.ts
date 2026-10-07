import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { canApplyTaskAction, taskCommandSchema, taskHistoryPageSchema, taskQueueReadSchema, taskStates } from "./deal-follow-up";

const metadata = () => ({ organizationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID(),
  taskId: randomUUID(), reason: "Synthetic task test" });
const create = () => ({ ...metadata(), action: "create", dealId: randomUUID(), title: "Follow up on implementation",
  description: null, dueAt: null, assigneeIdentityId: null, ownerIdentityId: randomUUID(), priority: "normal" });
describe("Deal follow-up contracts", () => {
  test("keeps explicit nulls for clearing and distinguishes omitted edits", () => {
    expect(taskCommandSchema.parse(create())).toMatchObject({ description: null, dueAt: null, assigneeIdentityId: null });
    const result = taskCommandSchema.parse({ ...metadata(), action: "edit", expectedRevision: 2, description: null });
    expect(result).toHaveProperty("description", null); expect(result).not.toHaveProperty("dueAt");
    expect(taskCommandSchema.safeParse({ ...metadata(), action: "edit", expectedRevision: 2 }).success).toBe(false);
  });
  test.each([{ title: " " }, { title: "x".repeat(201) }, { description: "x".repeat(2001) }, { ownerIdentityId: null },
    { dealId: "foreign label" }, { dueAt: "2026-99-01" }, { assigneeIdentityId: "staff" }, { priority: "emergency" },
    { createdByIdentityId: randomUUID() }, { state: "completed" }, { createdAt: new Date().toISOString() }, { title: "bad\u0000title" }])(
    "rejects malformed or caller-owned create fields %#", change => expect(taskCommandSchema.safeParse({ ...create(), ...change }).success).toBe(false));
  test.each([0, -1, 1.5, 2147483647, "1", null])("rejects invalid revision %s", expectedRevision => {
    expect(taskCommandSchema.safeParse({ ...metadata(), action: "complete", expectedRevision }).success).toBe(false);
  });
  test("normalizes offset dates and input text before request hashing", () => {
    expect(taskCommandSchema.parse({ ...create(), title: "  Follow up  ", dueAt: "2026-10-03T09:00:00-04:00" }))
      .toMatchObject({ title: "Follow up", dueAt: "2026-10-03T13:00:00.000Z" });
  });
  test.each(taskStates)("uses the complete bounded state graph from %s", state => {
    const actions = ["edit", "reassign", "transfer_owner", "start", "block", "resume", "complete", "cancel"] as const;
    const expected: Record<string, readonly string[]> = {
      open: ["edit", "reassign", "transfer_owner", "start", "block", "complete", "cancel"],
      in_progress: ["edit", "reassign", "transfer_owner", "block", "complete", "cancel"],
      blocked: ["edit", "reassign", "transfer_owner", "resume", "cancel"], completed: [], cancelled: [],
    };
    expect(actions.filter(action => canApplyTaskAction(state, action))).toEqual(expected[state]);
  });
  test("rejects state and unrelated field changes in owner transfers", () => {
    const transfer = { ...metadata(), action: "transfer_owner", expectedRevision: 1, ownerIdentityId: randomUUID() };
    expect(taskCommandSchema.safeParse(transfer).success).toBe(true);
    for (const change of [{ reason: "" }, { ownerIdentityId: null }, { assigneeIdentityId: randomUUID() }, { state: "open" }]) {
      expect(taskCommandSchema.safeParse({ ...transfer, ...change }).success).toBe(false);
    }
  });
  test("requires scope, actor, queue, revision and observation time in a queue cursor", () => {
    const input = { organizationId: randomUUID(), correlationId: randomUUID(), queue: "overdue", cursor: {
      organizationId: randomUUID(), actorIdentityId: randomUUID(), queue: "overdue", version: 3,
      afterId: randomUUID(), asOf: "2026-10-03T10:00:00.000Z" } };
    expect(taskQueueReadSchema.safeParse(input).success).toBe(true);
    for (const key of Object.keys(input.cursor)) {
      const cursor: Record<string, unknown> = { ...input.cursor }; delete cursor[key];
      expect(taskQueueReadSchema.safeParse({ ...input, cursor }).success).toBe(false);
    }
    expect(taskQueueReadSchema.safeParse({ ...input, cursor: { ...input.cursor, privateText: "private" } }).success).toBe(false);
  });
  test("permits empty immutable history pages without invented rows", () => {
    expect(taskHistoryPageSchema.parse({ organizationId: randomUUID(), correlationId: randomUUID(), taskId: randomUUID(),
      events: [], nextRevision: null }).events).toEqual([]);
  });
});
